from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Optional, Dict, Any, List, Literal
from uuid import UUID
from datetime import datetime

ORDER_STATUSES = (
    "draft", "new", "awaiting_signature", "awaiting_quotes", "quotes_ready", "processing", "production",
    "in_delivery", "done", "approved", "rejected", "cancelled",
)

DELIVERY_METHODS = {"pickup", "postal_service"}


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _build_delivery_address(delivery: Dict[str, Any]) -> str:
    parts = [
        _clean_text(delivery.get("street")),
        _clean_text(delivery.get("house_number")),
    ]
    apartment = _clean_text(delivery.get("apartment"))
    if apartment:
        parts.append(f"кв. {apartment}")
    return ", ".join(part for part in parts if part)


class OrderCreate(BaseModel):
    user_id: Optional[str] = None
    user_email: Optional[str] = Field("", max_length=255)
    product_name: Optional[str] = Field(None, max_length=120)
    configuration: Dict[str, Any] = Field(default_factory=dict)
    quantity: int = Field(1, ge=1, le=10000)
    total_price: Optional[float] = Field(None, ge=0, le=1_000_000_000)
    currency: Optional[str] = Field("BYN", min_length=3, max_length=3, pattern="^[A-Z]{3}$")
    is_guest: Optional[bool] = False

    @model_validator(mode="after")
    def require_contact_name_and_phone(self):
        contact = self.configuration.get("contact") if isinstance(self.configuration, dict) else None
        if not isinstance(contact, dict):
            raise ValueError("Contact name and phone are required")

        name = str(contact.get("name") or "").strip()
        phone = str(contact.get("phone") or "").strip()
        if not name or not phone:
            raise ValueError("Contact name and phone are required")

        contact["name"] = name
        contact["phone"] = phone

        delivery = self.configuration.get("delivery")
        if not isinstance(delivery, dict):
            delivery = {}
            self.configuration["delivery"] = delivery

        method = _clean_text(delivery.get("method") or self.configuration.get("deliveryMethod") or "pickup")
        if method not in DELIVERY_METHODS:
            raise ValueError("Delivery method is invalid")

        delivery["method"] = method
        if method == "postal_service":
            required_fields = {
                "recipient_full_name": "Delivery recipient full name is required",
                "street": "Delivery street is required",
                "house_number": "Delivery house number is required",
                "apartment": "Delivery apartment is required",
            }
            for field, message in required_fields.items():
                value = _clean_text(delivery.get(field) or delivery.get(field.replace("_", "")))
                if not value:
                    raise ValueError(message)
                delivery[field] = value

            formatted_address = _clean_text(delivery.get("formatted_address")) or _build_delivery_address(delivery)
            delivery["formatted_address"] = formatted_address
            contact["address"] = formatted_address
            contact["deliveryRecipientFullName"] = delivery["recipient_full_name"]
        else:
            delivery.setdefault("formatted_address", "")

        return self


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
