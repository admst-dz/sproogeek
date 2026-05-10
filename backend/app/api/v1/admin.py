import uuid
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from fastapi_pagination import Page, Params
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_admin_user
from app.core.event_logger import event_logger
from app.core.security import hash_password_async
from app.crud import order as crud_order
from app.crud import user as crud_user
from app.database import get_db
from app.models.order import Order
from app.models.user import User
from app.schemas.admin import (
    AdminStatsResponse,
    OrderAdminUpdate,
    OrderTypeListResponse,
    OrderTypeResponse,
    OrderTypeUpdate,
    UserAdminCreate,
    UserAdminPasswordReset,
    UserAdminPatch,
    UserAdminResponse,
)
from app.schemas.order import OrderResponse
from app.services import order_type_store
from app.core.security_utils import safe_filename, safe_path_segment
from app.services.event_hub import event_hub
from app.services.techcard_client import fetch_techcard_pdf, generate_techcard


router = APIRouter(dependencies=[Depends(get_admin_user)])


def _to_user_response(user: User, stats_map: dict | None = None) -> dict:
    """Сериализует юзера + статистику заказов в формат UserAdminResponse."""
    stats = (stats_map or {}).get(user.id) or {}
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "sub_role": user.sub_role,
        "token_balance": user.token_balance or 0.0,
        "company_name": user.company_name,
        "has_password": bool(user.password_hash),
        "orders_count": int(stats.get("count", 0)),
        "last_order_at": stats.get("last_at"),
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


@router.get("/users", response_model=List[UserAdminResponse])
async def get_admin_users(
    db: AsyncSession = Depends(get_db),
    role: Optional[str] = Query(default=None, max_length=32, description="Фильтр по роли"),
    search: Optional[str] = Query(default=None, max_length=120, description="Поиск по email/имени/компании"),
):
    users = await crud_user.get_all_users(db)
    if role:
        users = [u for u in users if u.role == role]
    if search:
        needle = search.strip().lower()
        if needle:
            users = [
                u for u in users
                if needle in (u.email or "").lower()
                or needle in (u.display_name or "").lower()
                or needle in (u.company_name or "").lower()
            ]
    stats_map = await crud_user.order_stats_for_users(db, [u.id for u in users])
    return [_to_user_response(u, stats_map) for u in users]


@router.get("/users/{user_id}", response_model=UserAdminResponse)
async def get_admin_user_detail(user_id: str, db: AsyncSession = Depends(get_db)):
    user = await crud_user.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    stats_map = await crud_user.order_stats_for_users(db, [user.id])
    return _to_user_response(user, stats_map)


@router.post("/users", response_model=UserAdminResponse, status_code=201)
async def create_admin_user(
    payload: UserAdminCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_admin_user),
):
    email = payload.email.lower()
    if await crud_user.get_user_by_email(db, email):
        raise HTTPException(status_code=409, detail="Email already registered")

    user = await crud_user.create_user(
        db,
        id=str(uuid.uuid4()),
        email=email,
        password_hash=await hash_password_async(payload.password),
        display_name=payload.display_name or "",
        role=payload.role,
        sub_role=payload.sub_role,
        company_name=payload.company_name,
        token_balance=payload.token_balance or 0.0,
    )
    event_logger.log(
        "USER_CREATED_BY_ADMIN",
        "Admin created a user account",
        direction="admin->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="user",
        entity_id=user.id,
        details={"role": user.role, "sub_role": user.sub_role, "email": user.email},
    )
    return _to_user_response(user)


@router.patch("/users/{user_id}", response_model=UserAdminResponse)
async def patch_admin_user(
    user_id: str,
    payload: UserAdminPatch,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_admin_user),
):
    user = await crud_user.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    updates = payload.model_dump(exclude_unset=True)

    # Защита от self-lockout: админ не может разжаловать сам себя.
    if user.id == current_user.id and "role" in updates and updates["role"] != user.role:
        raise HTTPException(
            status_code=400,
            detail="You cannot change your own role through this panel",
        )
    # Owner недосягаем для обычного admin.
    if user.role == "owner" and current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Cannot modify owner account")

    user = await crud_user.update_user(db, user, updates)
    stats_map = await crud_user.order_stats_for_users(db, [user.id])
    event_logger.log(
        "USER_UPDATED_BY_ADMIN",
        "Admin updated a user account",
        direction="admin->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="user",
        entity_id=user.id,
        details={"fields": sorted(updates.keys())},
    )
    return _to_user_response(user, stats_map)


@router.post("/users/{user_id}/reset-password", response_model=UserAdminResponse)
async def reset_admin_user_password(
    user_id: str,
    payload: UserAdminPasswordReset,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_admin_user),
):
    user = await crud_user.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "owner" and current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Cannot reset password for owner")

    user = await crud_user.update_user(db, user, {"password_hash": await hash_password_async(payload.password)})
    stats_map = await crud_user.order_stats_for_users(db, [user.id])
    event_logger.log(
        "USER_PASSWORD_RESET_BY_ADMIN",
        "Admin reset a user password",
        direction="admin->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="user",
        entity_id=user.id,
    )
    return _to_user_response(user, stats_map)


@router.delete("/users/{user_id}", status_code=204)
async def delete_admin_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_admin_user),
):
    user = await crud_user.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if user.role == "owner" and current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Cannot delete owner account")

    await crud_user.delete_user(db, user)
    event_logger.log(
        "USER_DELETED_BY_ADMIN",
        "Admin deleted a user account",
        direction="admin->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="user",
        entity_id=user_id,
        details={"deleted_email": user.email, "deleted_role": user.role},
    )
    return Response(status_code=204)


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(db: AsyncSession = Depends(get_db)):
    overview = await crud_user.stats_overview(db)
    return AdminStatsResponse(
        users_total=overview["users_total"],
        users_by_role=overview["users_by_role"],
        orders_total=overview["orders_total"],
        orders_by_status=overview["orders_by_status"],
        revenue_total=overview["revenue_total"],
        new_users_last_30d=overview["new_users_last_30d"],
        new_orders_last_30d=overview["new_orders_last_30d"],
    )


@router.get("/orders", response_model=Page[OrderResponse])
async def get_admin_orders(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=500),
):
    query = select(Order).order_by(Order.created_at.desc())
    return await paginate(db, query, params=Params(page=page, size=size))


@router.patch("/orders/{order_id}", response_model=OrderResponse)
async def update_admin_order(
    order_id: str,
    payload: OrderAdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_admin_user),
):
    data = payload.model_dump(exclude_unset=True)
    order = await crud_order.update_admin_fields(db, order_id, data)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    event_logger.log(
        "ORDER_ADMIN_UPDATED",
        "Admin updated order data",
        direction="admin->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="order",
        entity_id=order_id,
        details={"fields": sorted(data.keys())},
    )
    await event_hub.publish("order.updated", {
        "order_id": str(order.id),
        "user_id": order.user_id,
        "user_email": order.user_email,
        "product_name": order.product_name,
        "status": order.status,
        "actor_id": current_user.id,
    })
    return order


@router.post("/orders/{order_id}/techcard")
async def create_order_techcard(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_admin_user),
):
    safe_path_segment(order_id)
    order = await crud_order.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    try:
        result = await generate_techcard(order, db)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"techcard service unavailable: {exc}") from exc

    event_logger.log(
        "ORDER_TECHCARD_GENERATED",
        "Admin generated tech card for order",
        direction="admin->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="order",
        entity_id=order_id,
        details={"s3_key": result.get("s3_key"), "bytes": result.get("bytes")},
    )
    return result


@router.get("/orders/{order_id}/techcard.pdf")
async def download_order_techcard(
    order_id: str,
    filename: str = Query(..., min_length=1, max_length=255),
    current_user=Depends(get_admin_user),
):
    safe_id = safe_path_segment(order_id)
    safe_name = safe_filename(filename)
    try:
        data = await fetch_techcard_pdf(safe_id, safe_name)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=404, detail=f"techcard not found: {exc}") from exc
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.get("/order-types", response_model=OrderTypeListResponse)
async def list_order_type_files():
    return {"items": order_type_store.list_order_types()}


@router.get("/order-types/{type_id}", response_model=OrderTypeResponse)
async def get_order_type_file(type_id: str):
    return {"id": type_id, "data": order_type_store.read_order_type(type_id)}


@router.put("/order-types/{type_id}", response_model=OrderTypeResponse)
async def update_order_type_file(type_id: str, payload: OrderTypeUpdate, current_user=Depends(get_admin_user)):
    data = order_type_store.write_order_type(type_id, payload.data)
    event_logger.log(
        "ORDER_TYPE_JSON_UPDATED",
        "Admin updated order type JSON file",
        direction="admin->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        entity_type="order_type_json",
        entity_id=type_id,
        details={"keys": sorted(data.keys())},
    )
    return {"id": type_id, "data": data}
