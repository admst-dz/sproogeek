import re
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


# Каталожные типы товаров. Notebook оставлен по умолчанию для обратной
# совместимости со старыми записями, у которых тип не указан явно.
PRODUCT_TYPES = (
    "notebook",
    "thermos",
    "powerbank",
    "sticker",
    "shopper",
    "tshirt",
    "hoodie",
    "lanyard",
)

# Размерные сетки одежды и базовые материалы — фиксируем здесь, чтобы фронт
# и бэк сходились на одной номенклатуре. Атрибуты товара валидируются ниже.
APPAREL_SIZES = {"XS", "S", "M", "L", "XL", "XXL"}
APPAREL_MATERIALS = {
    "cotton_160",
    "cotton_180",
    "cotton_220",
    "fleece_280",
    "fleece_320",
    "polyester_150",
}
SHOPPER_MATERIALS = {"canvas_220", "canvas_280", "oxford_300", "nonwoven_80"}
LANYARD_MATERIALS = {"polyester_10", "polyester_15", "polyester_20", "satin_15"}
LANYARD_LENGTHS_MM = {400, 450, 500}
LANYARD_CARABINERS = {"hook", "carabiner", "swivel", "j_hook"}


def _validate_color_dicts(value: List[Dict[str, Any]]):
    for color in value:
        hex_value = str(color.get("hex", ""))
        name = str(color.get("name", ""))
        if not HEX_COLOR_RE.fullmatch(hex_value):
            raise ValueError("Color hex must use #RRGGBB format")
        if len(name) > 80:
            raise ValueError("Color name is too long")
    return value


class ProductCreate(BaseModel):
    type: str = Field("notebook", max_length=40)
    name: str = Field("Ежедневник", min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=2000)
    isActive: bool = True
    dealerId: Optional[str] = Field(None, max_length=120)
    retailPrice: Optional[float] = Field(None, ge=0, le=1_000_000_000)
    imageUrl: Optional[str] = Field(None, max_length=500)
    modelUrl: Optional[str] = Field(None, max_length=500)
    binding: List[str] = Field(default_factory=list, max_length=20)
    spiralColors: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)
    hasElastic: Optional[bool] = False
    elasticColors: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)
    formats: List[str] = Field(default_factory=list, max_length=50)
    coverColors: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)
    wholesaleTiers: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)
    attributes: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def validate_type(cls, value):
        if value not in PRODUCT_TYPES:
            raise ValueError(f"Unsupported product type: {value}")
        return value

    @field_validator("binding")
    @classmethod
    def validate_binding(cls, value):
        allowed = {"hard", "soft", "spiral"}
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
        return _validate_color_dicts(value)

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

    @model_validator(mode="after")
    def strip_unsupported_elastic(self):
        if "spiral" not in self.binding:
            self.hasElastic = False
            self.elasticColors = []
        return self

    @model_validator(mode="after")
    def validate_type_attributes(self):
        # Для каждого типа поверх «общих» полей делаем строгую валидацию
        # содержимого attributes: ничего лишнего и только разрешённые значения.
        attrs = self.attributes or {}

        if self.type in {"tshirt", "hoodie"}:
            sizes = attrs.get("sizes") or []
            if not isinstance(sizes, list) or any(s not in APPAREL_SIZES for s in sizes):
                raise ValueError("Apparel sizes must be a subset of XS/S/M/L/XL/XXL")
            materials = attrs.get("materials") or []
            if not isinstance(materials, list) or any(m not in APPAREL_MATERIALS for m in materials):
                raise ValueError("Unsupported apparel material")
            colors = attrs.get("colors") or []
            _validate_color_dicts(colors)
            print_areas = attrs.get("printAreas") or []
            allowed_areas = {"front", "back", "leftSleeve", "rightSleeve", "chest"}
            if any(a not in allowed_areas for a in print_areas):
                raise ValueError("Unsupported print area")

        elif self.type == "shopper":
            materials = attrs.get("materials") or []
            if not isinstance(materials, list) or any(m not in SHOPPER_MATERIALS for m in materials):
                raise ValueError("Unsupported shopper material")
            colors = attrs.get("colors") or []
            _validate_color_dicts(colors)
            handle_types = attrs.get("handleTypes") or []
            if any(h not in {"short", "long", "shoulder"} for h in handle_types):
                raise ValueError("Unsupported shopper handle type")
            dims = attrs.get("dimensionsMm") or {}
            for key in ("width", "height", "depth"):
                v = dims.get(key)
                if v is not None and not (isinstance(v, (int, float)) and 0 < v <= 1000):
                    raise ValueError(f"Invalid shopper dimension {key}")

        elif self.type == "lanyard":
            materials = attrs.get("materials") or []
            if not isinstance(materials, list) or any(m not in LANYARD_MATERIALS for m in materials):
                raise ValueError("Unsupported lanyard material")
            colors = attrs.get("colors") or []
            _validate_color_dicts(colors)
            lengths = attrs.get("lengthsMm") or []
            if any((not isinstance(v, int)) or v not in LANYARD_LENGTHS_MM for v in lengths):
                raise ValueError("Unsupported lanyard length")
            carabiners = attrs.get("carabiners") or []
            if any(c not in LANYARD_CARABINERS for c in carabiners):
                raise ValueError("Unsupported carabiner type")
            width_mm = attrs.get("widthMm")
            if width_mm is not None and not (isinstance(width_mm, (int, float)) and 5 <= width_mm <= 30):
                raise ValueError("Lanyard width must be between 5 and 30 mm")

        return self


class ProductUpdate(ProductCreate):
    pass


class ProductResponse(BaseModel):
    id: UUID
    type: str = "notebook"
    name: str
    description: Optional[str] = None
    isActive: bool = True
    dealer_id: Optional[str] = None
    retailPrice: Optional[float] = None
    imageUrl: Optional[str] = None
    modelUrl: Optional[str] = None
    binding: List[str] = Field(default_factory=list)
    spiralColors: List[Dict[str, Any]] = Field(default_factory=list)
    hasElastic: bool = False
    elasticColors: List[Dict[str, Any]] = Field(default_factory=list)
    formats: List[str] = Field(default_factory=list)
    coverColors: List[Dict[str, Any]] = Field(default_factory=list)
    wholesaleTiers: List[Dict[str, Any]] = Field(default_factory=list)
    attributes: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def remap_orm_fields(cls, data):
        if not isinstance(data, dict):
            return {
                "id": data.id,
                "type": data.type or "notebook",
                "name": data.name,
                "description": data.description,
                "isActive": bool(data.is_active) if data.is_active is not None else True,
                "dealer_id": data.dealer_id,
                "retailPrice": data.retail_price,
                "imageUrl": data.image_url,
                "modelUrl": data.model_url,
                "binding": data.binding or [],
                "spiralColors": data.spiral_colors or [],
                "hasElastic": data.has_elastic or False,
                "elasticColors": data.elastic_colors or [],
                "formats": data.formats or [],
                "coverColors": data.cover_colors or [],
                "wholesaleTiers": data.wholesale_tiers or [],
                "attributes": data.attributes or {},
            }
        return data
