from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.crud import user as crud_user
from app.database import get_db
from app.schemas.user import UserDealerUpdate, UserResponse


router = APIRouter()


async def _validate_dealer(db: AsyncSession, dealer_id: str):
    dealer = await crud_user.get_user(db, dealer_id)
    if not dealer or dealer.role != "dealer":
        raise HTTPException(status_code=400, detail="Dealer not found")
    return dealer


@router.get("/dealer/clients", response_model=list[UserResponse])
async def read_dealer_clients(
    dealer_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role == "dealer":
        return await crud_user.get_clients_by_dealer(db, current_user.id)

    if current_user.role not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Access denied")

    if not dealer_id:
        raise HTTPException(status_code=400, detail="dealer_id is required")

    await _validate_dealer(db, dealer_id)
    return await crud_user.get_clients_by_dealer(db, dealer_id)


@router.patch("/{user_id}/dealer", response_model=UserResponse)
async def assign_user_dealer(
    user_id: str,
    body: UserDealerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if current_user.role not in ["admin", "dealer", "owner"]:
        raise HTTPException(status_code=403, detail="Access denied")

    target_user = await crud_user.get_user(db, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user.role != "client":
        raise HTTPException(status_code=400, detail="Only clients can be assigned to a dealer")

    if current_user.role == "dealer":
        if body.dealer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Dealers can assign clients only to themselves")
    elif body.dealer_id:
        await _validate_dealer(db, body.dealer_id)

    return await crud_user.assign_dealer(db, user_id, body.dealer_id)


@router.get("/{user_id}", response_model=UserResponse)
async def read_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_user = await crud_user.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.id == user_id or current_user.role in ["admin", "owner"]:
        return db_user

    if current_user.role == "dealer" and db_user.dealer_id == current_user.id:
        return db_user

    raise HTTPException(status_code=403, detail="Access denied")
