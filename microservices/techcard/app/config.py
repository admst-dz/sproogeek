from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    s3_endpoint_url: str = Field("http://minio:9000", alias="S3_ENDPOINT_URL")
    s3_region: str = Field("us-east-1", alias="S3_REGION")
    s3_access_key: str = Field(..., alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field(..., alias="S3_SECRET_KEY")
    s3_bucket: str = Field("techcards", alias="S3_BUCKET")
    s3_force_path_style: bool = Field(True, alias="S3_FORCE_PATH_STYLE")
    s3_public_endpoint: str = Field("", alias="S3_PUBLIC_ENDPOINT")

    presign_expires_seconds: int = Field(3600, alias="PRESIGN_EXPIRES_SECONDS")

    manufacturer_name: str = Field("ООО «Спружык»", alias="MANUFACTURER_NAME")
    manufacturer_id: str = Field("SPRUZHYK-001", alias="MANUFACTURER_ID")


@lru_cache
def get_settings() -> Settings:
    return Settings()
