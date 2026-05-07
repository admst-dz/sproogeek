"""Manufacturer cabinet — production queue, equipment, techcard access."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import MANUFACTURER_ROLES, get_manufacturer_user
from app.core.event_logger import event_logger
from app.core.security_utils import safe_path_segment, validate_status
from app.crud import order as crud_order
from app.database import get_db
from app.models.order import Order
from app.schemas.order import OrderResponse
from app.services.event_hub import event_hub
from app.services.imposition import plan_for_order, qr_png_bytes
from app.services.warehouse import deduct_for_order, list_materials, low_stock, topup


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
    validate_status(payload.status)
    order = await crud_order.update_status(db, order_id, payload.status, payload.comment)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    deduction_summary = None
    if payload.status == "production":
        try:
            deduction_summary = await deduct_for_order(db, order)
        except Exception as exc:  # noqa: BLE001 — log only, don't fail the status change
            event_logger.log(
                "WAREHOUSE_DEDUCT_FAILED",
                "Auto-deduct failed for order pushed to production",
                direction="backend",
                actor_id=current_user.id, actor_type=current_user.role,
                entity_type="order", entity_id=str(order.id),
                details={"error": str(exc)},
            )

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
        "warehouse_deductions": deduction_summary,
    })
    return order


# ─── Warehouse endpoints ──────────────────────────────────────────────────────


class MaterialOut(BaseModel):
    id: str
    name: str
    unit: str
    stock_qty: float
    reorder_threshold: float
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class MaterialTopup(BaseModel):
    qty: float
    reason: Optional[str] = "topup"


@router.get("/materials", response_model=List[MaterialOut])
async def materials(db: AsyncSession = Depends(get_db)):
    return await list_materials(db)


@router.get("/materials/low", response_model=List[MaterialOut])
async def materials_low(db: AsyncSession = Depends(get_db)):
    return await low_stock(db)


@router.post("/materials/{material_id}/topup", response_model=MaterialOut)
async def materials_topup(material_id: str, payload: MaterialTopup, db: AsyncSession = Depends(get_db)):
    if payload.qty <= 0:
        raise HTTPException(status_code=422, detail="qty must be positive")
    try:
        return await topup(db, material_id, payload.qty, payload.reason or "topup")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ─── Imposition / SRA3 + QR ───────────────────────────────────────────────────


@router.get("/orders/{order_id}/imposition")
async def order_imposition_plan(
    order_id: str,
    db: AsyncSession = Depends(get_db),
):
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return plan_for_order(order)


@router.get("/orders/{order_id}/qr.png")
async def order_qr(
    order_id: str,
    db: AsyncSession = Depends(get_db),
):
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    payload = f"spruzhyk://order/{order.id}|{order.status or 'new'}"
    png = qr_png_bytes(payload)
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=60"},
    )
