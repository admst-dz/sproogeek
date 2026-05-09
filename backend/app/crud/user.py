from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.user import User


async def get_user(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_yandex_id(db: AsyncSession, yandex_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.yandex_id == yandex_id))
    return result.scalar_one_or_none()


async def get_all_users(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


async def create_user(db: AsyncSession, **fields: Any) -> User:
    user = User(**fields)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_user(
    db: AsyncSession, user: User, updates: Dict[str, Any]
) -> User:
    for key, value in updates.items():
        setattr(user, key, value)
    user.updated_at = datetime.now(timezone.utc)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user: User) -> None:
    await db.delete(user)
    await db.commit()


async def order_stats_for_users(
    db: AsyncSession, user_ids: list[str]
) -> Dict[str, Dict[str, Any]]:
    """Агрегирует количество заказов и дату последнего заказа для списка юзеров.

    Возвращает map user_id → {"count": N, "last_at": datetime|None}.
    Один SQL вместо N+1 запросов из админки.
    """
    if not user_ids:
        return {}
    result = await db.execute(
        select(
            Order.user_id,
            func.count(Order.id).label("count"),
            func.max(Order.created_at).label("last_at"),
        )
        .where(Order.user_id.in_(user_ids))
        .group_by(Order.user_id)
    )
    return {
        row.user_id: {"count": int(row.count or 0), "last_at": row.last_at}
        for row in result.all()
    }


async def stats_overview(db: AsyncSession) -> Dict[str, Any]:
    """Сводная статистика для дашборда админа."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)

    users_total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    orders_total = (await db.execute(select(func.count(Order.id)))).scalar() or 0
    revenue_total = (
        await db.execute(select(func.coalesce(func.sum(Order.total_price), 0.0)))
    ).scalar() or 0.0

    new_users_30d = (
        await db.execute(
            select(func.count(User.id)).where(User.created_at >= cutoff)
        )
    ).scalar() or 0
    new_orders_30d = (
        await db.execute(
            select(func.count(Order.id)).where(Order.created_at >= cutoff)
        )
    ).scalar() or 0

    by_role_rows = (
        await db.execute(
            select(User.role, func.count(User.id)).group_by(User.role)
        )
    ).all()
    by_status_rows = (
        await db.execute(
            select(Order.status, func.count(Order.id)).group_by(Order.status)
        )
    ).all()

    return {
        "users_total": int(users_total),
        "orders_total": int(orders_total),
        "revenue_total": float(revenue_total),
        "new_users_last_30d": int(new_users_30d),
        "new_orders_last_30d": int(new_orders_30d),
        "users_by_role": [
            {"role": role or "unknown", "count": int(count)}
            for role, count in by_role_rows
        ],
        "orders_by_status": [
            {"role": status or "unknown", "count": int(count)}
            for status, count in by_status_rows
        ],
    }
