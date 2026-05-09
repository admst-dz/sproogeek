"""Эндпоинт для отзывов с главной страницы.

Принимает имя/контакт/сообщение, асинхронно шлёт письмо на info@sproogeek.com
(или адрес из FEEDBACK_TO), а также записывает событие в event log — даже если
SMTP не настроен, отзыв не потеряется и его можно будет вытащить из логов.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.deps import request_id
from app.core.email import is_email_configured, send_email
from app.core.event_logger import event_logger


router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class FeedbackRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=40)
    rating: Optional[int] = Field(None, ge=1, le=5)
    message: str = Field(..., min_length=3, max_length=4000)


def _format_body(payload: FeedbackRequest, *, ip: str, user_agent: str) -> str:
    lines = [
        "Новый отзыв со spruzhyk.com / sproogeek.com",
        "",
        f"Имя:       {payload.name or '—'}",
        f"Email:     {payload.email or '—'}",
        f"Телефон:   {payload.phone or '—'}",
        f"Оценка:    {payload.rating if payload.rating is not None else '—'} / 5",
        "",
        "Сообщение:",
        payload.message.strip(),
        "",
        "─" * 40,
        f"IP клиента: {ip}",
        f"User-Agent: {user_agent}",
    ]
    return "\n".join(lines)


@router.post("", status_code=202)
@limiter.limit("5/minute")
async def submit_feedback(
    request: Request,
    payload: FeedbackRequest,
    background: BackgroundTasks,
):
    settings = get_settings()
    ip = get_remote_address(request) or "unknown"
    user_agent = request.headers.get("user-agent", "—")

    # Сохраняем отзыв в event log сразу — это «несгорающая» копия на случай
    # проблем с SMTP. По логам всегда можно найти и переотправить.
    event_logger.log(
        "FEEDBACK_RECEIVED",
        "User submitted homepage feedback",
        direction="user->backend",
        actor_type="anonymous",
        actor_email=str(payload.email) if payload.email else "",
        method=request.method,
        path=request.url.path,
        status_code=202,
        request_id=request_id(request),
        details={
            "name": payload.name,
            "phone": payload.phone,
            "rating": payload.rating,
            "message": payload.message,
            "ip": ip,
        },
    )

    if not is_email_configured():
        # Возвращаем 202 — клиенту «принято», админ увидит через event log.
        return {
            "status": "accepted",
            "delivered": False,
            "reason": "smtp_not_configured",
        }

    body = _format_body(payload, ip=ip, user_agent=user_agent)
    subject_name = payload.name or payload.email or "анонимный"
    subject = f"[Spruzhyk] Отзыв от {subject_name}"

    # send_email — синхронная (smtplib). Запускаем в thread pool через
    # background-task, чтобы не блокировать event-loop.
    async def _deliver() -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: send_email(
                to=settings.feedback_to,
                subject=subject,
                body=body,
                reply_to=str(payload.email) if payload.email else None,
            ),
        )

    background.add_task(_deliver)
    return {"status": "accepted", "delivered": True}
