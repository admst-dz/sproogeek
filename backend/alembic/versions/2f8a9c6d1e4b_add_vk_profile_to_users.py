"""Add VK profile fields to users

Revision ID: 2f8a9c6d1e4b
Revises: 9f4d7a2c1b6e
Create Date: 2026-05-21 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "2f8a9c6d1e4b"
down_revision: Union[str, None] = "9f4d7a2c1b6e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("vk_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("vk_screen_name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("vk_avatar_url", sa.String(), nullable=True))
    op.add_column("users", sa.Column("vk_profile", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.create_index(op.f("ix_users_vk_id"), "users", ["vk_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_vk_id"), table_name="users")
    op.drop_column("users", "vk_profile")
    op.drop_column("users", "vk_avatar_url")
    op.drop_column("users", "vk_screen_name")
    op.drop_column("users", "vk_id")
