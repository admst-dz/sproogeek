"""Add product type, attributes, description, model_url, is_active and seed catalog kinds

Revision ID: a7c1d2e3f4b5
Revises: f1e2d3c4b5a6
Create Date: 2026-05-31 12:00:00.000000

"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "a7c1d2e3f4b5"
down_revision: Union[str, None] = "f1e2d3c4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Дефолтный сид новых типов товаров. Цены ориентировочные (BYN, розница),
# атрибуты — справочные. Реальные значения подкручиваются позже через админку.
_SEED_PRODUCTS = [
    {
        "type": "shopper",
        "name": "Шопер",
        "description": "Холщовая сумка-шопер с зоной нанесения 25×30 см.",
        "retail_price": 22.0,
        "image_url": None,
        "model_url": None,
        "attributes": {
            "materials": ["canvas_220", "canvas_280", "oxford_300"],
            "colors": [
                {"hex": "#F5F0E1", "name": "Натуральный"},
                {"hex": "#1A1A1A", "name": "Чёрный"},
                {"hex": "#1565C0", "name": "Синий"},
                {"hex": "#D32F2F", "name": "Красный"},
                {"hex": "#43A047", "name": "Зелёный"},
            ],
            "handleTypes": ["short", "long"],
            "dimensionsMm": {"width": 380, "height": 420, "depth": 100},
            "printAreas": ["front", "back"],
        },
    },
    {
        "type": "tshirt",
        "name": "Майка",
        "description": "Хлопковая футболка унисекс с круглым воротом.",
        "retail_price": 28.0,
        "image_url": None,
        "model_url": None,
        "attributes": {
            "sizes": ["XS", "S", "M", "L", "XL", "XXL"],
            "materials": ["cotton_160", "cotton_180", "cotton_220"],
            "colors": [
                {"hex": "#FFFFFF", "name": "Белый"},
                {"hex": "#1A1A1A", "name": "Чёрный"},
                {"hex": "#1565C0", "name": "Синий"},
                {"hex": "#D32F2F", "name": "Красный"},
                {"hex": "#FDD835", "name": "Жёлтый"},
                {"hex": "#43A047", "name": "Зелёный"},
            ],
            "printAreas": ["front", "back", "leftSleeve", "rightSleeve"],
        },
    },
    {
        "type": "hoodie",
        "name": "Худи",
        "description": "Тёплое худи на флисе с капюшоном и карманом-кенгуру.",
        "retail_price": 78.0,
        "image_url": None,
        "model_url": None,
        "attributes": {
            "sizes": ["S", "M", "L", "XL", "XXL"],
            "materials": ["fleece_280", "fleece_320"],
            "colors": [
                {"hex": "#1A1A1A", "name": "Чёрный"},
                {"hex": "#5D6770", "name": "Графит"},
                {"hex": "#1565C0", "name": "Синий"},
                {"hex": "#115740", "name": "Зелёный"},
                {"hex": "#7F1D1D", "name": "Бордо"},
                {"hex": "#F5F0E1", "name": "Молочный"},
            ],
            "printAreas": ["front", "back", "chest"],
        },
    },
    {
        "type": "lanyard",
        "name": "Ланъярд",
        "description": "Ленточный шнурок для бейджа с карабином и логотипом по всей длине.",
        "retail_price": 6.5,
        "image_url": None,
        "model_url": None,
        "attributes": {
            "materials": ["polyester_15", "polyester_20", "satin_15"],
            "widthMm": 15,
            "lengthsMm": [400, 450, 500],
            "carabiners": ["hook", "carabiner", "swivel"],
            "colors": [
                {"hex": "#1A1A1A", "name": "Чёрный"},
                {"hex": "#FFFFFF", "name": "Белый"},
                {"hex": "#1565C0", "name": "Синий"},
                {"hex": "#D32F2F", "name": "Красный"},
                {"hex": "#43A047", "name": "Зелёный"},
                {"hex": "#FDD835", "name": "Жёлтый"},
            ],
        },
    },
]


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("type", sa.String(), nullable=False, server_default="notebook"),
    )
    op.create_index("ix_products_type", "products", ["type"], unique=False)
    op.add_column("products", sa.Column("description", sa.String(), nullable=True))
    op.add_column(
        "products",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "products",
        sa.Column("attributes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("products", sa.Column("model_url", sa.String(), nullable=True))

    products_table = sa.table(
        "products",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("type", sa.String()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
        sa.column("is_active", sa.Boolean()),
        sa.column("retail_price", sa.Float()),
        sa.column("image_url", sa.String()),
        sa.column("model_url", sa.String()),
        sa.column("attributes", postgresql.JSONB()),
    )

    bind = op.get_bind()
    for product in _SEED_PRODUCTS:
        existing = bind.execute(
            sa.text("SELECT id FROM products WHERE type = :t AND dealer_id IS NULL LIMIT 1"),
            {"t": product["type"]},
        ).first()
        if existing:
            continue
        op.bulk_insert(
            products_table,
            [
                {
                    "id": uuid.uuid4(),
                    "type": product["type"],
                    "name": product["name"],
                    "description": product["description"],
                    "is_active": True,
                    "retail_price": product["retail_price"],
                    "image_url": product["image_url"],
                    "model_url": product["model_url"],
                    "attributes": product["attributes"],
                }
            ],
        )


def downgrade() -> None:
    # Сид удаляем только для строк без dealer_id — чтобы не задеть пользовательские.
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM products WHERE dealer_id IS NULL AND type IN ('shopper','tshirt','hoodie','lanyard')"
        )
    )
    op.drop_column("products", "model_url")
    op.drop_column("products", "attributes")
    op.drop_column("products", "is_active")
    op.drop_column("products", "description")
    op.drop_index("ix_products_type", table_name="products")
    op.drop_column("products", "type")
