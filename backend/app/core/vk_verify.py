from urllib.parse import urlencode

import httpx

from app.core.config import get_settings


VK_AUTHORIZE_URL = "https://oauth.vk.com/authorize"
VK_TOKEN_URL = "https://oauth.vk.com/access_token"
VK_USERS_GET_URL = "https://api.vk.com/method/users.get"
VK_API_VERSION = "5.199"
VK_SCOPE = "email"


def build_vk_authorize_url(redirect_uri: str, state: str) -> str:
    settings = get_settings()
    if not settings.vk_client_id:
        raise ValueError("VK OAuth is not configured")

    query = urlencode(
        {
            "client_id": settings.vk_client_id,
            "redirect_uri": redirect_uri,
            "display": "popup",
            "scope": VK_SCOPE,
            "response_type": "code",
            "state": state,
            "v": VK_API_VERSION,
        }
    )
    return f"{VK_AUTHORIZE_URL}?{query}"


async def exchange_vk_code(code: str, redirect_uri: str) -> dict:
    settings = get_settings()
    if not settings.vk_client_id or not settings.vk_client_secret:
        raise ValueError("VK OAuth is not configured")

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.get(
            VK_TOKEN_URL,
            params={
                "client_id": settings.vk_client_id,
                "client_secret": settings.vk_client_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )
        if token_resp.status_code != 200:
            raise ValueError("VK token exchange failed")

        token_payload = token_resp.json()
        if token_payload.get("error"):
            raise ValueError("VK token exchange failed")

        access_token = token_payload.get("access_token")
        vk_user_id = token_payload.get("user_id")
        if not access_token or not vk_user_id:
            raise ValueError("No access_token or user_id in VK response")

        userinfo_resp = await client.get(
            VK_USERS_GET_URL,
            params={
                "access_token": access_token,
                "user_ids": vk_user_id,
                "fields": "screen_name,photo_200",
                "v": VK_API_VERSION,
            },
        )
        if userinfo_resp.status_code != 200:
            raise ValueError("Failed to get user info from VK")

        userinfo_payload = userinfo_resp.json()
        if userinfo_payload.get("error"):
            raise ValueError("Failed to get user info from VK")

        profiles = userinfo_payload.get("response") or []
        if not profiles:
            raise ValueError("VK profile not found")

        profile = profiles[0]
        profile["email"] = str(token_payload.get("email") or "").strip().lower()
        profile["access_token_expires_in"] = token_payload.get("expires_in")
        return profile


def extract_vk_email(payload: dict) -> str:
    return str(payload.get("email") or "").strip().lower()


def extract_vk_display_name(payload: dict) -> str:
    first_name = str(payload.get("first_name") or "").strip()
    last_name = str(payload.get("last_name") or "").strip()
    full_name = f"{first_name} {last_name}".strip()
    return full_name or str(payload.get("screen_name") or "").strip()
