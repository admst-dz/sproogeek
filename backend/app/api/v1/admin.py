from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_pagination import Page, Params
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_admin_user
from app.core.event_logger import event_logger
from app.crud import order as crud_order
from app.crud import user as crud_user
from app.database import get_db
from app.models.order import Order
from app.schemas.admin import (
    OrderAdminUpdate,
    OrderTypeListResponse,
    OrderTypeResponse,
    OrderTypeUpdate,
    UserAdminResponse,
)
from app.schemas.order import OrderResponse
from app.services import order_type_store


router = APIRouter(dependencies=[Depends(get_admin_user)])


@router.get("/users", response_model=List[UserAdminResponse])
async def get_admin_users(db: AsyncSession = Depends(get_db)):
    return await crud_user.get_all_users(db)


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
    return order


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
