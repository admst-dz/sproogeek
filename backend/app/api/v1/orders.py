import os
import uuid
from typing import Optional

import httpx
import sentry_sdk
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi_pagination import Page, paginate
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.event_logger import event_logger
from app.core.kafka import kafka_producer
from app.crud import order as crud_order
from app.database import get_db
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderResponse, OrderStatusUpdate
from app.services.order_service import OrderService


router = APIRouter()

os.makedirs("uploads/renders", exist_ok=True)


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


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


async def generate_backend_render(config: dict, request_id: str = "") -> Optional[str]:
    event_logger.log(
        "RENDER_REQUEST_STARTED",
        "Backend requested render from renderer container",
        direction="backend->renderer",
        peer="renderer:3000",
        request_id=request_id,
        details={"config_keys": sorted((config or {}).keys())},
    )
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post("http://renderer:3000/render", json={"config": config}, timeout=20.0)
            res.raise_for_status()

            filename = f"render_{uuid.uuid4().hex}.png"
            filepath = f"uploads/renders/{filename}"
            with open(filepath, "wb") as file:
                file.write(res.content)

            render_url = f"/uploads/renders/{filename}"
            event_logger.log(
                "RENDER_REQUEST_COMPLETED",
                "Renderer container returned image",
                direction="renderer->backend",
                peer="renderer:3000",
                status_code=res.status_code,
                request_id=request_id,
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
            peer="renderer:3000",
            status_code=500,
            request_id=request_id,
            details={"error_type": type(exc).__name__},
        )
        return None


async def _send_order_event(topic: str, message: dict, request_id: str = "") -> None:
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
            request_id=request_id,
            details={"error_type": type(exc).__name__, "message": message},
        )


@router.post("/", response_model=OrderResponse)
async def create_order(
    request: Request,
    order: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    request_id = _request_id(request)
    config_for_3d = order.configuration.get("productConfig", {})
    render_url = await generate_backend_render(config_for_3d, request_id)

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
        request_id=request_id,
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
        request_id=request_id,
    )

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
        request_id=_request_id(request),
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
        request_id=_request_id(request),
    )

    return order
