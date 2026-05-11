from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class ClientInfo(BaseModel):
    id: str = ""
    name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    requisites: str = ""


class ManagerInfo(BaseModel):
    id: str = ""
    name: str = ""


class DeliveryInfo(BaseModel):
    address: str = ""
    phone: str = ""


class QuoteInfo(BaseModel):
    price: Optional[float] = None
    currency: Optional[str] = "BYN"
    production_days: Optional[int] = None


class FileLink(BaseModel):
    name: str
    url: str


class TechCardItem(BaseModel):
    """One row in the product list (page 2)."""
    index: int
    item_id: str
    name: str
    quantity: int = 1
    description: str = ""
    product_kind: str = "notebook"  # notebook | thermos | powerbank | souvenir
    config: dict[str, Any] = Field(default_factory=dict)
    file_url: Optional[str] = None


class TechCardRequest(BaseModel):
    order_id: str
    order_number: Optional[str] = None
    created_at: Optional[datetime] = None
    client: ClientInfo = Field(default_factory=ClientInfo)
    manager: ManagerInfo = Field(default_factory=ManagerInfo)
    items: List[TechCardItem] = Field(default_factory=list)
    download_all_url: Optional[str] = None
    storage_location: str = ""
    notes: str = ""
    delivery: DeliveryInfo = Field(default_factory=DeliveryInfo)
    quote: QuoteInfo = Field(default_factory=QuoteInfo)
    doc_type: str = Field("techcard", pattern="^(techcard|approval)$")
    render_url: Optional[str] = None
    total_price: Optional[float] = None
    currency: Optional[str] = "BYN"


class TechCardResponse(BaseModel):
    s3_key: str
    download_url: str
    bytes: int
