from fastapi import APIRouter, Depends
from fastapi_pagination import Page, paginate
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_admin_user
from app.core.event_logger import event_logger
from app.crud import order as crud_order
from app.database import get_db
from app.schemas.admin import OrderTypeListResponse, OrderTypeResponse, OrderTypeUpdate
from app.schemas.order import OrderResponse
from app.services import order_type_store


router = APIRouter(dependencies=[Depends(get_admin_user)])


@router.get("/orders", response_model=Page[OrderResponse])
async def get_admin_orders(db: AsyncSession = Depends(get_db)):
    orders = await crud_order.get_all(db)
    return paginate(orders)


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

