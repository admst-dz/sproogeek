from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime


class OrderCreate(BaseModel):
    user_id: Optional[str] = None
    user_email: Optional[str] = ''
    product_name: Optional[str] = None
    configuration: Optional[Dict[str, Any]] = None
    quantity: int = 1
    total_price: Optional[float] = None
    currency: Optional[str] = 'BYN'
    is_guest: Optional[bool] = False


class OrderStatusUpdate(BaseModel):
    status: str
    comment: Optional[str] = None


class OrderPriceUpdate(BaseModel):
    dealer_price: float
    dealer_comment: Optional[str] = None


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
    dealer_id: Optional[str] = None
    status: str
    stage_history: Optional[List[Dict[str, Any]]] = None
    processing_payload: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
