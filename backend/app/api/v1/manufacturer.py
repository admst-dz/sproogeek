"""Manufacturer cabinet — production queue, equipment, techcard access."""
from __future__ import annotations

from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime, timezone

from app.core.deps import get_manufacturer_user
from app.core.event_logger import event_logger
from app.core.security_utils import safe_filename, safe_path_segment, validate_status
from app.crud import order as crud_order
from app.database import get_db
from app.models.order import Order
from app.schemas.order import OrderResponse
from app.services.event_hub import event_hub
from app.services.imposition import plan_for_order, qr_png_bytes
from app.services.glb_unwrapper_client import (
    GlbUnwrapperError,
    export_print_kit,
    resolve_model_name,
)
from app.services.techcard_client import fetch_techcard_pdf, generate_techcard
from app.services.warehouse import deduct_for_order, list_materials, low_stock, topup


router = APIRouter(dependencies=[Depends(get_manufacturer_user)])


QUOTE_STATUSES = {"awaiting_quotes", "quotes_ready"}
PRODUCTION_STATUSES = {"processing", "production", "in_delivery"}


def _visible_for_manufacturer(order: Order, user) -> bool:
    if user.role in {"admin", "owner"}:
        return True
    return (
        (order.status in QUOTE_STATUSES and order.signed_approval_file_key and not order.selected_manufacturer_id)
        or order.selected_manufacturer_id == user.id
    )


class ProductionStats(BaseModel):
    total: int = 0
    by_status: dict[str, int] = {}


@router.get("/queue", response_model=List[OrderResponse])
async def production_queue(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
    status: Optional[str] = Query(default=None, description="Filter by single status"),
):
    query = select(Order).order_by(Order.created_at.desc())
    if status:
        query = query.where(Order.status == status)
    orders = (await db.execute(query)).scalars().all()
    if not status:
        orders = [o for o in orders if (o.status or "new") in QUOTE_STATUSES | PRODUCTION_STATUSES]
    orders = [order for order in orders if _visible_for_manufacturer(order, current_user)]
    return orders


@router.get("/stats", response_model=ProductionStats)
async def production_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
):
    orders = [
        order for order in await crud_order.get_all(db)
        if _visible_for_manufacturer(order, current_user)
    ]
    by_status: dict[str, int] = {}
    for order in orders:
        s = order.status or "new"
        by_status[s] = by_status.get(s, 0) + 1
    return ProductionStats(total=len(orders), by_status=by_status)


class StatusPatch(BaseModel):
    status: str
    comment: Optional[str] = None


class ManufacturerQuoteIn(BaseModel):
    price: float = Field(..., ge=0, le=1_000_000_000)
    production_days: int = Field(..., ge=1, le=365)
    comment: Optional[str] = Field(None, max_length=1000)


@router.post("/orders/{order_id}/quote", response_model=OrderResponse)
async def submit_manufacturer_quote(
    order_id: str,
    payload: ManufacturerQuoteIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
):
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.approval_status != "approved" or not order.signed_approval_file_key:
        raise HTTPException(status_code=409, detail="Signed client approval is required before quotes")
    if order.selected_manufacturer_id:
        raise HTTPException(status_code=409, detail="Manufacturer is already selected")
    if order.status not in QUOTE_STATUSES:
        raise HTTPException(status_code=409, detail="Order is not open for manufacturer quotes")

    now = datetime.now(timezone.utc).isoformat()
    quotes = list(order.manufacturer_quotes or [])
    existing = next((q for q in quotes if q.get("manufacturer_id") == current_user.id), None)
    quote_data = {
        "id": existing.get("id") if existing else uuid4().hex,
        "manufacturer_id": current_user.id,
        "manufacturer_name": current_user.company_name or current_user.display_name or current_user.email,
        "price": payload.price,
        "currency": order.currency or "BYN",
        "production_days": payload.production_days,
        "comment": payload.comment,
        "created_at": existing.get("created_at") if existing else now,
        "updated_at": now,
    }
    if existing:
        existing.update(quote_data)
    else:
        quotes.append(quote_data)
    order.manufacturer_quotes = quotes
    flag_modified(order, "manufacturer_quotes")

    if order.status == "awaiting_quotes":
        await crud_order.update_status(db, order_id, "quotes_ready", "Типография предложила цену и срок")
    else:
        await db.commit()
        await db.refresh(order)

    event_logger.log(
        "ORDER_MANUFACTURER_QUOTE_SUBMITTED",
        "Manufacturer submitted order quote",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="order",
        entity_id=str(order.id),
        request_id=getattr(request.state, "request_id", ""),
        details={"price": payload.price, "production_days": payload.production_days},
    )
    await event_hub.publish("order.quote_submitted", {
        "order_id": str(order.id),
        "user_id": order.user_id,
        "user_email": order.user_email,
        "product_name": order.product_name,
        "status": order.status,
        "manufacturer_id": current_user.id,
    })
    return order


@router.patch("/orders/{order_id}/status", response_model=OrderResponse)
async def manufacturer_update_status(
    order_id: str,
    payload: StatusPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
):
    validate_status(payload.status)
    existing = await crud_order.get_order(db, order_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")
    if current_user.role in {"manufacturer", "dealer"} and existing.selected_manufacturer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Order is assigned to another manufacturer")
    if existing.status in QUOTE_STATUSES:
        raise HTTPException(status_code=409, detail="Client must select a manufacturer before production status changes")
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
    items = await _cached_materials(db)
    return items


@router.get("/materials/low", response_model=List[MaterialOut])
async def materials_low(db: AsyncSession = Depends(get_db)):
    items = await _cached_materials_low(db)
    return items


@router.post("/materials/{material_id}/topup", response_model=MaterialOut)
async def materials_topup(material_id: str, payload: MaterialTopup, db: AsyncSession = Depends(get_db)):
    if payload.qty <= 0:
        raise HTTPException(status_code=422, detail="qty must be positive")
    try:
        result = await topup(db, material_id, payload.qty, payload.reason or "topup")
        # Инвалидируем кеш материалов после изменения остатков.
        from app.core.cache import invalidate
        await invalidate("materials")
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ─── Cached read helpers (TTL 60s; короткий т.к. остатки часто двигаются) ──────

from app.core.cache import cached  # noqa: E402


@cached(prefix="materials", ttl=60)
async def _cached_materials(db: AsyncSession):
    rows = await list_materials(db)
    return [MaterialOut.model_validate(r).model_dump(mode="json") for r in rows]


@cached(prefix="materials", ttl=60)
async def _cached_materials_low(db: AsyncSession):
    rows = await low_stock(db)
    return [MaterialOut.model_validate(r).model_dump(mode="json") for r in rows]


# ─── Imposition / SRA3 + QR ───────────────────────────────────────────────────


@router.get("/orders/{order_id}/imposition")
async def order_imposition_plan(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
):
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _visible_for_manufacturer(order, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    return plan_for_order(order)


@router.get("/orders/{order_id}/qr.png")
async def order_qr(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
):
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _visible_for_manufacturer(order, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    payload = f"spruzhyk://order/{order.id}|{order.status or 'new'}"
    png = qr_png_bytes(payload)
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.post("/orders/{order_id}/techcard")
async def create_manufacturer_techcard(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
):
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _visible_for_manufacturer(order, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = await generate_techcard(order, db)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"techcard service unavailable: {exc}") from exc

    event_logger.log(
        "ORDER_TECHCARD_GENERATED",
        "Manufacturer generated tech card for order",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="order",
        entity_id=order_id,
        request_id=getattr(request.state, "request_id", ""),
        details={"s3_key": result.get("s3_key"), "bytes": result.get("bytes")},
    )
    return result


@router.get("/orders/{order_id}/techcard.pdf")
async def download_manufacturer_techcard(
    order_id: str,
    filename: str = Query(..., min_length=1, max_length=255),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
):
    safe_id = safe_path_segment(order_id)
    safe_name = safe_filename(filename)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _visible_for_manufacturer(order, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        data = await fetch_techcard_pdf(safe_id, safe_name)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"techcard not found: {exc}") from exc
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# ── Печатная развёртка из настоящей GLB-геометрии (C++ glb-unwrapper) ──
class PrintKitDimensions(BaseModel):
    body_diameter_mm: Optional[float] = Field(default=None, gt=0, le=500)
    body_height_mm: Optional[float] = Field(default=None, gt=0, le=1000)
    cap_diameter_mm: Optional[float] = Field(default=None, gt=0, le=500)
    cap_side_height_mm: Optional[float] = Field(default=None, gt=0, le=500)
    bleed_mm: Optional[float] = Field(default=None, ge=0, le=20)
    safe_mm: Optional[float] = Field(default=None, ge=0, le=20)
    notebook_width_mm: Optional[float] = Field(default=None, gt=0, le=500)
    notebook_height_mm: Optional[float] = Field(default=None, gt=0, le=500)
    notebook_spine_mm: Optional[float] = Field(default=None, gt=0, le=100)
    powerbank_width_mm: Optional[float] = Field(default=None, gt=0, le=300)
    powerbank_height_mm: Optional[float] = Field(default=None, gt=0, le=300)


def _resolve_order_model_name(order: Order) -> Optional[str]:
    """По данным заказа подобрать имя GLB-модели внутри glb_unwrapper-образа.

    Конфигурация заказа на сайте кладётся в configuration.productConfig либо
    configuration.cart[0].config (для мульти-айтемных корзин). Берём первый
    дизайн как репрезентативный — для производства все айтемы заказа
    обычно одного типа.
    """
    cfg = order.configuration or {}
    cart = cfg.get("cart") if isinstance(cfg.get("cart"), list) else None
    head_config = (cart[0].get("config") if cart and isinstance(cart[0], dict) else None) or cfg.get("productConfig") or cfg
    active_product = (head_config or {}).get("activeProduct") or (head_config or {}).get("type")
    binding = (head_config or {}).get("bindingType")
    return resolve_model_name(active_product or "", binding)


@router.post("/orders/{order_id}/print-kit.zip")
async def order_print_kit(
    order_id: str,
    request: Request,
    payload: Optional[PrintKitDimensions] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_manufacturer_user),
):
    """Сгенерировать print-kit (template SVG + spec JSON + README) по
    реальной GLB-геометрии заказа. Отдаёт zip-архив.
    """
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _visible_for_manufacturer(order, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    model_name = _resolve_order_model_name(order)
    if not model_name:
        raise HTTPException(
            status_code=422,
            detail="Order has no recognizable product/binding for print-kit generation",
        )

    dimensions = (payload.model_dump(exclude_none=True) if payload else {}) or {}
    try:
        zip_bytes = await export_print_kit(model_name, dimensions_mm=dimensions)
    except GlbUnwrapperError as exc:
        raise HTTPException(status_code=502, detail=f"glb_unwrapper failed: {exc}") from exc

    event_logger.log(
        "ORDER_PRINT_KIT_GENERATED",
        "Manufacturer generated print kit for order",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="order",
        entity_id=order_id,
        request_id=getattr(request.state, "request_id", ""),
        details={"model": model_name, "bytes": len(zip_bytes), "dimensions": dimensions},
    )
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="print-kit-{order_id[:8]}.zip"',
            "Cache-Control": "no-store",
        },
    )
