import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.crud import user as crud_user
from app.models.user import User
from app.schemas.user import (
    UserRegister,
    UserLogin,
    TokenResponse,
    UserResponse,
    GoogleAuthRequest,
    GoogleTokenResponse,
)
from app.core.security import hash_password, verify_password, create_access_token
from app.core.deps import get_current_user
from app.core.google_verify import exchange_google_code

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


def _build_telegram_email(telegram_id: str) -> str:
    return f"tg_{telegram_id}@telegram.local"


def _build_display_name(payload: dict) -> str:
    full_name = " ".join(filter(None, [payload.get("first_name"), payload.get("last_name")])).strip()
    if full_name:
        return full_name
    if payload.get("username"):
        return f"@{payload['username']}"
    return "Telegram User"


async def _validate_dealer_id(db: AsyncSession, dealer_id: Optional[str]) -> Optional[str]:
    if not dealer_id:
        return None

    dealer = await crud_user.get_user(db, dealer_id)
    if not dealer or dealer.role != "dealer":
        raise HTTPException(status_code=400, detail="Dealer not found")
    return dealer_id


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")  # Защита от спам-регистраций
async def register(request: Request, data: UserRegister, db: AsyncSession = Depends(get_db)):
    dealer_id = await _validate_dealer_id(db, data.dealer_id)
    existing = await crud_user.get_user_by_email(db, data.email)
    if existing:
        if existing.password_hash:
            raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

        existing.password_hash = hash_password(data.password)
        if data.display_name:
            existing.display_name = data.display_name

        if data.role == "dealer":
            existing.role = "dealer"

        # БЕЗОПАСНОСТЬ: Разрешаем задать sub_role только если он пустой
        if data.sub_role and existing.sub_role is None:
            if data.sub_role in ["PL", "PKL", "KL", "KPR", "PR"]:
                existing.sub_role = data.sub_role
        if dealer_id and existing.dealer_id is None:
            existing.dealer_id = dealer_id

        db.add(existing)
        await db.commit()
        await db.refresh(existing)
        token = create_access_token(existing.id, existing.email, existing.role)
        return {"access_token": token, "user": existing}

    user = User(
        id=str(uuid.uuid4()),
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name or "",
        role=data.role,
        sub_role=data.sub_role if data.sub_role in ["PL", "PKL", "KL", "KPR", "PR"] else None,
        dealer_id=dealer_id,
        token_balance=0.0,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(user.id, user.email, user.role)
    return {"access_token": token, "user": user}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")  # Защита от брутфорса
async def login(request: Request, data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await crud_user.get_user_by_email(db, data.email)
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный Email или пароль")

    token = create_access_token(user.id, user.email, user.role)
    return {"access_token": token, "user": user}


@router.post("/google", response_model=GoogleTokenResponse)
@limiter.limit("10/minute")
async def google_auth(request: Request, body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = await exchange_google_code(body.google_code)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Недействительный Google токен: {e}")

    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email не найден в токене")

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

    needs_role_setup = user.sub_role is None and user.role != "dealer"
    token = create_access_token(user.id, user.email, user.role)
    return {"access_token": token, "user": user, "needs_role_setup": needs_role_setup}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.patch("/me/role", response_model=UserResponse)
async def update_role(
        body: dict,
        db: AsyncSession = Depends(get_db),
        current_user=Depends(get_current_user),
):
    role = body.get("role")
    sub_role = body.get("sub_role")

    changed = False

    if role == "dealer" and current_user.role != "dealer":
        current_user.role = "dealer"
        changed = True

    if sub_role and current_user.sub_role is None:
        if sub_role not in ["PL", "PKL", "KL", "KPR", "PR"]:
            raise HTTPException(status_code=400, detail="Недопустимая под-роль")
        current_user.sub_role = sub_role
        changed = True

    if changed:
        db.add(current_user)
        await db.commit()
        await db.refresh(current_user)

    return current_user
