from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate


def _product_payload(product: ProductCreate | ProductUpdate) -> dict:
    return {
        "name": product.name,
        "retail_price": product.retailPrice or 0,
        "binding": product.binding or [],
        "spiral_colors": product.spiralColors or [],
        "has_elastic": product.hasElastic or False,
        "elastic_colors": product.elasticColors or [],
        "formats": product.formats or [],
        "cover_colors": product.coverColors or [],
        "wholesale_tiers": product.wholesaleTiers or [],
    }


async def get_product(db: AsyncSession, product_id) -> Optional[Product]:
    result = await db.execute(select(Product).where(Product.id == product_id))
    return result.scalar_one_or_none()


async def get_products(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[Product]:
    result = await db.execute(select(Product).offset(skip).limit(limit))
    return result.scalars().all()


async def get_products_by_dealer(db: AsyncSession, dealer_id: str) -> list[Product]:
    result = await db.execute(select(Product).where(Product.dealer_id == dealer_id))
    return result.scalars().all()


async def create_product(db: AsyncSession, product: ProductCreate) -> Product:
    db_product = Product(dealer_id=product.dealerId, **_product_payload(product))
    db.add(db_product)
    await db.commit()
    await db.refresh(db_product)
    return db_product


async def update_product(db: AsyncSession, product_id, product: ProductUpdate) -> Optional[Product]:
    db_product = await get_product(db, product_id)
    if not db_product:
        return None
    for field, value in _product_payload(product).items():
        setattr(db_product, field, value)
    await db.commit()
    await db.refresh(db_product)
    return db_product


async def delete_product(db: AsyncSession, product_id) -> Optional[Product]:
    db_product = await get_product(db, product_id)
    if db_product:
        await db.delete(db_product)
        await db.commit()
    return db_product
