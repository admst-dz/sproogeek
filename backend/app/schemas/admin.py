from typing import Any, Dict, List

from pydantic import BaseModel, Field


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

