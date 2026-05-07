import os
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi_pagination import add_pagination
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1 import ai, admin, auth, dealer, events, files, manufacturer, orders, products, users
from app.core.config import get_settings
from app.core.event_logger import event_logger
from app.core.kafka import kafka_producer
from app.core.logging_middleware import EventLoggingMiddleware
from app.database import get_db


settings = get_settings()

UPLOAD_ROOT = "uploads"


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(UPLOAD_ROOT, exist_ok=True)
    event_logger.log("APP_STARTUP", "Backend application startup")
    await kafka_producer.start()
    try:
        yield
    finally:
        await kafka_producer.stop()
        event_logger.log("APP_SHUTDOWN", "Backend application shutdown")


if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=1.0,
        environment=settings.app_env,
    )


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title=settings.app_title, version=settings.app_version, lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; frame-ancestors 'none'; object-src 'none'"
        )
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers.pop("server", None)
        return response


class LimitUploadSize(BaseHTTPMiddleware):
    def __init__(self, app, max_bytes: int) -> None:
        super().__init__(app)
        self._max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        if request.method in {"POST", "PUT", "PATCH"}:
            content_length = request.headers.get("content-length")
            try:
                size = int(content_length) if content_length else 0
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Invalid content length"})
            if size > self._max_bytes:
                return JSONResponse(status_code=413, content={"detail": "Payload too large"})
        return await call_next(request)


if settings.allowed_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

app.add_middleware(LimitUploadSize, max_bytes=settings.max_upload_bytes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(EventLoggingMiddleware)
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT, check_dir=False), name="uploads")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    sentry_sdk.capture_exception(exc)
    event_logger.log(
        "UNHANDLED_EXCEPTION",
        "Unhandled backend exception",
        direction="backend",
        method=request.method,
        path=request.url.path,
        status_code=500,
        request_id=getattr(request.state, "request_id", ""),
        details={"error_type": type(exc).__name__},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


@app.get("/api/health", tags=["DevOps"])
@limiter.limit("5/minute")
async def health_check(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        kafka_status = "connected" if kafka_producer.producer else "disconnected"
        return {"status": "ok", "db": "connected", "kafka": kafka_status}
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        raise HTTPException(status_code=503, detail="Service healthcheck failed") from exc


app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(orders.router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(products.router, prefix="/api/v1/products", tags=["Products"])
app.include_router(files.router, prefix="/api/v1/files", tags=["Files"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["AI"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(dealer.router, prefix="/api/v1/dealer", tags=["Dealer"])
app.include_router(manufacturer.router, prefix="/api/v1/manufacturer", tags=["Manufacturer"])
app.include_router(events.router, prefix="/api/v1/events", tags=["Events"])

add_pagination(app)
