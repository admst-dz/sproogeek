"""Add signed approval and manufacturer quotes to orders

Revision ID: b8f2d4c6a9e1
Revises: f1e2d3c4b5a6
Create Date: 2026-05-09 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = 'b8f2d4c6a9e1'
down_revision: Union[str, Sequence[str], None] = 'f1e2d3c4b5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('signed_approval_file_key', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('signed_approval_uploaded_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        'orders',
        sa.Column(
            'manufacturer_quotes',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            server_default='[]',
        ),
    )
    op.add_column('orders', sa.Column('selected_manufacturer_id', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('selected_quote_id', sa.String(), nullable=True))
    op.create_foreign_key(
        'fk_orders_selected_manufacturer_id_users',
        'orders',
        'users',
        ['selected_manufacturer_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_orders_selected_manufacturer_id', 'orders', ['selected_manufacturer_id'])


def downgrade() -> None:
    op.drop_index('ix_orders_selected_manufacturer_id', table_name='orders')
    op.drop_constraint('fk_orders_selected_manufacturer_id_users', 'orders', type_='foreignkey')
    op.drop_column('orders', 'selected_quote_id')
    op.drop_column('orders', 'selected_manufacturer_id')
    op.drop_column('orders', 'manufacturer_quotes')
    op.drop_column('orders', 'signed_approval_uploaded_at')
    op.drop_column('orders', 'signed_approval_file_key')
