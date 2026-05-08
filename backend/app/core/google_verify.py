import httpx

from app.core.config import get_settings


GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


async def exchange_google_code(code: str) -> dict:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise ValueError("Google OAuth is not configured")

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": "postmessage",
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise ValueError("Token exchange failed")

        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise ValueError("No access_token in Google response")

        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise ValueError("Failed to get user info from Google")

        payload = userinfo_resp.json()
        if not payload.get("email"):
            raise ValueError("Email not found in Google token")
        # Без этой проверки владелец произвольного Google Workspace мог бы
        # выпустить токен с чужим (не подтверждённым) email и захватить аккаунт.
        if payload.get("email_verified") is not True:
            raise ValueError("Google email is not verified")
        return payload
