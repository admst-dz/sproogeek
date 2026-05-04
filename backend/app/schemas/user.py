from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator
from typing import Optional
import re

class UserRegister(BaseModel):
    email: EmailStr
    # Пароль от 8 до 64 символов (чтобы не повесить bcrypt гигантской строкой)
    password: str = Field(..., min_length=8, max_length=64)
    # Имя не длиннее 50 символов
    display_name: Optional[str] = Field(None, max_length=50)
    # Не даем юзеру передать role="admin" при регистрации
    role: str = Field("client", pattern="^(client|dealer)$")
    sub_role: Optional[str] = Field(None, max_length=20)
    dealer_id: Optional[str] = Field(None, max_length=64)

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if not re.search(r'\d', v):
            raise ValueError('Пароль должен содержать хотя бы одну цифру')
        if not re.search(r'[a-zA-Z]', v):
            raise ValueError('Пароль должен содержать буквы')
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=64)

class UserResponse(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    role: str
    sub_role: Optional[str] = None
    dealer_id: Optional[str] = None
    token_balance: float = 0.0

    model_config = ConfigDict(from_attributes=True)


class UserDealerUpdate(BaseModel):
    dealer_id: Optional[str] = Field(None, max_length=64)

class TokenResponse(BaseModel):
    access_token: str
    user: UserResponse

class GoogleAuthRequest(BaseModel):
    google_code: str

class GoogleTokenResponse(BaseModel):
    access_token: str
    user: UserResponse
    needs_role_setup: bool
