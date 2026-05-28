"""Add print canvas exports

Revision ID: 8d3e7f1a2b4c
Revises: 7b6a5d4c3e2f
Create Date: 2026-05-28 20:55:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "8d3e7f1a2b4c"
down_revision: Union[str, Sequence[str], None] = "7b6a5d4c3e2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "print_canvas_exports",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("user_email", sa.String(), nullable=True),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("file_path", sa.String(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content_type", sa.String(), nullable=False, server_default="image/tiff"),
        sa.Column("sheet_width_mm", sa.Integer(), nullable=False),
        sa.Column("used_width_mm", sa.Float(), nullable=False),
        sa.Column("used_height_mm", sa.Float(), nullable=False),
        sa.Column("max_length_m", sa.Integer(), nullable=False),
        sa.Column("logo_gap_mm", sa.Float(), nullable=False),
        sa.Column("items_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("density", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("export_dpi", sa.Integer(), nullable=False, server_default="150"),
        sa.Column("export_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_print_canvas_exports_created_at"), "print_canvas_exports", ["created_at"], unique=False)
    op.create_index(op.f("ix_print_canvas_exports_user_id"), "print_canvas_exports", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_print_canvas_exports_user_id"), table_name="print_canvas_exports")
    op.drop_index(op.f("ix_print_canvas_exports_created_at"), table_name="print_canvas_exports")
    op.drop_table("print_canvas_exports")
