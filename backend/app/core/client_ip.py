"""Возвращает реальный IP клиента, прошедшего через Cloudflare + Caddy.

После деплоя за CF + Caddy на хосте:
- request.client.host — это адрес ближайшего прокси (127.0.0.1 от Caddy).
- CF присылает оригинальный IP клиента в заголовке `CF-Connecting-IP`.
- Caddy прописан так, что заменяет X-Real-IP / X-Forwarded-For этим значением.

Без хелпера ниже все slowapi-лимитеры считают, что весь интернет — это один
клиент (127.0.0.1), и rate-limit становится бесполезным.

Безопасность: cf-connecting-ip нельзя подделать в нашем сетапе, потому что
ufw и фаервол хостинга разрешают входящие на 80/443 только с подсетей CF.
Заголовок, пришедший напрямую (минуя CF), физически не дойдёт до Caddy.
"""
from __future__ import annotations

from fastapi import Request


def get_client_ip(request: Request) -> str:
    """Возвращает первый источник, который указал на реальный IP клиента."""
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf
    real = request.headers.get("x-real-ip")
    if real:
        return real
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def slowapi_key(request: Request) -> str:
    """key_func для slowapi.Limiter, чтобы лимитировать по реальному IP, а не по 127.0.0.1."""
    return get_client_ip(request)
