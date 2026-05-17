class BitrixError(RuntimeError):
    """Любая ошибка при общении с Bitrix24 REST API."""


class BitrixAuthError(BitrixError):
    """Неверный webhook URL или отозванный токен."""


class BitrixNotConfigured(BitrixError):
    """Интеграция выключена/не настроена — синхронизацию делать не нужно."""
