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

