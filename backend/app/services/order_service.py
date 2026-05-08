from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.crud import order as crud_order
from app.crud import user as crud_user
from app.schemas.order import OrderCreate


class OrderService:
    @staticmethod
    async def create_new_order(db: AsyncSession, order_data: OrderCreate, current_user_id: str):
        user = await crud_user.get_user(db, current_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if user.sub_role == 'PL' and order_data.total_price:
            token_balance = user.token_balance or 0
            if token_balance < order_data.total_price:
                raise HTTPException(status_code=400, detail="Not enough tokens (TK)")
            user.token_balance = token_balance - order_data.total_price
            db.add(user)

        order_data.user_id = current_user_id
        if not order_data.user_email:
            order_data.user_email = user.email

        return await crud_order.create_order(db, order_data)
