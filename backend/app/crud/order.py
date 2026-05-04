from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm.attributes import flag_modified

from app.models.order import Order
from app.schemas.order import OrderCreate


async def create_order(
    db: AsyncSession,
    order: OrderCreate,
    processing_payload: Optional[dict] = None,
    dealer_id: Optional[str] = None,
):
    data = order.model_dump()
    data["processing_payload"] = processing_payload
    data["dealer_id"] = dealer_id
    data["stage_history"] = [{
        "status": "new",
        "comment": "Order accepted by the system, waiting for processing",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }]
    db_order = Order(**data)
    db.add(db_order)
    await db.commit()
    await db.refresh(db_order)
    return db_order


async def get_orders_by_user(db: AsyncSession, user_id: str):
    result = await db.execute(select(Order).where(Order.user_id == user_id))
    return result.scalars().all()


async def get_all(db: AsyncSession, dealer_id: Optional[str] = None):
    stmt = select(Order)
    if dealer_id:
        stmt = stmt.where(Order.dealer_id == dealer_id)
    result = await db.execute(stmt.order_by(Order.created_at.desc()))
    return result.scalars().all()


async def get_order(db: AsyncSession, order_id: str):
    result = await db.execute(select(Order).where(Order.id == order_id))
    return result.scalar_one_or_none()


async def order_belongs_to_dealer(db: AsyncSession, order_id: str, dealer_id: str) -> bool:
    stmt = select(Order.id).where(Order.id == order_id, Order.dealer_id == dealer_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def update_render_url(db: AsyncSession, order_id: str, render_url: str):
    order = await get_order(db, order_id)
    if order and order.processing_payload:
        payload = dict(order.processing_payload)
        payload["media"] = {**(payload.get("media") or {}), "render_url": render_url}
        order.processing_payload = payload
        flag_modified(order, "processing_payload")
        await db.commit()
    return order


async def update_price(db: AsyncSession, order_id: str, dealer_price: float, dealer_comment: Optional[str] = None):
    order = await get_order(db, order_id)
    if order:
        order.total_price = dealer_price
        if dealer_comment:
            conf = dict(order.configuration or {})
            conf["dealer_price_comment"] = dealer_comment
            order.configuration = conf
            flag_modified(order, "configuration")
        order.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(order)
    return order


async def update_status(db: AsyncSession, order_id: str, status: str, comment: Optional[str] = None):
    order = await get_order(db, order_id)
    if order:
        order.status = status
        history = list(order.stage_history or [])
        entry = {
            "status": status,
            "comment": comment or "",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        history.append(entry)
        order.stage_history = history
        flag_modified(order, "stage_history")
        await db.commit()
        await db.refresh(order)
    return order
