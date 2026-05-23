"""Async Redis cache helper.

- `get_cache()` возвращает singleton-клиент redis.asyncio.
- `cached(prefix, ttl)` — декоратор для async-функций. Ключ строится из
  prefix + repr(args/kwargs). Сериализация — JSON.
- При недоступности Redis декоратор молча пропускает кеш (LOG warning),
  чтобы кратковременные сетевые проблемы не валили endpoint.

Использовать ТОЛЬКО для read-only справочных данных (catalog, materials,
settings). Для write-инвалидации делайте `await get_cache().delete(...)`
после mutation.
"""

from __future__ import annotations

import functools
import hashlib
import logging
from typing import Any, Awaitable, Callable, Optional

import orjson
import redis.asyncio as aioredis

from app.core.config import get_settings


logger = logging.getLogger(__name__)
_settings = get_settings()
_client: Optional[aioredis.Redis] = None


def get_cache() -> aioredis.Redis:
    """Lazy-init shared Redis client. Single connection pool per process.

    decode_responses=False, потому что в кеше теперь лежит сырой orjson
    (bytes) — это быстрее и спасает от двойного перевода str↔bytes.
    """
    global _client
    if _client is None:
        _client = aioredis.from_url(
            _settings.redis_url,
            decode_responses=False,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
            health_check_interval=30,
        )
    return _client


def _build_key(prefix: str, args: tuple, kwargs: dict) -> str:
    # Skip self/AsyncSession/Request объекты — они не влияют на кеш-ключ.
    serializable = []
    for a in args:
        cls_name = type(a).__name__
        if cls_name in {"AsyncSession", "Request", "Depends"}:
            continue
        serializable.append(repr(a))
    payload = orjson.dumps(
        {"a": serializable, "k": {k: repr(v) for k, v in sorted(kwargs.items())}},
        option=orjson.OPT_SORT_KEYS,
        default=str,
    )
    digest = hashlib.sha1(payload).hexdigest()[:16]
    return f"cache:{prefix}:{digest}"


def cached(
    prefix: str,
    ttl: Optional[int] = None,
    key_fn: Optional[Callable[..., str]] = None,
):
    """Декоратор для кеширования результата async-функции в Redis."""

    effective_ttl = ttl if ttl is not None else _settings.cache_default_ttl

    def decorator(fn: Callable[..., Awaitable[Any]]):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            cache = get_cache()
            try:
                key = key_fn(*args, **kwargs) if key_fn else _build_key(prefix, args, kwargs)
                cached_raw = await cache.get(key)
                if cached_raw is not None:
                    return orjson.loads(cached_raw)
            except Exception as e:  # noqa: BLE001
                logger.warning("cache.get failed (%s) — bypass: %s", prefix, e)
                key = None

            result = await fn(*args, **kwargs)

            if key is not None:
                try:
                    await cache.set(key, orjson.dumps(result, default=str), ex=effective_ttl)
                except Exception as e:  # noqa: BLE001
                    logger.warning("cache.set failed (%s): %s", prefix, e)

            return result

        return wrapper

    return decorator


async def invalidate(prefix: str) -> None:
    """Удалить все ключи с данным префиксом. Для write-операций."""
    cache = get_cache()
    pattern = f"cache:{prefix}:*"
    try:
        async for key in cache.scan_iter(match=pattern, count=100):
            await cache.delete(key)
    except Exception as e:  # noqa: BLE001
        logger.warning("cache.invalidate failed (%s): %s", prefix, e)


async def close_cache() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        finally:
            _client = None
