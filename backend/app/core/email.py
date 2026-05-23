"""Лёгкий SMTP-клиент для отправки служебных писем (отзывы и т.п.).

Используется только для непрерывных fire-and-forget уведомлений: если SMTP
не сконфигурирован, функция возвращает False и пишет warning в Sentry/логи,
но НЕ роняет API-запрос — отзыв всё равно записан в event log и не теряется.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

import sentry_sdk

from app.core.config import get_settings


log = logging.getLogger(__name__)


def is_email_configured() -> bool:
    settings = get_settings()
    return bool(settings.smtp_host and settings.smtp_from)


def send_email(
    *,
    to: str,
    subject: str,
    body: str,
    reply_to: Optional[str] = None,
    attachments: Optional[list[dict]] = None,
) -> bool:
    """Отправляет email. Возвращает True/False — без исключений.

    attachments: [{filename, content (bytes), mime_type}]. Используется
    для PDF-согласования или PNG-превью.
    """
    settings = get_settings()
    if not is_email_configured():
        log.warning("SMTP not configured — skipping email to %s", to)
        return False

    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(body)

    for att in attachments or []:
        content = att.get("content")
        filename = att.get("filename") or "attachment.bin"
        mime = att.get("mime_type") or "application/octet-stream"
        if not content:
            continue
        try:
            maintype, _, subtype = mime.partition("/")
            if not subtype:
                maintype, subtype = "application", "octet-stream"
            msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to attach %s: %s", filename, exc)

    try:
        if settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001 — log+report, never crash the request
        log.exception("Failed to send email to %s: %s", to, exc)
        sentry_sdk.capture_exception(exc)
        return False
