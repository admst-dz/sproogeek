import os
import posixpath
import uuid
from typing import Optional
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool


TRUE_VALUES = {"1", "true", "yes", "on"}


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in TRUE_VALUES


class S3Storage:
    def __init__(self) -> None:
        self.bucket_name = os.getenv("S3_BUCKET_NAME") or os.getenv("S3_BUCKET")
        self.endpoint_url = os.getenv("S3_ENDPOINT_URL")
        self.public_base_url = os.getenv("S3_PUBLIC_BASE_URL")
        self.region_name = os.getenv("S3_REGION") or os.getenv("AWS_DEFAULT_REGION") or "ru-central1"
        self.media_prefix = os.getenv("S3_MEDIA_PREFIX", "media").strip("/")
        self.force_path_style = _env_bool("S3_FORCE_PATH_STYLE", default=True)
        self.access_key_id = os.getenv("S3_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
        self.secret_access_key = os.getenv("S3_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")
        self.session_token = os.getenv("S3_SESSION_TOKEN") or os.getenv("AWS_SESSION_TOKEN")
        self.object_acl = os.getenv("S3_OBJECT_ACL")
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._ensure_configured()
            addressing_style = "path" if self.force_path_style else "virtual"
            self._client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                region_name=self.region_name,
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
                aws_session_token=self.session_token,
                config=Config(signature_version="s3v4", s3={"addressing_style": addressing_style}),
            )
        return self._client

    def _ensure_configured(self) -> None:
        if not self.bucket_name:
            raise HTTPException(status_code=503, detail="S3 bucket is not configured")
        if not self.access_key_id or not self.secret_access_key:
            raise HTTPException(status_code=503, detail="S3 credentials are not configured")

    def build_key(self, folder: str, filename: Optional[str] = None) -> str:
        safe_folder = folder.strip("/").replace("\\", "/")
        safe_filename = filename or f"{uuid.uuid4().hex}.bin"
        parts = [part for part in [self.media_prefix, safe_folder, safe_filename] if part]
        return posixpath.join(*parts)

    def public_url(self, key: str) -> str:
        quoted_key = quote(key, safe="/")
        if self.public_base_url:
            return f"{self.public_base_url.rstrip('/')}/{quoted_key}"

        if self.endpoint_url:
            return f"{self.endpoint_url.rstrip('/')}/{self.bucket_name}/{quoted_key}"

        return f"https://{self.bucket_name}.s3.{self.region_name}.amazonaws.com/{quoted_key}"

    async def upload_bytes(
        self,
        *,
        content: bytes,
        folder: str,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> dict:
        key = self.build_key(folder=folder, filename=filename)
        extra_args = {
            "ContentType": content_type or "application/octet-stream",
        }
        if self.object_acl:
            extra_args["ACL"] = self.object_acl

        try:
            await run_in_threadpool(
                self.client.put_object,
                Bucket=self.bucket_name,
                Key=key,
                Body=content,
                **extra_args,
            )
        except (BotoCoreError, ClientError) as exc:
            raise HTTPException(status_code=502, detail="Failed to upload media to S3") from exc

        return {"key": key, "url": self.public_url(key)}


s3_storage = S3Storage()
