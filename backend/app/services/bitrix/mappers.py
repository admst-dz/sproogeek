"""Маппинг Order ↔ поля сделки Bitrix24.

Поля Bitrix делятся на:
 * системные (TITLE, STAGE_ID, OPPORTUNITY, CURRENCY_ID, COMMENTS …);
 * пользовательские (UF_CRM_*) — создаются в админке Bitrix вручную, их
   технические имена надо положить в ENV (см. inst.txt → раздел 4).

Маппинг отделён от клиента, чтобы при изменении модели или схемы
"кастомных" полей правки локализовались в одном месте.
"""
from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.models.order import Order
from app.models.user import User


# Маппинг внутренних статусов заказа → STAGE_ID воронки Bitrix.
# STAGE_ID в Bitrix имеет формат "C<category_id>:<code>" для не-дефолтной
# воронки, либо просто "NEW", "PREPARATION", "EXECUTING" и т.п. для дефолта.
# Дефолтная воронка используется, пока в ENV не задан BITRIX_DEAL_CATEGORY_ID.
_DEFAULT_STAGE_MAP = {
    "new": "NEW",
    "in_progress": "PREPARATION",
    "approved": "EXECUTING",
    "production": "EXECUTING",
    "shipped": "FINAL_INVOICE",
    "completed": "WON",
    "cancelled": "LOSE",
    "rejected": "LOSE",
}


def stage_id_for(order_status: str) -> str:
    settings = get_settings()
    if settings.bitrix_stage_map:
        # допустим формат "new=C1:NEW,approved=C1:PREPARATION"
        try:
            pairs = dict(item.split("=", 1) for item in settings.bitrix_stage_map.split(","))
            if order_status in pairs:
                return pairs[order_status].strip()
        except ValueError:
            pass
    code = _DEFAULT_STAGE_MAP.get(order_status, "NEW")
    if settings.bitrix_deal_category_id:
        return f"C{settings.bitrix_deal_category_id}:{code}"
    return code


def _short_id(order: Order) -> str:
    return str(order.id)[:8].upper()


def deal_title(order: Order, user: User | None) -> str:
    actor = (user.company_name or user.display_name or user.email) if user else (order.user_email or "guest")
    product = order.product_name or "Заказ Spruzhyk"
    return f"Spruzhyk #{_short_id(order)} — {product} ({actor})"


def deal_fields(order: Order, user: User | None) -> dict[str, Any]:
    """Базовый набор полей для crm.deal.add / crm.deal.update.

    Кастомные поля добавляются опционально — если их UF-имена не настроены
    в ENV, мы их просто не отправляем.
    """
    settings = get_settings()
    fields: dict[str, Any] = {
        "TITLE": deal_title(order, user),
        "STAGE_ID": stage_id_for(order.status or "new"),
        "OPPORTUNITY": float(order.total_price) if order.total_price else 0,
        "CURRENCY_ID": order.currency or "BYN",
        "COMMENTS": _build_comment(order),
        "SOURCE_ID": settings.bitrix_source_id or "WEB",
    }
    if settings.bitrix_deal_category_id:
        fields["CATEGORY_ID"] = settings.bitrix_deal_category_id
    if settings.bitrix_assigned_by_id:
        fields["ASSIGNED_BY_ID"] = settings.bitrix_assigned_by_id

    # UF-поля — пишем только то, что настроено
    if settings.bitrix_uf_order_id:
        fields[settings.bitrix_uf_order_id] = str(order.id)
    if settings.bitrix_uf_order_url and settings.public_admin_order_url_template:
        fields[settings.bitrix_uf_order_url] = (
            settings.public_admin_order_url_template.format(order_id=order.id)
        )
    if settings.bitrix_uf_quantity:
        fields[settings.bitrix_uf_quantity] = int(order.quantity or 1)
    if settings.bitrix_uf_product_name:
        fields[settings.bitrix_uf_product_name] = order.product_name or ""

    return fields


def _build_comment(order: Order) -> str:
    """Краткая текстовая выжимка для поля COMMENTS / timeline.

    Менеджеры в Bitrix не будут смотреть JSON, нужна человеко-читаемая
    сводка. Полная конфигурация и ссылка на админку — в кастомных полях.
    """
    cfg = order.configuration or {}
    parts = [
        f"Заказ Spruzhyk: {order.id}",
        f"Статус: {order.status}",
        f"Количество: {order.quantity}",
    ]
    if order.total_price:
        parts.append(f"Сумма: {order.total_price} {order.currency or 'BYN'}")
    if isinstance(cfg.get("contact"), dict):
        c = cfg["contact"]
        if c.get("phone"):
            parts.append(f"Телефон: {c['phone']}")
        if c.get("address"):
            parts.append(f"Адрес: {c['address']}")
    if isinstance(cfg.get("delivery"), dict):
        d = cfg["delivery"]
        method = d.get("method")
        if method:
            parts.append(f"Получение: {'Доставка почтовым сервисом' if method == 'postal_service' else 'Самовывоз'}")
        if d.get("recipient_full_name"):
            parts.append(f"Получатель: {d['recipient_full_name']}")
        if d.get("formatted_address") and not (isinstance(cfg.get("contact"), dict) and cfg["contact"].get("address")):
            parts.append(f"Адрес: {d['formatted_address']}")
    if cfg.get("notes") or cfg.get("comment"):
        parts.append(f"Комментарий: {cfg.get('notes') or cfg.get('comment')}")
    return "\n".join(parts)


def contact_fields(user: User | None, order: Order) -> dict[str, Any]:
    """Поля для crm.contact.add — используются, если контакт не найден по email."""
    email = (user.email if user else order.user_email) or ""
    name = ""
    if user:
        name = user.display_name or user.company_name or ""
    cfg = order.configuration or {}
    if isinstance(cfg.get("contact"), dict):
        name = cfg["contact"].get("name") or name
        phone = cfg["contact"].get("phone")
    else:
        phone = None

    fields: dict[str, Any] = {
        "NAME": name or email or "Гость Spruzhyk",
        "OPENED": "Y",
        "TYPE_ID": "CLIENT",
        "SOURCE_ID": "WEB",
    }
    if email:
        fields["EMAIL"] = [{"VALUE": email, "VALUE_TYPE": "WORK"}]
    if phone:
        fields["PHONE"] = [{"VALUE": phone, "VALUE_TYPE": "WORK"}]
    return fields
