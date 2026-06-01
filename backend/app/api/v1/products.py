from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached, invalidate
from app.core.deps import STAFF_ROLES, get_current_user, get_current_user_optional, request_id
from app.core.event_logger import event_logger
from app.crud import product as crud_product
from app.database import get_db
from app.schemas.product import ProductCreate, ProductResponse, ProductUpdate


router = APIRouter()


_PRODUCTS_CACHE_PREFIX = "products.list"
_PRODUCTS_CACHE_TTL = 120  # 2 минуты — каталог меняется редко


def _can_manage_product(product, current_user) -> bool:
    if current_user.role in {"admin", "owner"}:
        return True
    return current_user.role == "dealer" and product.dealer_id == current_user.id


@cached(prefix=_PRODUCTS_CACHE_PREFIX, ttl=_PRODUCTS_CACHE_TTL)
async def _cached_products(dealer_id: Optional[str], product_type: Optional[str], include_inactive: bool, db: AsyncSession):
    items = (
        await crud_product.get_products_by_dealer(db, dealer_id, product_type=product_type, active_only=not include_inactive)
        if dealer_id
        else await crud_product.get_products(db, product_type=product_type, active_only=not include_inactive)
    )
    # ORM-объекты не сериализуются orjson — переводим в dict через
    # Pydantic-схему ответа, она же гарантирует стабильную форму.
    return [ProductResponse.model_validate(p, from_attributes=True).model_dump(mode="json") for p in items]


@router.get("/", response_model=list[ProductResponse])
async def get_products(
    dealer_id: Optional[str] = Query(None),
    type: Optional[str] = Query(None, description="Фильтр по типу: notebook/shopper/tshirt/hoodie/lanyard/..."),
    include_inactive: bool = Query(False, description="Staff-only: include hidden products"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    if include_inactive:
        if not current_user or current_user.role not in STAFF_ROLES:
            raise HTTPException(status_code=403, detail="Access denied")
        if current_user.role == "dealer" and dealer_id and dealer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    return await _cached_products(dealer_id, type, include_inactive, db)


@router.post("/", response_model=ProductResponse)
async def create_product(
    request: Request,
    product: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Access denied")

    if current_user.role == "dealer":
        product = product.model_copy(update={"dealerId": current_user.id})

    created = await crud_product.create_product(db, product)
    await invalidate(_PRODUCTS_CACHE_PREFIX)
    event_logger.log(
        "PRODUCT_CREATED",
        "Staff user created product configuration",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
        entity_type="product",
        entity_id=str(created.id),
        details={"dealer_id": created.dealer_id, "name": created.name},
    )
    return created


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    request: Request,
    product_id: UUID,
    product: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Access denied")

    existing = await crud_product.get_product(db, product_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    if not _can_manage_product(existing, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    updated = await crud_product.update_product(db, product_id, product)
    await invalidate(_PRODUCTS_CACHE_PREFIX)
    event_logger.log(
        "PRODUCT_UPDATED",
        "Staff user updated product configuration",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
        entity_type="product",
        entity_id=str(product_id),
        details={"dealer_id": updated.dealer_id, "name": updated.name},
    )
    return updated


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    request: Request,
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Access denied")

    existing = await crud_product.get_product(db, product_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    if not _can_manage_product(existing, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    deleted = await crud_product.delete_product(db, product_id)
    await invalidate(_PRODUCTS_CACHE_PREFIX)
    event_logger.log(
        "PRODUCT_DELETED",
        "Staff user deleted product configuration",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        method=request.method,
        path=request.url.path,
        status_code=204,
        request_id=request_id(request),
        entity_type="product",
        entity_id=str(product_id),
        details={"dealer_id": deleted.dealer_id, "name": deleted.name},
    )
