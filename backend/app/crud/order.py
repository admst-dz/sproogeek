from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm.attributes import flag_modified
from app.models.order import Order
from app.schemas.order import OrderCreate
from datetime import datetime, timezone
from typing import Optional


async def create_order(db: AsyncSession, order: OrderCreate):
    data = order.model_dump()
    data['stage_history'] = [{
        "status": "new",
        "comment": "Заказ принят системой, ожидайте обработки",
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


async def get_order(db: AsyncSession, order_id: str):
    result = await db.execute(select(Order).where(Order.id == order_id))
    return result.scalar_one_or_none()


async def get_all(db: AsyncSession):
    result = await db.execute(select(Order).order_by(Order.created_at.desc()))
    return result.scalars().all()


async def update_status(db: AsyncSession, order_id: str, status: str, comment: Optional[str] = None):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
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
