from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.database import Base


class Material(Base):
    """Catalog of consumables tracked by the production warehouse."""
    __tablename__ = "materials"

    id = Column(String, primary_key=True)            # short SKU like "PAPER-A5-80GSM"
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False, default="pcs")  # pcs|m|m2|kg|sheet
    stock_qty = Column(Float, nullable=False, default=0.0)
    reorder_threshold = Column(Float, nullable=False, default=0.0)
    notes = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MaterialMovement(Base):
    """Audit log of every stock change — manual top-ups + auto-deducts on production."""
    __tablename__ = "material_movements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    material_id = Column(String, ForeignKey("materials.id", ondelete="CASCADE"), nullable=False, index=True)
    delta = Column(Float, nullable=False)             # positive = top-up, negative = deduct
    balance_after = Column(Float, nullable=False)
    reason = Column(String, nullable=False)           # e.g. "production:<order_id>" / "topup"
    order_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
