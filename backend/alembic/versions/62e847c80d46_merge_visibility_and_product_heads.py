"""Merge visibility and product migration heads.

Revision ID: 62e847c80d46
Revises: 4a8c2f6d9b10, a7c1d2e3f4b5
Create Date: 2026-05-31 12:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union


revision: str = "62e847c80d46"
down_revision: Union[str, Sequence[str], None] = ("4a8c2f6d9b10", "a7c1d2e3f4b5")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
