"""Manufacturer cabinet — production queue, equipment, techcard access."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import MANUFACTURER_ROLES, get_manufacturer_user
from app.core.event_logger import event_logger
from app.crud import order as crud_order
from app.database import get_db
from app.models.order import Order
from app.schemas.order import OrderResponse
from app.services.event_hub import event_hub


router = APIRouter(dependencies=[Depends(get_manufacturer_user)])


PRODUCTION_STATUSES = {"new", "processing", "production", "in_delivery"}


class ProductionStats(BaseModel):
    total: int = 0
    by_status: dict[str, int] = {}


@router.get("/queue", response_model=List[OrderResponse])
async def production_queue(
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(default=None, description="Filter by single status"),
):
    query = select(Order).order_by(Order.created_at.desc())
    if status:
        query = query.where(Order.status == status)
    orders = (await db.execute(query)).scalars().all()
    if not status:
        orders = [o for o in orders if (o.status or "new") in PRODUCTION_STATUSES]
    return orders


@router.get("/stats", response_model=ProductionStats)
async def production_stats(db: AsyncSession = Depends(get_db)):
    orders = await crud_order.get_all(db)
    by_status: dict[str, int] = {}
    for order in orders:
        s = order.status or "new"
        by_status[s] = by_status.get(s, 0) + 1
    return ProductionStats(total=len(orders), by_status=by_status)


class StatusPatch(BaseModel):
    status: str
    comment: Optional[str] = None


@router.patch("/orders/{order_id}/status", response_model=OrderResponse)
async def manufacturer_update_status(
    order_id: str,
    payload: StatusPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
):
    order = await crud_order.update_status(db, order_id, payload.status, payload.comment)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    event_logger.log(
        "ORDER_STATUS_CHANGED",
        "Manufacturer changed order status",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="order",
        entity_id=str(order.id),
        details={"new_status": payload.status, "comment": payload.comment},
    )
    await event_hub.publish("order.status_changed", {
        "order_id": str(order.id),
        "user_id": order.user_id,
        "user_email": order.user_email,
        "product_name": order.product_name,
        "status": order.status,
        "comment": payload.comment,
        "actor_id": current_user.id,
        "actor_role": "manufacturer",
    })
    return order
