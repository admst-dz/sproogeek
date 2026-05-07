import os
import uuid
from typing import Optional

import httpx
import sentry_sdk
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi_pagination import Page, paginate
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user, request_id
from app.core.event_logger import event_logger
from app.core.kafka import kafka_producer
from datetime import datetime, timezone

from fastapi.responses import Response
from pydantic import BaseModel, Field as PField

from app.core.security_utils import safe_filename, safe_path_segment
from app.crud import order as crud_order
from app.database import get_db
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderResponse, OrderStatusUpdate
from app.services.event_hub import event_hub
from app.services.order_service import OrderService
from app.services.techcard_client import fetch_techcard_pdf, generate_approval


router = APIRouter()
settings = get_settings()

RENDER_DIR = "uploads/renders"
os.makedirs(RENDER_DIR, exist_ok=True)


def _extract_dealer_id(order: Order) -> Optional[str]:
    configuration = order.configuration or {}
    product_config = configuration.get("productConfig") or {}
    return (
        product_config.get("dealerId")
        or product_config.get("dealer_id")
        or configuration.get("dealerId")
        or configuration.get("dealer_id")
    )


def _filter_orders_for_dealer(orders: list[Order], dealer_id: str) -> list[Order]:
    return [order for order in orders if _extract_dealer_id(order) == dealer_id]


def _can_manage_order(order: Order, current_user) -> bool:
    if current_user.role in {"admin", "owner"}:
        return True
    if current_user.role == "dealer":
        return _extract_dealer_id(order) == current_user.id
    return False


async def generate_backend_render(config: dict, req_id: str = "") -> Optional[str]:
    event_logger.log(
        "RENDER_REQUEST_STARTED",
        "Backend requested render from renderer container",
        direction="backend->renderer",
        peer=settings.renderer_url,
        request_id=req_id,
        details={"config_keys": sorted((config or {}).keys())},
    )
    try:
        async with httpx.AsyncClient(timeout=settings.renderer_timeout_seconds) as client:
            res = await client.post(f"{settings.renderer_url}/render", json={"config": config})
            res.raise_for_status()

        filename = f"render_{uuid.uuid4().hex}.png"
        filepath = os.path.join(RENDER_DIR, filename)
        with open(filepath, "wb") as file:
            file.write(res.content)

        render_url = f"/uploads/renders/{filename}"
        event_logger.log(
            "RENDER_REQUEST_COMPLETED",
            "Renderer container returned image",
            direction="renderer->backend",
            peer=settings.renderer_url,
            status_code=res.status_code,
            request_id=req_id,
            entity_type="render",
            entity_id=filename,
            details={"bytes": len(res.content), "render_url": render_url},
        )
        return render_url
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        event_logger.log(
            "RENDER_REQUEST_FAILED",
            "Renderer container failed to generate image",
            direction="backend->renderer",
            peer=settings.renderer_url,
            status_code=500,
            request_id=req_id,
            details={"error_type": type(exc).__name__},
        )
        return None


async def _send_order_event(topic: str, message: dict, req_id: str = "") -> None:
    try:
        await kafka_producer.send_message(topic=topic, message=message)
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        event_logger.log(
            "KAFKA_MESSAGE_FAILED",
            "Backend failed to publish order event",
            direction="backend->kafka",
            entity_type="kafka_topic",
            entity_id=topic,
            request_id=req_id,
            details={"error_type": type(exc).__name__, "message": message},
        )


@router.post("/", response_model=OrderResponse)
async def create_order(
    request: Request,
    order: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    req_id = request_id(request)
    config_for_3d = order.configuration.get("productConfig", {})
    render_url = await generate_backend_render(config_for_3d, req_id)

    if render_url:
        order.configuration["server_render_url"] = render_url

    new_order = await OrderService.create_new_order(db, order, current_user.id)
    event_logger.log(
        "ORDER_CREATED",
        "User created order",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=req_id,
        entity_type="order",
        entity_id=str(new_order.id),
        details={
            "product_name": new_order.product_name,
            "quantity": new_order.quantity,
            "total_price": new_order.total_price,
            "currency": new_order.currency,
            "render_url": render_url,
        },
    )

    await _send_order_event(
        topic="order_events",
        message={
            "event_type": "ORDER_CREATED",
            "order_id": str(new_order.id),
            "user_id": current_user.id,
            "user_email": current_user.email,
            "render_url": render_url,
            "status": new_order.status,
        },
        req_id=req_id,
    )

    await event_hub.publish("order.created", {
        "order_id": str(new_order.id),
        "user_id": current_user.id,
        "user_email": current_user.email,
        "product_name": new_order.product_name,
        "status": new_order.status,
        "dealer_id": _extract_dealer_id(new_order),
        "created_at": new_order.created_at.isoformat() if new_order.created_at else None,
    })

    return new_order


@router.get("/all", response_model=Page[OrderResponse])
async def get_all_orders(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
    dealer_id: Optional[str] = Query(default=None),
):
    if current_user.role not in {"admin", "dealer", "owner"}:
        raise HTTPException(status_code=403, detail="Access denied")

    orders = await crud_order.get_all(db)
    if current_user.role == "dealer":
        orders = _filter_orders_for_dealer(orders, current_user.id)
    elif dealer_id:
        orders = _filter_orders_for_dealer(orders, dealer_id)
    return paginate(orders)


@router.get("/user/{user_id}", response_model=list[OrderResponse])
async def get_user_orders(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.id != user_id and current_user.role not in {"admin", "dealer", "owner"}:
        raise HTTPException(status_code=403, detail="Access denied")

    orders = await crud_order.get_orders_by_user(db, user_id)
    if current_user.role == "dealer":
        orders = _filter_orders_for_dealer(orders, current_user.id)
    return orders


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    request: Request,
    order_id: str,
    status_data: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing_order = await crud_order.get_order(db, order_id)
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _can_manage_order(existing_order, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    order = await crud_order.update_status(db, order_id, status_data.status, status_data.comment)
    event_logger.log(
        "ORDER_STATUS_CHANGED",
        "Staff user changed order status",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
        entity_type="order",
        entity_id=str(order.id),
        details={"new_status": status_data.status, "comment": status_data.comment},
    )

    await _send_order_event(
        topic="order_events",
        message={
            "event_type": "ORDER_STATUS_CHANGED",
            "order_id": str(order.id),
            "new_status": status_data.status,
            "comment": status_data.comment,
        },
        req_id=request_id(request),
    )

    await event_hub.publish("order.status_changed", {
        "order_id": str(order.id),
        "user_id": order.user_id,
        "user_email": order.user_email,
        "product_name": order.product_name,
        "status": order.status,
        "comment": status_data.comment,
        "dealer_id": _extract_dealer_id(order),
        "actor_id": current_user.id,
    })

    return order


# ─── Approval flow ────────────────────────────────────────────────────────────


class ApprovalDecision(BaseModel):
    comment: str | None = PField(None, max_length=1000)


def _can_view_order(order: Order, current_user) -> bool:
    if current_user.role in {"admin", "owner", "manufacturer"}:
        return True
    if current_user.role == "dealer":
        return _extract_dealer_id(order) == current_user.id
    return order.user_id == current_user.id


@router.post("/{order_id}/approval-pdf")
async def create_approval_pdf(
    request: Request,
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Generate the approval PDF (file the client signs to confirm the order)."""
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _can_view_order(order, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        meta = await generate_approval(order, db)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"approval renderer unavailable: {exc}") from exc

    order.approval_pdf_key = meta.get("s3_key")
    await db.commit()

    event_logger.log(
        "ORDER_APPROVAL_PDF_GENERATED",
        "Approval PDF generated",
        direction="user->backend",
        actor_type=current_user.role, actor_id=current_user.id, actor_email=current_user.email,
        entity_type="order", entity_id=str(order.id),
        request_id=request_id(request),
        details={"s3_key": meta.get("s3_key")},
    )
    return meta


@router.get("/{order_id}/approval.pdf")
async def download_approval_pdf(
    order_id: str,
    filename: str = Query(..., min_length=1, max_length=255),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    safe_id = safe_path_segment(order_id)
    safe_name = safe_filename(filename)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _can_view_order(order, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        data = await fetch_techcard_pdf(safe_id, safe_name)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=404, detail="approval PDF not found") from exc
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.post("/{order_id}/approve", response_model=OrderResponse)
async def client_approve_order(
    request: Request,
    order_id: str,
    payload: ApprovalDecision,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Client confirms the order online (replaces wet signature for MVP)."""
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != current_user.id and current_user.role not in {"admin", "owner"}:
        raise HTTPException(status_code=403, detail="Only the order owner can approve")

    order.approval_status = "approved"
    order.approval_comment = payload.comment
    order.approved_at = datetime.now(timezone.utc)
    if order.status in {None, "draft", "new"}:
        order.status = "processing"
    await crud_order.update_status(db, order_id, order.status, payload.comment or "Подтверждено клиентом")

    event_logger.log(
        "ORDER_APPROVED",
        "Client approved order",
        direction="user->backend",
        actor_type=current_user.role, actor_id=current_user.id, actor_email=current_user.email,
        entity_type="order", entity_id=str(order.id),
        request_id=request_id(request),
        details={"comment": payload.comment},
    )
    await event_hub.publish("order.approved", {
        "order_id": str(order.id),
        "user_id": order.user_id,
        "user_email": order.user_email,
        "product_name": order.product_name,
        "status": order.status,
        "dealer_id": _extract_dealer_id(order),
    })
    return order


@router.post("/{order_id}/reject", response_model=OrderResponse)
async def client_reject_order(
    request: Request,
    order_id: str,
    payload: ApprovalDecision,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.user_id != current_user.id and current_user.role not in {"admin", "owner"}:
        raise HTTPException(status_code=403, detail="Only the order owner can reject")

    order.approval_status = "rejected"
    order.approval_comment = payload.comment
    await crud_order.update_status(db, order_id, "rejected", payload.comment or "Отклонено клиентом")

    event_logger.log(
        "ORDER_REJECTED", "Client rejected order",
        direction="user->backend",
        actor_type=current_user.role, actor_id=current_user.id, actor_email=current_user.email,
        entity_type="order", entity_id=str(order.id),
        request_id=request_id(request),
    )
    await event_hub.publish("order.rejected", {
        "order_id": str(order.id),
        "user_id": order.user_id,
        "user_email": order.user_email,
        "status": order.status,
        "dealer_id": _extract_dealer_id(order),
    })
    return order


@router.post("/{order_id}/dealer-confirm", response_model=OrderResponse)
async def dealer_confirm_to_production(
    request: Request,
    order_id: str,
    payload: ApprovalDecision,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Dealer reviews approved order and pushes it to production."""
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _can_manage_order(order, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    if order.approval_status != "approved":
        raise HTTPException(status_code=409, detail="Order is not approved by client yet")

    order.dealer_confirmed_at = datetime.now(timezone.utc)
    await crud_order.update_status(db, order_id, "production", payload.comment or "Передано в производство дилером")

    event_logger.log(
        "ORDER_TO_PRODUCTION", "Dealer pushed order to production",
        direction="user->backend",
        actor_type=current_user.role, actor_id=current_user.id, actor_email=current_user.email,
        entity_type="order", entity_id=str(order.id),
        request_id=request_id(request),
    )
    await event_hub.publish("order.status_changed", {
        "order_id": str(order.id),
        "user_id": order.user_id,
        "user_email": order.user_email,
        "product_name": order.product_name,
        "status": "production",
        "comment": payload.comment,
        "dealer_id": _extract_dealer_id(order),
        "actor_id": current_user.id,
        "actor_role": "dealer",
    })
    return order
