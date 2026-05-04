"""Add dealer_id to orders table

Revision ID: g8c0d3e5f7a9
Revises: f7b9c2d4e6a8
Create Date: 2026-05-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g8c0d3e5f7a9"
down_revision: Union[str, None] = "f7b9c2d4e6a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("dealer_id", sa.String(), nullable=True))
    op.create_index(op.f("ix_orders_dealer_id"), "orders", ["dealer_id"], unique=False)

    # Backfill dealer_id from processing_payload for existing orders
    op.execute("""
        UPDATE orders
        SET dealer_id = processing_payload->'client'->>'dealer_id'
        WHERE processing_payload IS NOT NULL
          AND processing_payload->'client'->>'dealer_id' IS NOT NULL
          AND processing_payload->'client'->>'dealer_id' != 'null'
    """)


def downgrade() -> None:
    op.drop_index(op.f("ix_orders_dealer_id"), table_name="orders")
    op.drop_column("orders", "dealer_id")
