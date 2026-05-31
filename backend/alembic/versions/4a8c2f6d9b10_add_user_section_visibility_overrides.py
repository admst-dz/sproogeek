"""Add user section visibility overrides

Revision ID: 4a8c2f6d9b10
Revises: 1c2d3e4f5a6b
Create Date: 2026-05-31 07:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4a8c2f6d9b10"
down_revision: Union[str, None] = "1c2d3e4f5a6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("section_visibility_overrides", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "section_visibility_overrides")
