import re
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class ProductCreate(BaseModel):
    name: str = Field("Ежедневник", min_length=1, max_length=120)
    dealerId: Optional[str] = Field(None, max_length=120)
    retailPrice: Optional[float] = Field(None, ge=0, le=1_000_000_000)
    binding: List[str] = Field(default_factory=list, max_length=20)
    spiralColors: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)
    hasElastic: Optional[bool] = False
    elasticColors: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)
    formats: List[str] = Field(default_factory=list, max_length=50)
    coverColors: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)
    wholesaleTiers: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)

    @field_validator("binding")
    @classmethod
    def validate_binding(cls, value):
        allowed = {"hard", "spiral"}
        if any(item not in allowed for item in value):
            raise ValueError("Unsupported binding value")
        return value

    @field_validator("formats")
    @classmethod
    def validate_formats(cls, value):
        for item in value:
            if not isinstance(item, str) or len(item) > 40:
                raise ValueError("Invalid format value")
        return value

    @field_validator("spiralColors", "elasticColors", "coverColors")
    @classmethod
    def validate_colors(cls, value):
        for color in value:
            hex_value = str(color.get("hex", ""))
            name = str(color.get("name", ""))
            if not HEX_COLOR_RE.fullmatch(hex_value):
                raise ValueError("Color hex must use #RRGGBB format")
            if len(name) > 80:
                raise ValueError("Color name is too long")
        return value

    @field_validator("wholesaleTiers")
    @classmethod
    def validate_wholesale_tiers(cls, value):
        for tier in value:
            min_qty = tier.get("minQty")
            price = tier.get("pricePerUnit")
            if not isinstance(min_qty, int) or min_qty < 1:
                raise ValueError("Wholesale tier minQty must be a positive integer")
            if not isinstance(price, (int, float)) or price < 0:
                raise ValueError("Wholesale tier pricePerUnit must be a positive number")
        return value


class ProductUpdate(ProductCreate):
    pass


class ProductResponse(BaseModel):
    id: UUID
    name: str
    dealer_id: Optional[str] = None
    retailPrice: Optional[float] = None
    binding: List[str] = Field(default_factory=list)
    spiralColors: List[Dict[str, Any]] = Field(default_factory=list)
    hasElastic: bool = False
    elasticColors: List[Dict[str, Any]] = Field(default_factory=list)
    formats: List[str] = Field(default_factory=list)
    coverColors: List[Dict[str, Any]] = Field(default_factory=list)
    wholesaleTiers: List[Dict[str, Any]] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def remap_orm_fields(cls, data):
        if not isinstance(data, dict):
            return {
                "id": data.id,
                "name": data.name,
                "dealer_id": data.dealer_id,
                "retailPrice": data.retail_price,
                "binding": data.binding or [],
                "spiralColors": data.spiral_colors or [],
                "hasElastic": data.has_elastic or False,
                "elasticColors": data.elastic_colors or [],
                "formats": data.formats or [],
                "coverColors": data.cover_colors or [],
                "wholesaleTiers": data.wholesale_tiers or [],
            }
        return data
