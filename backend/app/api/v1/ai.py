import base64
import json
from typing import Any

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.core.config import get_settings
from app.core.deps import request_id
from app.core.event_logger import event_logger


router = APIRouter()
settings = get_settings()

ALLOWED_IMAGE_TYPES = {
    "image/png": lambda content: content.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/jpeg": lambda content: content.startswith(b"\xff\xd8\xff"),
    "image/webp": lambda content: content.startswith(b"RIFF") and content[8:12] == b"WEBP",
}

TARGET_LABELS = {
    "body": "корпус термоса",
    "capTop": "верх крышки термоса",
    "capSide": "боковая поверхность крышки термоса",
}

TARGET_ASPECT_RATIOS = {
    "body": "4:3",
    "capTop": "1:1",
    "capSide": "4:3",
}


def _normalize_base_url(value: str) -> str:
    return (value or "https://routellm.abacus.ai/v1").rstrip("/")


def _data_uri(content: bytes, content_type: str) -> str:
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def _detect_image_type(content: bytes, declared_type: str = "") -> str | None:
    if declared_type in ALLOWED_IMAGE_TYPES and ALLOWED_IMAGE_TYPES[declared_type](content):
        return declared_type
    for content_type, validate in ALLOWED_IMAGE_TYPES.items():
        if validate(content):
            return content_type
    return None


async def _read_reference_images(files: list[UploadFile]) -> list[dict[str, str]]:
    images: list[dict[str, str]] = []
    for file in files[:4]:
        content = await file.read()
        content_type = _detect_image_type(content, file.content_type or "")
        if not content_type:
            raise HTTPException(status_code=400, detail="Unsupported reference image format")
        if len(content) > settings.max_logo_bytes:
            raise HTTPException(status_code=413, detail="Reference image is too large")

        images.append({
            "filename": file.filename or "reference-image",
            "data_uri": _data_uri(content, content_type),
        })

    return images


def _build_prompt(
    *,
    user_prompt: str,
    target: str,
    body_color: str,
    cap_color: str,
    reference_count: int,
) -> str:
    target_label = TARGET_LABELS.get(target, TARGET_LABELS["body"])
    if target == "body":
        reference_note = (
            "Use the uploaded logo/reference image as a brand element inside the full wrap. "
            "Preserve the logo identity, but integrate it into the overall composition instead of placing it as one small square sticker."
            if reference_count
            else "Create the full wrap from the text brief."
        )
        return (
            "Create one edge-to-edge production-ready full wrap artwork for the cylindrical body of a thermos. "
            "The output must be a wide rectangular print texture that can wrap around the entire body surface. "
            f"The artwork will be placed on: {target_label}. Thermos body color: {body_color}. Cap color: {cap_color}. "
            f"{reference_note} "
            "Design across the whole printable area, use modern composition, background graphics, patterns, gradients or brand accents as appropriate. "
            "Do not create a tiny centered sticker, do not create a mockup, do not draw a bottle, no perspective, no shadows, no extra UI. "
            "Keep the design cleanly printable with sharp edges and high contrast. "
            f"User brief: {user_prompt.strip()}"
        )

    reference_note = (
        "Use the uploaded logo/reference image as the main brand element. "
        "Preserve the logo identity and make it cleanly printable."
        if reference_count
        else "Create a clean printable decal graphic from the text brief."
    )
    return (
        "Create one flat production-ready graphic decal for a thermos configurator. "
        f"The decal will be placed on: {target_label}. "
        f"Thermos body color: {body_color}. Cap color: {cap_color}. "
        f"{reference_note} "
        "Use a transparent or plain light background when possible, centered composition, "
        "sharp edges, high contrast, no mockup, no bottle, no shadows, no perspective, "
        "no extra UI, no text unless the user explicitly asks for text. "
        f"User brief: {user_prompt.strip()}"
    )


def _is_nano_banana(model: str) -> bool:
    normalized = (model or "").lower().replace("-", "_")
    return normalized in {"nano_banana", "nano_banana2", "nano_banana_pro"}


def _build_image_config(
    *,
    model: str,
    target: str,
    generated_prompt: str,
    reference_images: list[dict[str, str]],
) -> dict[str, Any]:
    aspect_ratio = TARGET_ASPECT_RATIOS.get(target, "1:1")

    if _is_nano_banana(model):
        image_config: dict[str, Any] = {"aspect_ratio": aspect_ratio}
    else:
        image_config = {
            "prompt": generated_prompt,
            "num_images": 1,
            "aspect_ratio": aspect_ratio,
        }

    if reference_images:
        image_config["image_prompt"] = [item["data_uri"] for item in reference_images]

    return image_config


def _extract_image_urls(payload: dict[str, Any]) -> list[str]:
    urls: list[str] = []

    for choice in payload.get("choices") or []:
        message = choice.get("message") or {}

        for item in message.get("images") or []:
            url = (item.get("image_url") or {}).get("url")
            if url:
                urls.append(url)

        content = message.get("content")
        if isinstance(content, list):
            for item in content:
                if item.get("type") == "image_url":
                    url = (item.get("image_url") or {}).get("url")
                    if url:
                        urls.append(url)

    return urls


def _abacus_error_detail(response: httpx.Response) -> str:
    fallback = "Abacus image generation failed"
    try:
        payload = response.json()
    except ValueError:
        text = response.text.strip()
        return text[:1200] if text else fallback

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message") or error.get("detail")
            if message:
                return str(message)[:1200]
        if isinstance(error, str):
            return error[:1200]
        message = payload.get("message") or payload.get("detail")
        if message:
            return str(message)[:1200]

    if isinstance(payload, str):
        return payload[:1200]

    return json.dumps(payload, ensure_ascii=False, default=str)[:1200]


async def _download_as_data_uri(client: httpx.AsyncClient, image_url: str) -> str:
    if image_url.startswith("data:image/"):
        return image_url
    if not image_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=502, detail="AI returned an unsupported image URL")

    response = await client.get(image_url)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "image/png").split(";")[0]
    if content_type not in ALLOWED_IMAGE_TYPES:
        content_type = "image/png"
    return _data_uri(response.content, content_type)


@router.post("/thermos-design")
async def generate_thermos_design(
    request: Request,
    prompt: str = Form(...),
    target: str = Form("body"),
    body_color: str = Form("#E65405"),
    cap_color: str = Form("#E65405"),
    files: list[UploadFile] | None = File(default=None),
):
    if not settings.abacus_api_key:
        raise HTTPException(status_code=503, detail="Abacus API key is not configured")
    if target not in TARGET_LABELS:
        raise HTTPException(status_code=400, detail="Unsupported thermos target")
    uploaded_files = files or []
    if not prompt.strip() and not uploaded_files:
        raise HTTPException(status_code=400, detail="Prompt or reference image is required")

    reference_images = await _read_reference_images(uploaded_files)
    generated_prompt = _build_prompt(
        user_prompt=prompt,
        target=target,
        body_color=body_color,
        cap_color=cap_color,
        reference_count=len(reference_images),
    )
    image_config = _build_image_config(
        model=settings.abacus_image_model,
        target=target,
        generated_prompt=generated_prompt,
        reference_images=reference_images,
    )

    abacus_payload = {
        "model": settings.abacus_image_model,
        "messages": [{"role": "user", "content": generated_prompt}],
        "modalities": ["image"],
        "image_config": image_config,
    }
    headers = {
        "Authorization": f"Bearer {settings.abacus_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.abacus_timeout_seconds) as client:
            response = await client.post(
                f"{_normalize_base_url(settings.abacus_base_url)}/chat/completions",
                headers=headers,
                json=abacus_payload,
            )
            response.raise_for_status()
            data = response.json()
            image_urls = _extract_image_urls(data)
            if not image_urls:
                raise HTTPException(status_code=502, detail="AI response did not contain an image")
            image_data_url = await _download_as_data_uri(client, image_urls[0])
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        detail = _abacus_error_detail(exc.response)
        event_logger.log(
            "AI_THERMOS_DESIGN_FAILED",
            "Abacus RouteLLM returned an error",
            direction="backend->external",
            method=request.method,
            path=request.url.path,
            status_code=exc.response.status_code,
            request_id=request_id(request),
            entity_type="ai_thermos_design",
            details={
                "target": target,
                "model": settings.abacus_image_model,
                "abacus_status": exc.response.status_code,
                "abacus_detail": detail,
            },
        )
        raise HTTPException(status_code=502, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not reach Abacus image API") from exc

    event_logger.log(
        "AI_THERMOS_DESIGN_GENERATED",
        "Generated thermos decal through Abacus RouteLLM",
        direction="backend->external",
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
        entity_type="ai_thermos_design",
        details={
            "target": target,
            "model": settings.abacus_image_model,
            "reference_count": len(reference_images),
        },
    )
    return {
        "image": image_data_url,
        "filename": f"ai-{target}-design.png",
        "target": target,
        "prompt": generated_prompt,
        "model": settings.abacus_image_model,
    }
