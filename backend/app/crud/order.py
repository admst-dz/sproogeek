from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.order import Order
from app.schemas.order import OrderCreate


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _append_history(order: Order, status: str, comment: str) -> None:
    history = list(order.stage_history or [])
    history.append({"status": status, "comment": comment, "updated_at": _now_iso()})
    order.stage_history = history
    flag_modified(order, "stage_history")


async def create_order(db: AsyncSession, order: OrderCreate) -> Order:
    data = order.model_dump()
    data["stage_history"] = [
        {
            "status": "new",
            "comment": "Заказ принят системой, ожидайте обработки",
            "updated_at": _now_iso(),
        }
    ]
    db_order = Order(**data)
    db.add(db_order)
    await db.commit()
    await db.refresh(db_order)
    return db_order


async def get_orders_by_user(db: AsyncSession, user_id: str) -> list[Order]:
    result = await db.execute(select(Order).where(Order.user_id == user_id))
    return result.scalars().all()


async def get_order(db: AsyncSession, order_id: str) -> Optional[Order]:
    result = await db.execute(select(Order).where(Order.id == order_id))
    return result.scalar_one_or_none()


async def get_all(db: AsyncSession) -> list[Order]:
    result = await db.execute(select(Order).order_by(Order.created_at.desc()))
    return result.scalars().all()


async def update_status(
    db: AsyncSession, order_id: str, status: str, comment: Optional[str] = None
) -> Optional[Order]:
    order = await get_order(db, order_id)
    if not order:
        return None
    order.status = status
    _append_history(order, status, comment or "")
    await db.commit()
    await db.refresh(order)
    return order


async def update_admin_fields(
    db: AsyncSession, order_id: str, data: dict[str, Any]
) -> Optional[Order]:
    order = await get_order(db, order_id)
    if not order:
        return None

    new_status = data.get("status")
    if new_status is not None and new_status != order.status:
        order.status = new_status
        _append_history(order, new_status, "Изменено администратором")

    for field, value in data.items():
        if field == "status":
            continue
        setattr(order, field, value)
        if field == "configuration":
            flag_modified(order, "configuration")

    order.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(order)
    return order
