"""Dealer cabinet endpoints — clients list, summary, etc."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.models.order import Order
from app.models.user import User
from app.schemas.order import OrderResponse


router = APIRouter()


class DealerClient(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    company_name: Optional[str] = None
    role: str
    sub_role: Optional[str] = None
    orders_count: int = 0
    last_order_at: Optional[str] = None


def _ensure_dealer(current_user) -> None:
    if current_user.role not in {"dealer", "admin", "owner"}:
        raise HTTPException(status_code=403, detail="Access denied")


def _orders_visible_to_dealer_filter(dealer_id: str):
    """SQL-выражение «заказы, видимые дилеру».

    Это либо явно выбранный manufacturer, либо dealerId, лежащий в JSONB
    конфигурации заказа (legacy способ привязки). Достаём напрямую из
    PostgreSQL вместо выгрузки всех Order'ов в Python — было O(N) на
    каждый запрос с фильтрацией в коде.
    """
    cfg = Order.configuration
    pc = cfg["productConfig"]
    return or_(
        Order.selected_manufacturer_id == dealer_id,
        pc["dealerId"].astext == dealer_id,
        pc["dealer_id"].astext == dealer_id,
        cfg["dealerId"].astext == dealer_id,
        cfg["dealer_id"].astext == dealer_id,
    )


@router.get("/clients", response_model=List[DealerClient])
async def list_dealer_clients(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Clients linked to this dealer/typography.

    Один SQL-запрос вместо двух + python-агрегация: GROUP BY user_id с
    COUNT/MAX по заказам, привязанным к дилеру.
    """
    _ensure_dealer(current_user)

    orders_count = func.count(Order.id).label("orders_count")
    last_order_at = func.max(Order.created_at).label("last_order_at")

    stmt = (
        select(
            User.id,
            User.email,
            User.display_name,
            User.company_name,
            User.role,
            User.sub_role,
            orders_count,
            last_order_at,
        )
        .join(Order, Order.user_id == User.id)
        .group_by(User.id)
        .order_by(last_order_at.desc().nullslast())
    )
    if current_user.role == "dealer":
        stmt = stmt.where(_orders_visible_to_dealer_filter(current_user.id))

    rows = (await db.execute(stmt)).all()
    return [
        DealerClient(
            id=row.id,
            email=row.email,
            display_name=row.display_name,
            company_name=row.company_name,
            role=row.role,
            sub_role=row.sub_role,
            orders_count=row.orders_count or 0,
            last_order_at=row.last_order_at.isoformat() if row.last_order_at else None,
        )
        for row in rows
    ]


@router.get("/orders", response_model=List[OrderResponse])
async def list_dealer_selected_orders(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Orders where this typography was selected by the client."""
    _ensure_dealer(current_user)

    stmt = select(Order).order_by(Order.created_at.desc())
    if current_user.role == "dealer":
        stmt = stmt.where(Order.selected_manufacturer_id == current_user.id)
    else:
        stmt = stmt.where(Order.selected_manufacturer_id.isnot(None))
    return (await db.execute(stmt)).scalars().all()
