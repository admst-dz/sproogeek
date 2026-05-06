from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserAdminResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    role: str
    sub_role: Optional[str] = None
    token_balance: float = 0.0
    company_name: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class OrderTypeSummary(BaseModel):
    id: str
    filename: str
    size_bytes: int
    updated_at: float


class OrderTypeListResponse(BaseModel):
    items: List[OrderTypeSummary]


class OrderTypeResponse(BaseModel):
    id: str
    data: Dict[str, Any] = Field(default_factory=dict)


class OrderTypeUpdate(BaseModel):
    data: Dict[str, Any] = Field(default_factory=dict)


class OrderAdminUpdate(BaseModel):
    user_email: Optional[str] = Field(None, max_length=255)
    product_name: Optional[str] = Field(None, max_length=120)
    configuration: Optional[Dict[str, Any]] = None
    quantity: Optional[int] = Field(None, ge=1, le=10000)
    total_price: Optional[float] = Field(None, ge=0, le=1_000_000_000)
    currency: Optional[str] = Field(None, min_length=3, max_length=3, pattern="^[A-Z]{3}$")
    status: Optional[str] = Field(None, pattern="^(new|processing|production|in_delivery|done)$")
