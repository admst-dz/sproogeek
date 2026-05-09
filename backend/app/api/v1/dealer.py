"""Dealer cabinet endpoints — clients list, summary, etc."""
from __future__ import annotations

from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.orders import _extract_dealer_id
from app.core.deps import get_current_user
from app.database import get_db
from app.models.order import Order
from app.models.user import User


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


@router.get("/clients", response_model=List[DealerClient])
async def list_dealer_clients(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Clients linked to this dealer/typography.

    A client becomes visible here after they choose this typography's quote.
    Older product-owned orders are kept visible for backward compatibility.
    """
    _ensure_dealer(current_user)

    orders = (await db.execute(select(Order))).scalars().all()
    if current_user.role == "dealer":
        orders = [
            o for o in orders
            if o.selected_manufacturer_id == current_user.id or _extract_dealer_id(o) == current_user.id
        ]

    by_user: dict[str, list[Order]] = defaultdict(list)
    for order in orders:
        if order.user_id:
            by_user[order.user_id].append(order)

    if not by_user:
        return []

    users = (
        await db.execute(select(User).where(User.id.in_(list(by_user.keys()))))
    ).scalars().all()

    out: list[DealerClient] = []
    for user in users:
        user_orders = by_user[user.id]
        last = max((o.created_at for o in user_orders if o.created_at), default=None)
        out.append(
            DealerClient(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                company_name=user.company_name,
                role=user.role,
                sub_role=user.sub_role,
                orders_count=len(user_orders),
                last_order_at=last.isoformat() if last else None,
            )
        )
    out.sort(key=lambda c: c.last_order_at or "", reverse=True)
    return out
