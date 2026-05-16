"""Bitrix24 CRM integration.

Назначение: продублировать жизненный цикл заказа из Spruzhyk в Bitrix24,
чтобы дилеры и производственники видели те же сделки в привычной CRM
параллельно с сайтом. Полностью односторонний push (сайт → Bitrix) с
опциональным обратным каналом для синхронизации статусов сделки.

Подробности настройки — см. ``inst.txt`` рядом с этим файлом.
"""
from app.services.bitrix.client import BitrixClient, BitrixError
from app.services.bitrix.sync import BitrixSyncService

__all__ = ["BitrixClient", "BitrixError", "BitrixSyncService"]
