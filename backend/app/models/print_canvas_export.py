import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.database import Base


class PrintCanvasExport(Base):
    __tablename__ = "print_canvas_exports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_email = Column(String, nullable=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    content_type = Column(String, nullable=False, default="image/tiff")
    sheet_width_mm = Column(Integer, nullable=False)
    used_width_mm = Column(Float, nullable=False)
    used_height_mm = Column(Float, nullable=False)
    max_length_m = Column(Integer, nullable=False)
    logo_gap_mm = Column(Float, nullable=False)
    items_count = Column(Integer, nullable=False, default=0)
    density = Column(Integer, nullable=False, default=0)
    export_dpi = Column(Integer, nullable=False, default=150)
    export_metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
