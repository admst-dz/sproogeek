from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_email = Column(String, nullable=True)
    product_name = Column(String, nullable=True)
    status = Column(String, default="new", index=True)
    configuration = Column(JSONB, nullable=True)
    quantity = Column(Integer, default=1)
    total_price = Column(Float, nullable=True)
    currency = Column(String, default='BYN')
    is_guest = Column(Boolean, default=False)
    stage_history = Column(JSONB, default=list, nullable=True)

    approval_status = Column(String, default="pending", nullable=True, index=True)  # pending|approved|rejected
    approval_pdf_key = Column(String, nullable=True)
    signed_approval_file_key = Column(String, nullable=True)
    signed_approval_uploaded_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approval_comment = Column(String, nullable=True)
    dealer_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    manufacturer_quotes = Column(JSONB, default=list, nullable=True)
    selected_manufacturer_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    selected_quote_id = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="orders", foreign_keys=[user_id])
