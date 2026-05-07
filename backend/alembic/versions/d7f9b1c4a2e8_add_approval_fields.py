"""Add approval fields to orders

Revision ID: d7f9b1c4a2e8
Revises: 0a3df10ebd37
Create Date: 2026-05-07 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'd7f9b1c4a2e8'
down_revision: Union[str, None] = '0a3df10ebd37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('approval_status', sa.String(), nullable=True, server_default='pending'))
    op.add_column('orders', sa.Column('approval_pdf_key', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('approval_comment', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('dealer_confirmed_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_orders_approval_status', 'orders', ['approval_status'])


def downgrade() -> None:
    op.drop_index('ix_orders_approval_status', table_name='orders')
    op.drop_column('orders', 'dealer_confirmed_at')
    op.drop_column('orders', 'approval_comment')
    op.drop_column('orders', 'approved_at')
    op.drop_column('orders', 'approval_pdf_key')
    op.drop_column('orders', 'approval_status')
