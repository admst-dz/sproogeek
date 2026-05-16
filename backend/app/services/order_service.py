from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import order as crud_order
from app.crud import user as crud_user
from app.database import AsyncSessionLocal
from app.schemas.order import OrderCreate
from app.services.bitrix.sync import schedule_push_created, schedule_push_updated


class OrderService:
    @staticmethod
    async def create_new_order(
        db: AsyncSession,
        order_data: OrderCreate,
        current_user_id: str,
        request: Request | None = None,
    ):
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

        order = await crud_order.create_order(db, order_data)
        OrderService._enqueue_bitrix_create(request, order.id)
        return order

    @staticmethod
    def _enqueue_bitrix_create(request: Request | None, order_id) -> None:
        sync = getattr(request.app.state, "bitrix_sync", None) if request else None
        if sync is None:
            return
        schedule_push_created(sync, AsyncSessionLocal, str(order_id))

    @staticmethod
    def notify_bitrix_updated(request: Request | None, order_id, comment: str | None = None) -> None:
        """Вызывать из admin/dealer/manufacturer хендлеров после смены статуса."""
        sync = getattr(request.app.state, "bitrix_sync", None) if request else None
        if sync is None:
            return
        schedule_push_updated(sync, AsyncSessionLocal, str(order_id), comment=comment)
