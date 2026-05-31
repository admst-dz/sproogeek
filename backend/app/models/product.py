from sqlalchemy import Column, String, Float, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.database import Base
import uuid


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dealer_id = Column(String, nullable=True, index=True)
    # Тип товара определяет, какие поля «активны» и какой конструктор
    # открывается на фронте: notebook / shopper / tshirt / hoodie / lanyard /
    # thermos / powerbank / sticker. Старые записи без типа считаем notebook.
    type = Column(String, nullable=False, server_default="notebook", index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="true")
    binding = Column(JSONB, nullable=True)
    spiral_colors = Column(JSONB, nullable=True)
    has_elastic = Column(Boolean, nullable=True, default=False)
    elastic_colors = Column(JSONB, nullable=True)
    formats = Column(JSONB, nullable=True)
    cover_colors = Column(JSONB, nullable=True)
    # Произвольные атрибуты для не-ежедневниковых типов: размеры одежды,
    # длина шнурка, материал, плотность и т.п. Каждый тип валидирует свой набор
    # ключей в Pydantic-схеме.
    attributes = Column(JSONB, nullable=True)
    retail_price = Column(Float, nullable=True)
    wholesale_tiers = Column(JSONB, nullable=True)
    image_url = Column(String, nullable=True)
    model_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=True)
