"""Add materials + material_movements

Revision ID: e8a3c1d4f5b9
Revises: d7f9b1c4a2e8
Create Date: 2026-05-07 13:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = 'e8a3c1d4f5b9'
down_revision: Union[str, None] = 'd7f9b1c4a2e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'materials',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('unit', sa.String(), nullable=False, server_default='pcs'),
        sa.Column('stock_qty', sa.Float(), nullable=False, server_default='0'),
        sa.Column('reorder_threshold', sa.Float(), nullable=False, server_default='0'),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_table(
        'material_movements',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('material_id', sa.String(), sa.ForeignKey('materials.id', ondelete='CASCADE'), nullable=False),
        sa.Column('delta', sa.Float(), nullable=False),
        sa.Column('balance_after', sa.Float(), nullable=False),
        sa.Column('reason', sa.String(), nullable=False),
        sa.Column('order_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_material_movements_material_id', 'material_movements', ['material_id'])
    op.create_index('ix_material_movements_order_id', 'material_movements', ['order_id'])


def downgrade() -> None:
    op.drop_index('ix_material_movements_order_id', table_name='material_movements')
    op.drop_index('ix_material_movements_material_id', table_name='material_movements')
    op.drop_table('material_movements')
    op.drop_table('materials')
