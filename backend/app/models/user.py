from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    role = Column(String, default="client", nullable=False)
    sub_role = Column(String, nullable=True)
    token_balance = Column(Float, default=0.0, nullable=True)
    company_name = Column(String, nullable=True)
    dealer_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    orders = relationship("Order", back_populates="user", cascade="all, delete-orphan")
    dealer = relationship("User", remote_side=[id], back_populates="clients", foreign_keys=[dealer_id])
    clients = relationship("User", back_populates="dealer", foreign_keys=[dealer_id])

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=True)
