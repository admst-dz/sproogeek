import logging
from functools import lru_cache

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import get_settings


log = logging.getLogger(__name__)


@lru_cache
def s3_client():
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url,
        region_name=s.s3_region,
        aws_access_key_id=s.s3_access_key,
        aws_secret_access_key=s.s3_secret_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if s.s3_force_path_style else "auto"},
        ),
    )


def ensure_bucket() -> None:
    s = get_settings()
    client = s3_client()
    try:
        client.head_bucket(Bucket=s.s3_bucket)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {"404", "NoSuchBucket", "NotFound"}:
            log.info("creating bucket %s", s.s3_bucket)
            client.create_bucket(Bucket=s.s3_bucket)
        else:
            raise


def upload_pdf(key: str, data: bytes) -> str:
    s = get_settings()
    client = s3_client()
    client.put_object(
        Bucket=s.s3_bucket,
        Key=key,
        Body=data,
        ContentType="application/pdf",
        ContentDisposition=f'attachment; filename="{key.rsplit("/", 1)[-1]}"',
    )
    return key


def presign_get(key: str) -> str:
    s = get_settings()
    url = s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": s.s3_bucket, "Key": key},
        ExpiresIn=s.presign_expires_seconds,
    )
    if s.s3_public_endpoint and s.s3_endpoint_url:
        url = url.replace(s.s3_endpoint_url, s.s3_public_endpoint, 1)
    return url


def get_object(key: str) -> bytes:
    s = get_settings()
    obj = s3_client().get_object(Bucket=s.s3_bucket, Key=key)
    return obj["Body"].read()
