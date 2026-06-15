import os
import time
import uuid
from urllib.parse import parse_qsl, urlencode

from fastapi import Request
from jose import JWTError
from starlette.middleware.base import BaseHTTPMiddleware
from loguru import logger

from app.core.event_logger import event_logger
from app.core.security import decode_token

import sys


SENSITIVE_QUERY_KEYS = {
    "access_token",
    "auth",
    "code",
    "google_code",
    "jwt",
    "password",
    "secret",
    "token",
}


def _csv_env(name: str, default: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in os.getenv(name, default).split(",") if item.strip())


HTTP_LOG_ENABLED = os.getenv("HTTP_LOG_ENABLED", "true").lower() not in {"0", "false", "no", "off"}
HTTP_LOG_SKIP_METHODS = {item.upper() for item in _csv_env("HTTP_LOG_SKIP_METHODS", "OPTIONS")}
HTTP_LOG_SKIP_PATHS = _csv_env("HTTP_LOG_SKIP_PATHS", "/api/health,/healthz")
HTTP_LOG_SKIP_PATH_PREFIXES = _csv_env("HTTP_LOG_SKIP_PATH_PREFIXES", "/uploads/")


def _should_log_request(request: Request) -> bool:
    if not HTTP_LOG_ENABLED:
        return False
    if request.method.upper() in HTTP_LOG_SKIP_METHODS:
        return False
    path = request.url.path
    if path in HTTP_LOG_SKIP_PATHS:
        return False
    return not any(path.startswith(prefix) for prefix in HTTP_LOG_SKIP_PATH_PREFIXES)


def _sanitize_query(query: str) -> str:
    if not query:
        return ""
    safe_pairs = []
    for key, value in parse_qsl(query, keep_blank_values=True):
        if key.lower() in SENSITIVE_QUERY_KEYS:
            safe_pairs.append((key, "***"))
        else:
            safe_pairs.append((key, value))
    return urlencode(safe_pairs)


def _actor_from_request(request: Request) -> tuple[str, str, str]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return ("anonymous", "", "")
    token = auth.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except (JWTError, ValueError):
        return ("invalid_token", "", "")
    return (
        str(payload.get("role") or "authenticated"),
        str(payload.get("sub") or ""),
        str(payload.get("email") or ""),
    )


class EventLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = req_id

        should_log = _should_log_request(request)
        actor_type = actor_id = actor_email = ""
        client_host = request.client.host if request.client else ""
        log_path = request.url.path
        if should_log:
            actor_type, actor_id, actor_email = _actor_from_request(request)
            sanitized_query = _sanitize_query(request.url.query)
            log_path = request.url.path if not sanitized_query else f"{request.url.path}?{sanitized_query}"

        response = None
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            if should_log:
                latency_ms = round((time.perf_counter() - started) * 1000, 2)
                event_logger.log(
                    "HTTP_REQUEST",
                    "User HTTP request handled by backend",
                    direction="user->backend",
                    actor_type=actor_type,
                    actor_id=actor_id,
                    actor_email=actor_email,
                    peer=client_host,
                    method=request.method,
                    path=log_path,
                    status_code=status_code,
                    latency_ms=latency_ms,
                    ip=client_host,
                    user_agent=request.headers.get("user-agent", ""),
                    request_id=req_id,
                    details={
                        "content_length": request.headers.get("content-length"),
                        "referer": request.headers.get("referer"),
                    },
                )

logger.remove() # Удаляем стандартный обработчик, чтобы не двоились логи
logger.add(sys.stderr, level="INFO", colorize=True)
logger.add(
    "logs/app_{time:YYYY-MM-DD}.log",
    level="INFO",
    rotation="00:00",
    retention="30 days",
    compression="zip",
    encoding="utf-8",
    enqueue=True
)
