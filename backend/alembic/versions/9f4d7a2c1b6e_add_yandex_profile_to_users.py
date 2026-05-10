"""Add Yandex profile fields to users

Revision ID: 9f4d7a2c1b6e
Revises: b8f2d4c6a9e1
Create Date: 2026-05-09 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "9f4d7a2c1b6e"
down_revision: Union[str, None] = "b8f2d4c6a9e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("yandex_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("yandex_login", sa.String(), nullable=True))
    op.add_column("users", sa.Column("yandex_avatar_url", sa.String(), nullable=True))
    op.add_column("users", sa.Column("yandex_profile", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.create_index(op.f("ix_users_yandex_id"), "users", ["yandex_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_yandex_id"), table_name="users")
    op.drop_column("users", "yandex_profile")
    op.drop_column("users", "yandex_avatar_url")
    op.drop_column("users", "yandex_login")
    op.drop_column("users", "yandex_id")
