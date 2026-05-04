"""merge heads 2

Revision ID: f7b9c2d4e6a8
Revises: e5a8c2d4f6b7, e6a1f4c8b9d2
Create Date: 2026-04-29

"""
from typing import Union
from alembic import op


revision: str = 'f7b9c2d4e6a8'
down_revision: Union[str, None] = ('e5a8c2d4f6b7', 'e6a1f4c8b9d2')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass