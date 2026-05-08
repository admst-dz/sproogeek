from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.crud import user as crud_user
from app.database import get_db


bearer = HTTPBearer()
bearer_optional = HTTPBearer(auto_error=False)
STAFF_ROLES = {"admin", "dealer", "owner", "manufacturer"}
ADMIN_ROLES = {"admin", "owner"}
MANUFACTURER_ROLES = {"manufacturer", "admin", "owner"}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = decode_token(credentials.credentials)
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await crud_user.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_roles(*allowed_roles: str):
    allowed = set(allowed_roles)

    async def _require_role(current_user=Depends(get_current_user)):
        if current_user.role not in allowed:
            raise HTTPException(status_code=403, detail="Access denied")
        return current_user

    return _require_role


async def get_staff_user(current_user=Depends(get_current_user)):
    if current_user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Access denied")
    return current_user


async def get_admin_user(current_user=Depends(get_current_user)):
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Access denied")
    return current_user


async def get_manufacturer_user(current_user=Depends(get_current_user)):
    if current_user.role not in MANUFACTURER_ROLES:
        raise HTTPException(status_code=403, detail="Access denied")
    return current_user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_optional),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает user если токен валиден, иначе None — без 401."""
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
        user_id: str = payload.get("sub")
        if not user_id:
            return None
    except JWTError:
        return None
    return await crud_user.get_user(db, user_id)


def request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")
