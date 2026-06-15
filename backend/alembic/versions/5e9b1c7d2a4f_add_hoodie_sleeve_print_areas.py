"""Add hoodie sleeve print areas.

Revision ID: 5e9b1c7d2a4f
Revises: 62e847c80d46
Create Date: 2026-06-15 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "5e9b1c7d2a4f"
down_revision: Union[str, Sequence[str], None] = "62e847c80d46"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _update_hoodie_print_areas(add_sleeves: bool) -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT id, attributes FROM products WHERE type = 'hoodie' AND dealer_id IS NULL")
    ).mappings()
    update_stmt = sa.text(
        "UPDATE products SET attributes = :attributes WHERE id = :id"
    ).bindparams(sa.bindparam("attributes", type_=postgresql.JSONB()))

    for row in rows:
        attributes = dict(row["attributes"] or {})
        areas = list(attributes.get("printAreas") or [])
        if add_sleeves:
            for area in ("leftSleeve", "rightSleeve"):
                if area not in areas:
                    areas.append(area)
        else:
            areas = [area for area in areas if area not in {"leftSleeve", "rightSleeve"}]
        attributes["printAreas"] = areas
        bind.execute(update_stmt, {"id": row["id"], "attributes": attributes})


def upgrade() -> None:
    _update_hoodie_print_areas(add_sleeves=True)


def downgrade() -> None:
    _update_hoodie_print_areas(add_sleeves=False)
