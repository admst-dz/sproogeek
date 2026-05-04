import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import order as crud_order
from app.crud import user as crud_user
from app.schemas.order import OrderCreate


class OrderService:
    @staticmethod
    def _build_order_json(order_data: OrderCreate, user, render_url: Optional[str] = None) -> dict:
        order_payload = json.loads(order_data.model_dump_json())
        configuration = order_payload.get("configuration") or {}

        if render_url:
            configuration["server_render_url"] = render_url

        order_payload["configuration"] = configuration
        order_payload["user_id"] = user.id
        order_payload["user_email"] = order_payload.get("user_email") or user.email

        return {
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "status": "new",
            "order": order_payload,
            "client": {
                "id": user.id,
                "email": user.email,
                "dealer_id": user.dealer_id,
            },
            "media": {
                "render_url": render_url,
            },
        }

    @staticmethod
    async def create_new_order(
        db: AsyncSession,
        order_data: OrderCreate,
        current_user_id: str,
        render_url: Optional[str] = None,
    ):
        user = await crud_user.get_user(db, current_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        processing_payload = OrderService._build_order_json(order_data, user, render_url)
        order_for_db = OrderCreate(**processing_payload["order"])

        return await crud_order.create_order(
            db, order_for_db, processing_payload=processing_payload, dealer_id=user.dealer_id
        )
