"""Add print canvas permission to users

Revision ID: 7b6a5d4c3e2f
Revises: 2f8a9c6d1e4b
Create Date: 2026-05-28 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7b6a5d4c3e2f"
down_revision: Union[str, None] = "2f8a9c6d1e4b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "print_canvas_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("users", "print_canvas_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "print_canvas_enabled")
