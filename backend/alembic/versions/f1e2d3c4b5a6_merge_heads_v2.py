"""merge heads v2

Revision ID: f1e2d3c4b5a6
Revises: e6a1f4c8b9d2, e8a3c1d4f5b9
Create Date: 2026-05-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1e2d3c4b5a6'
down_revision: Union[str, Sequence[str], None] = ('e6a1f4c8b9d2', 'e8a3c1d4f5b9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
