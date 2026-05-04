from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.user import User
from typing import Optional

async def get_user(db: AsyncSession, user_id: str):
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()

async def get_user_by_email(db: AsyncSession, email: str):
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()

async def get_user_by_telegram_id(db: AsyncSession, telegram_id: str):
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    return result.scalar_one_or_none()


async def get_clients_by_dealer(db: AsyncSession, dealer_id: str):
    result = await db.execute(select(User).where(User.dealer_id == dealer_id))
    return result.scalars().all()


async def assign_dealer(db: AsyncSession, user_id: str, dealer_id: Optional[str]):
    user = await get_user(db, user_id)
    if not user:
        return None

    user.dealer_id = dealer_id
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user
