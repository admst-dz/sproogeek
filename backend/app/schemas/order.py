from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict, Any, List, Literal
from uuid import UUID
from datetime import datetime

ORDER_STATUSES = (
    "draft", "new", "awaiting_signature", "awaiting_quotes", "quotes_ready", "processing", "production",
    "in_delivery", "done", "approved", "rejected", "cancelled",
)


class OrderCreate(BaseModel):
    user_id: Optional[str] = None
    user_email: Optional[str] = Field("", max_length=255)
    product_name: Optional[str] = Field(None, max_length=120)
    configuration: Dict[str, Any] = Field(default_factory=dict)
    quantity: int = Field(1, ge=1, le=10000)
    total_price: Optional[float] = Field(None, ge=0, le=1_000_000_000)
    currency: Optional[str] = Field("BYN", min_length=3, max_length=3, pattern="^[A-Z]{3}$")
    is_guest: Optional[bool] = False


class OrderStatusUpdate(BaseModel):
    status: Literal["draft", "new", "awaiting_signature", "awaiting_quotes", "quotes_ready", "processing", "production",
                    "in_delivery", "done", "approved", "rejected", "cancelled"]
    comment: Optional[str] = Field(None, max_length=1000)


class OrderResponse(BaseModel):
    id: UUID
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    product_name: Optional[str] = None
    configuration: Optional[Dict[str, Any]] = None
    quantity: int = 1
    total_price: Optional[float] = None
    currency: Optional[str] = None
    is_guest: Optional[bool] = None
    status: str
    stage_history: Optional[List[Dict[str, Any]]] = None
    approval_status: Optional[str] = None
    approval_pdf_key: Optional[str] = None
    signed_approval_file_key: Optional[str] = None
    signed_approval_uploaded_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    approval_comment: Optional[str] = None
    dealer_confirmed_at: Optional[datetime] = None
    manufacturer_quotes: Optional[List[Dict[str, Any]]] = None
    selected_manufacturer_id: Optional[str] = None
    selected_quote_id: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
