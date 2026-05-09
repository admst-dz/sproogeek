import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field as PField
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user, request_id
from app.core.event_logger import event_logger
from app.core.google_verify import exchange_google_code
from app.core.security import create_access_token, hash_password, verify_password
from app.core.security_utils import constant_time_equals
from app.crud import user as crud_user
from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    GoogleAuthRequest,
    GoogleTokenResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)


DEALER_SUB_ROLE = "TP"
ALLOWED_SUB_ROLES = {"PL", "PKL", "KL", "KPR", "PR", DEALER_SUB_ROLE}
# Под-роли для клиентов (без TP — он закреплён за дилерами).
ALLOWED_CLIENT_SUB_ROLES = {"PL", "PKL", "KL", "KPR", "PR"}
SUB_ROLE_ALIASES = {"КЛ": "KL", "КПР": "KPR", "ПР": "PR", "ТИПОГРАФИЯ": DEALER_SUB_ROLE}

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


def _normalize_sub_role(value):
    if value is None:
        return None
    normalized = SUB_ROLE_ALIASES.get(str(value), str(value))
    return normalized if normalized in ALLOWED_SUB_ROLES else None


def _client_sub_role(value):
    """Возвращает только разрешённую клиентскую под-роль (без TP/dealer)."""
    normalized = _normalize_sub_role(value)
    return normalized if normalized in ALLOWED_CLIENT_SUB_ROLES else None


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, data: UserRegister, db: AsyncSession = Depends(get_db)):
    email = data.email.lower()
    existing = await crud_user.get_user_by_email(db, email)
    if existing:
        # Любой существующий аккаунт (с паролем или OAuth) — отказ. Иначе аноним,
        # знающий email Google-пользователя, может «перехватить» его учётку,
        # выставив свой пароль на тот же email.
        event_logger.log(
            "AUTH_REGISTER_REJECTED",
            "Registration rejected because email already exists",
            direction="user->backend",
            actor_type="anonymous",
            actor_email=email,
            method=request.method,
            path=request.url.path,
            status_code=400,
            request_id=request_id(request),
        )
        raise HTTPException(status_code=400, detail="Email already registered")

    role = data.role or "client"
    if role == "dealer":
        sub_role = _normalize_sub_role(data.sub_role)
    else:
        sub_role = _client_sub_role(data.sub_role)
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        password_hash=hash_password(data.password),
        display_name=data.display_name or "",
        role=role,
        sub_role=sub_role,
        token_balance=0.0,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(user.id, user.email, user.role)
    event_logger.log(
        "AUTH_REGISTER_COMPLETED",
        "New user registered",
        direction="user->backend",
        actor_type=user.role,
        actor_id=user.id,
        actor_email=user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
    )
    return {"access_token": token, "user": user}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, data: UserLogin, db: AsyncSession = Depends(get_db)):
    email = data.email.lower()
    user = await crud_user.get_user_by_email(db, email)
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        event_logger.log(
            "AUTH_LOGIN_FAILED",
            "Login failed",
            direction="user->backend",
            actor_type="anonymous",
            actor_email=email,
            method=request.method,
            path=request.url.path,
            status_code=401,
            request_id=request_id(request),
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user.id, user.email, user.role)
    event_logger.log(
        "AUTH_LOGIN_COMPLETED",
        "User logged in",
        direction="user->backend",
        actor_type=user.role,
        actor_id=user.id,
        actor_email=user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
    )
    return {"access_token": token, "user": user}


@router.post("/google", response_model=GoogleTokenResponse)
@limiter.limit("10/minute")
async def google_auth(request: Request, body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = await exchange_google_code(body.google_code)
    except Exception as exc:
        event_logger.log(
            "AUTH_GOOGLE_FAILED",
            "Google authentication failed",
            direction="user->backend",
            method=request.method,
            path=request.url.path,
            status_code=401,
            request_id=request_id(request),
            details={"error_type": type(exc).__name__},
        )
        raise HTTPException(status_code=401, detail="Invalid Google token") from exc

    email = str(payload.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email not found in Google profile")

    user = await crud_user.get_user_by_email(db, email)
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            display_name=payload.get("name", ""),
            role="client",
            sub_role=None,
            token_balance=0.0,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    needs_role_setup = user.sub_role is None
    token = create_access_token(user.id, user.email, user.role)
    event_logger.log(
        "AUTH_GOOGLE_COMPLETED",
        "User authenticated through Google",
        direction="user->backend",
        actor_type=user.role,
        actor_id=user.id,
        actor_email=user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
    )
    return {"access_token": token, "user": user, "needs_role_setup": needs_role_setup}


class AdminBackdoorRequest(BaseModel):
    login: str = PField(..., min_length=1, max_length=128)
    password: str = PField(..., min_length=1, max_length=256)
    rsa_key: str = PField(..., min_length=1, max_length=4096)


@router.post("/admin-backdoor", response_model=TokenResponse)
@limiter.limit("3/minute")
async def admin_backdoor(request: Request, body: AdminBackdoorRequest, db: AsyncSession = Depends(get_db)):
    settings = get_settings()
    if not settings.admin_backdoor_enabled:
        raise HTTPException(status_code=404, detail="Not Found")
    if not (settings.admin_backdoor_login and settings.admin_backdoor_password and settings.admin_backdoor_key):
        raise HTTPException(status_code=503, detail="Admin backdoor is not configured")

    # Constant-time сравнение всех трёх полей: иначе по времени ответа можно
    # посимвольно подобрать каждый секрет (timing-атака).
    login_ok = constant_time_equals(body.login, settings.admin_backdoor_login)
    password_ok = constant_time_equals(body.password, settings.admin_backdoor_password)
    key_ok = constant_time_equals(body.rsa_key, settings.admin_backdoor_key)
    if not (login_ok and password_ok and key_ok):
        event_logger.log(
            "AUTH_BACKDOOR_REJECTED",
            "Admin backdoor access denied",
            direction="user->backend",
            method=request.method,
            path=request.url.path,
            status_code=401,
            request_id=request_id(request),
        )
        raise HTTPException(status_code=401, detail="Доступ запрещён")

    user = await crud_user.get_user_by_email(db, settings.admin_backdoor_email)
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=settings.admin_backdoor_email,
            password_hash=hash_password(settings.admin_backdoor_password),
            display_name="Admin",
            role="admin",
            sub_role=None,
            token_balance=0.0,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token(user.id, user.email, user.role)
    event_logger.log(
        "AUTH_BACKDOOR_USED",
        "Admin backdoor login succeeded",
        direction="user->backend",
        actor_type=user.role,
        actor_id=user.id,
        actor_email=user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
    )
    return {"access_token": token, "user": user}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_user)):
    return current_user


class RoleUpdateRequest(BaseModel):
    sub_role: Optional[str] = PField(None, max_length=20)


@router.patch("/me/role", response_model=UserResponse)
async def update_role(
    body: RoleUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Позволяет клиенту один раз выбрать свою клиентскую под-роль (KL/KPR/PR/...).

    Повышение `role` (client → dealer/manufacturer) делает только администратор —
    self-service эскалация недопустима, поэтому здесь принимается только `sub_role`.
    """
    sub_role = _client_sub_role(body.sub_role)

    # Только клиенты могут менять sub_role и только пока он не задан.
    if current_user.role != "client" or current_user.sub_role is not None:
        return current_user

    if not sub_role:
        raise HTTPException(status_code=400, detail="Invalid sub-role")

    current_user.sub_role = sub_role
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    event_logger.log(
        "AUTH_SUB_ROLE_UPDATED",
        "User selected client sub-role",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
        details={"sub_role": sub_role},
    )

    return current_user
