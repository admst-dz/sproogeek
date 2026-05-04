"""Add dealer clients and order processing payload

Revision ID: e5a8c2d4f6b7
Revises: d4f7a9c1b2e3
Create Date: 2026-04-27 22:20:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e5a8c2d4f6b7"
down_revision: Union[str, None] = "d4f7a9c1b2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("dealer_id", sa.String(), nullable=True))
    op.create_index(op.f("ix_users_dealer_id"), "users", ["dealer_id"], unique=False)
    op.create_foreign_key(
        "fk_users_dealer_id_users",
        "users",
        "users",
        ["dealer_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "orders",
        sa.Column("processing_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("orders", "processing_payload")
    op.drop_constraint("fk_users_dealer_id_users", "users", type_="foreignkey")
    op.drop_index(op.f("ix_users_dealer_id"), table_name="users")
    op.drop_column("users", "dealer_id")
