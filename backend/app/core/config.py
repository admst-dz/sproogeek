from functools import lru_cache
from typing import Annotated, List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = Field("development", alias="APP_ENV")
    app_title: str = "Spruzhyk API"
    app_version: str = "1.4.0"

    database_url: str = Field("", alias="DATABASE_URL")
    database_user: str = Field("postgres", alias="DATABASE_USER")
    database_password: str = Field("", alias="DATABASE_PASSWORD")
    database_host: str = Field("db", alias="DATABASE_HOST")
    database_port: int = Field(5432, alias="DATABASE_PORT")
    database_name: str = Field("spruzhuk", alias="DATABASE_NAME")

    secret_key: str = Field("dev-only-secret-change-before-production", alias="SECRET_KEY")
    access_token_expire_minutes: int = Field(43200, alias="ACCESS_TOKEN_EXPIRE_MINUTES")

    google_client_id: str = Field("", alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field("", alias="GOOGLE_CLIENT_SECRET")
    yandex_client_id: str = Field("", alias="YANDEX_CLIENT_ID")
    yandex_client_secret: str = Field("", alias="YANDEX_CLIENT_SECRET")
    vk_client_id: str = Field("", alias="VK_CLIENT_ID")
    vk_client_secret: str = Field("", alias="VK_CLIENT_SECRET")

    kafka_bootstrap_servers: str = Field("", alias="KAFKA_BOOTSTRAP_SERVERS")

    sentry_dsn: str = Field("", alias="SENTRY_DSN")

    allowed_hosts: Annotated[List[str], NoDecode] = Field(default_factory=list, alias="ALLOWED_HOSTS")
    allowed_origins: Annotated[List[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost",
            "http://127.0.0.1",
        ],
        alias="ALLOWED_ORIGINS",
    )

    renderer_url: str = Field("http://renderer:3000", alias="RENDERER_URL")
    renderer_timeout_seconds: float = Field(20.0, alias="RENDERER_TIMEOUT_SECONDS")

    techcard_url: str = Field("http://techcard:8000", alias="TECHCARD_URL")
    techcard_timeout_seconds: float = Field(60.0, alias="TECHCARD_TIMEOUT_SECONDS")

    unwrap_url: str = Field("http://unwrap:8000", alias="UNWRAP_URL")
    unwrap_timeout_seconds: float = Field(60.0, alias="UNWRAP_TIMEOUT_SECONDS")

    block_builder_url: str = Field("http://block_builder:8000", alias="BLOCK_BUILDER_URL")
    block_builder_timeout_seconds: float = Field(60.0, alias="BLOCK_BUILDER_TIMEOUT_SECONDS")

    glb_unwrapper_url: str = Field("http://glb_unwrapper:8000", alias="GLB_UNWRAPPER_URL")
    glb_unwrapper_timeout_seconds: float = Field(60.0, alias="GLB_UNWRAPPER_TIMEOUT_SECONDS")

    s3_endpoint_url: str = Field("", alias="S3_ENDPOINT_URL")
    s3_public_endpoint: str = Field("", alias="S3_PUBLIC_ENDPOINT")
    s3_region: str = Field("us-east-1", alias="S3_REGION")
    s3_access_key: str = Field("", alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field("", alias="S3_SECRET_KEY")
    s3_bucket: str = Field("techcards", alias="S3_BUCKET")

    max_upload_bytes: int = Field(25_000_000, alias="MAX_UPLOAD_BYTES")
    max_logo_bytes: int = Field(25_000_000, alias="MAX_LOGO_BYTES")
    background_removal_max_edge: int = Field(2400, alias="BACKGROUND_REMOVAL_MAX_EDGE")

    admin_backdoor_enabled: bool = Field(False, alias="ADMIN_BACKDOOR_ENABLED")
    admin_backdoor_login: str = Field("", alias="ADMIN_BACKDOOR_LOGIN")
    admin_backdoor_password: str = Field("", alias="ADMIN_BACKDOOR_PASSWORD")
    admin_backdoor_key: str = Field("", alias="ADMIN_BACKDOOR_KEY")
    admin_backdoor_email: str = Field("admin@spruzhyk.internal", alias="ADMIN_BACKDOOR_EMAIL")

    redis_url: str = Field("redis://redis:6379/0", alias="REDIS_URL")
    cache_default_ttl: int = Field(300, alias="CACHE_DEFAULT_TTL")

    # ─── Bitrix24 CRM ─────────────────────────────────────────────────────
    # Подробности — backend/app/services/bitrix/inst.txt
    bitrix_webhook_url: str = Field("", alias="BITRIX_WEBHOOK_URL")
    bitrix_portal_host: str = Field("", alias="BITRIX_PORTAL_HOST")
    bitrix_timeout_seconds: float = Field(15.0, alias="BITRIX_TIMEOUT_SECONDS")
    bitrix_deal_category_id: int = Field(0, alias="BITRIX_DEAL_CATEGORY_ID")
    bitrix_assigned_by_id: int = Field(0, alias="BITRIX_ASSIGNED_BY_ID")
    bitrix_source_id: str = Field("WEB", alias="BITRIX_SOURCE_ID")
    bitrix_incoming_token: str = Field("", alias="BITRIX_INCOMING_TOKEN")
    bitrix_stage_map: str = Field("", alias="BITRIX_STAGE_MAP")
    bitrix_reverse_stage_map: str = Field("", alias="BITRIX_REVERSE_STAGE_MAP")
    bitrix_uf_order_id: str = Field("", alias="BITRIX_UF_ORDER_ID")
    bitrix_uf_order_url: str = Field("", alias="BITRIX_UF_ORDER_URL")
    bitrix_uf_quantity: str = Field("", alias="BITRIX_UF_QUANTITY")
    bitrix_uf_product_name: str = Field("", alias="BITRIX_UF_PRODUCT_NAME")
    public_admin_order_url_template: str = Field(
        "", alias="PUBLIC_ADMIN_ORDER_URL_TEMPLATE"
    )

    # ─── Email (отправка отзывов с главной) ───────────────────────────────
    smtp_host: str = Field("", alias="SMTP_HOST")
    smtp_port: int = Field(587, alias="SMTP_PORT")
    smtp_username: str = Field("", alias="SMTP_USERNAME")
    smtp_password: str = Field("", alias="SMTP_PASSWORD")
    smtp_use_tls: bool = Field(True, alias="SMTP_USE_TLS")
    smtp_from: str = Field("", alias="SMTP_FROM")
    feedback_to: str = Field("info@sproogeek.com", alias="FEEDBACK_TO")

    @field_validator("allowed_hosts", "allowed_origins", mode="before")
    @classmethod
    def split_csv(cls, value):
        if value is None or value == "":
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("app_env")
    @classmethod
    def normalize_env(cls, value: str) -> str:
        return (value or "development").lower()

    @property
    def is_production(self) -> bool:
        return self.app_env in {"prod", "production"}

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return URL.create(
            "postgresql+asyncpg",
            username=self.database_user,
            password=self.database_password,
            host=self.database_host,
            port=self.database_port,
            database=self.database_name,
        ).render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production and settings.secret_key == "dev-only-secret-change-before-production":
        raise RuntimeError("SECRET_KEY must be set in production")
    return settings
