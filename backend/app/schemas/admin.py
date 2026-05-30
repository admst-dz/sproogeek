from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
import re


# Допустимые роли, которыми может оперировать админ через панель.
# "owner" специально не выдаём наружу: создание owner-аккаунта — операция
# уровня DevOps, а не повседневного управления.
ADMIN_MANAGED_ROLES = {"client", "dealer", "manufacturer", "admin"}
ADMIN_MANAGED_SUB_ROLES = {"PL", "PKL", "KL", "KPR", "PR", "TP"}


class UserAdminResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    role: str
    sub_role: Optional[str] = None
    token_balance: float = 0.0
    company_name: Optional[str] = None
    print_canvas_enabled: bool = False
    has_password: bool = False
    orders_count: int = 0
    last_order_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserAdminCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=64)
    display_name: Optional[str] = Field(None, max_length=80)
    role: str = Field("dealer")
    sub_role: Optional[str] = Field(None, max_length=20)
    company_name: Optional[str] = Field(None, max_length=120)
    token_balance: float = Field(0.0, ge=0, le=1_000_000_000)
    print_canvas_enabled: bool = False

    @field_validator("password")
    @classmethod
    def _password_complexity(cls, value: str) -> str:
        if not re.search(r"\d", value) or not re.search(r"[A-Za-zА-Яа-я]", value):
            raise ValueError("Пароль должен содержать буквы и цифры")
        return value

    @field_validator("role")
    @classmethod
    def _role_allowed(cls, value: str) -> str:
        if value not in ADMIN_MANAGED_ROLES:
            raise ValueError(f"Role must be one of {sorted(ADMIN_MANAGED_ROLES)}")
        return value

    @field_validator("sub_role")
    @classmethod
    def _sub_role_allowed(cls, value: Optional[str]) -> Optional[str]:
        if value in (None, ""):
            return None
        if value not in ADMIN_MANAGED_SUB_ROLES:
            raise ValueError(f"Sub-role must be one of {sorted(ADMIN_MANAGED_SUB_ROLES)}")
        return value


class UserAdminPatch(BaseModel):
    display_name: Optional[str] = Field(None, max_length=80)
    role: Optional[str] = None
    sub_role: Optional[str] = Field(None, max_length=20)
    company_name: Optional[str] = Field(None, max_length=120)
    token_balance: Optional[float] = Field(None, ge=0, le=1_000_000_000)
    print_canvas_enabled: Optional[bool] = None

    @field_validator("role")
    @classmethod
    def _role_allowed(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if value not in ADMIN_MANAGED_ROLES:
            raise ValueError(f"Role must be one of {sorted(ADMIN_MANAGED_ROLES)}")
        return value

    @field_validator("sub_role")
    @classmethod
    def _sub_role_allowed(cls, value: Optional[str]) -> Optional[str]:
        if value in (None, ""):
            return None
        if value not in ADMIN_MANAGED_SUB_ROLES:
            raise ValueError(f"Sub-role must be one of {sorted(ADMIN_MANAGED_SUB_ROLES)}")
        return value


class UserAdminPasswordReset(BaseModel):
    password: str = Field(..., min_length=8, max_length=64)

    @field_validator("password")
    @classmethod
    def _password_complexity(cls, value: str) -> str:
        if not re.search(r"\d", value) or not re.search(r"[A-Za-zА-Яа-я]", value):
            raise ValueError("Пароль должен содержать буквы и цифры")
        return value


class AdminStatsRoleCount(BaseModel):
    role: str
    count: int


class AdminStatsResponse(BaseModel):
    users_total: int
    users_by_role: List[AdminStatsRoleCount]
    orders_total: int
    orders_by_status: List[AdminStatsRoleCount]
    revenue_total: float
    revenue_currency: str = "BYN"
    new_users_last_30d: int
    new_orders_last_30d: int


class SectionVisibilitySettings(BaseModel):
    notebook: bool = True
    thermos: bool = True
    powerbank: bool = True
    sticker: bool = True
    print_canvas: bool = False


class DashboardSectionVisibilitySettings(BaseModel):
    notebook: bool = True
    thermos: bool = True
    powerbank: bool = True
    sticker: bool = True
    print_canvas: bool = True


class SectionVisibilityPatch(BaseModel):
    notebook: Optional[bool] = None
    thermos: Optional[bool] = None
    powerbank: Optional[bool] = None
    sticker: Optional[bool] = None
    print_canvas: Optional[bool] = None


class AdminSettingsResponse(BaseModel):
    guest_approval_enabled: bool = True
    home_sections: SectionVisibilitySettings = Field(default_factory=SectionVisibilitySettings)
    dashboard_sections: DashboardSectionVisibilitySettings = Field(default_factory=DashboardSectionVisibilitySettings)
    print_canvas_public_enabled: bool = False


class AdminSettingsPatch(BaseModel):
    guest_approval_enabled: Optional[bool] = None
    home_sections: Optional[SectionVisibilityPatch] = None
    dashboard_sections: Optional[SectionVisibilityPatch] = None
    print_canvas_public_enabled: Optional[bool] = None


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
