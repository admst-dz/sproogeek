from urllib.parse import urlencode

import httpx

from app.core.config import get_settings


YANDEX_AUTHORIZE_URL = "https://oauth.yandex.com/authorize"
YANDEX_TOKEN_URL = "https://oauth.yandex.com/token"
YANDEX_USERINFO_URL = "https://login.yandex.ru/info"
YANDEX_LOGIN_SCOPE = "login:info login:email login:avatar"


def build_yandex_authorize_url(redirect_uri: str, state: str) -> str:
    settings = get_settings()
    if not settings.yandex_client_id:
        raise ValueError("Yandex OAuth is not configured")

    query = urlencode(
        {
            "response_type": "code",
            "client_id": settings.yandex_client_id,
            "redirect_uri": redirect_uri,
            "scope": YANDEX_LOGIN_SCOPE,
            "state": state,
        }
    )
    return f"{YANDEX_AUTHORIZE_URL}?{query}"


async def exchange_yandex_code(code: str, _redirect_uri: str) -> dict:
    settings = get_settings()
    if not settings.yandex_client_id or not settings.yandex_client_secret:
        raise ValueError("Yandex OAuth is not configured")

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            YANDEX_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.yandex_client_id,
                "client_secret": settings.yandex_client_secret,
            },
        )
        if token_resp.status_code != 200:
            raise ValueError("Yandex token exchange failed")

        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise ValueError("No access_token in Yandex response")

        userinfo_resp = await client.get(
            YANDEX_USERINFO_URL,
            params={"format": "json"},
            headers={"Authorization": f"OAuth {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise ValueError("Failed to get user info from Yandex")

        payload = userinfo_resp.json()
        if not payload.get("id"):
            raise ValueError("Yandex ID not found in profile")
        return payload


def extract_yandex_email(payload: dict) -> str:
    email = str(payload.get("default_email") or "").strip().lower()
    if email:
        return email
    emails = payload.get("emails") or []
    if isinstance(emails, list) and emails:
        return str(emails[0] or "").strip().lower()
    return ""


def extract_yandex_avatar_url(payload: dict) -> str:
    avatar_id = payload.get("default_avatar_id")
    if not avatar_id or payload.get("is_avatar_empty") is True:
        return ""
    return f"https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"
