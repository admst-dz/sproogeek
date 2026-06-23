# Развертывание

## Цели production-развертывания

Production-среда должна обеспечить:

- стабильный запуск backend, frontend, renderer, PostgreSQL и Kafka;
- корректную работу HTTPS и CORS;
- сохранность базы данных и загруженных файлов;
- сбор runtime-логов;
- безопасное хранение секретов.

## Переменные окружения production

Обязательные:

```env
APP_ENV=production
DATABASE_URL=postgresql+asyncpg://user:password@db:5432/spruzhyk
SECRET_KEY=<long-random-secret>
ALLOWED_ORIGINS=https://example.com,https://www.example.com
```

Рекомендуемые:

```env
ALLOWED_HOSTS=example.com,www.example.com,api.example.com
ACCESS_TOKEN_EXPIRE_MINUTES=1440
EVENT_LOG_DIR=/app/logs
EVENT_LOG_MAX_LINES=10000
ORDER_TYPES_DIR=/app/app/data/order_types
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
SENTRY_DSN=<sentry-dsn>
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
VK_CLIENT_ID=<vk-app-id>
VK_CLIENT_SECRET=<vk-secure-key>
```

Для VK в поле доверенного Redirect URL укажите URL фронтенда с путём
`/auth/vk/callback`, например `https://sproogeek.com/auth/vk/callback`.

`SECRET_KEY` должен быть длинным случайным значением. При смене ключа старые JWT станут недействительными.

## Порядок развертывания backend

1. Подготовить переменные окружения.
2. Убедиться, что база доступна.
3. Применить миграции Alembic.
4. Запустить ASGI-сервер.
5. Проверить `/api/health`.
6. Проверить появление CSV-логов при запросе.

## Порядок развертывания frontend

1. Собрать frontend.
2. Убедиться, что `VITE_API_URL` указывает на production API или используется reverse proxy `/api/v1`.
3. Отдать статические файлы через web server.
4. Проверить авторизацию, конфигуратор и кабинет.

## Порядок развертывания renderer

1. Убедиться, что renderer видит frontend render route.
2. Задать `RENDER_FRONTEND_HOST`, `RENDER_FRONTEND_PORT`, `RENDER_FRONTEND_PATH`.
3. Для NVIDIA GPU-хоста запустить `docker compose -f docker-compose.prod.yml -f docker-compose.gpu.yml up -d`; override передаёт GPU контейнеру и включает аппаратный Chromium. Для CPU-only fallback задать `RENDER_GPU_MODE=software`.
4. Настроить cloud-лимиты: `CLOUD_RENDER_MAX_SESSIONS`, `CLOUD_RENDER_FPS`, `CLOUD_RENDER_JPEG_QUALITY`, `CLOUD_RENDER_SESSION_TTL_MS`.
5. Проверить `/cloud-render/poster/notebook.jpg`, затем открыть конфигуратор и убедиться, что виден индикатор `Cloud 3D`.
6. Проверить создание render через создание тестового заказа и появление PNG в `uploads/renders`.

MJPEG требует отключённой proxy/CDN-буферизации и долгого read timeout. Репозиторный `frontend/nginx.conf` уже задаёт `proxy_buffering off`, `X-Accel-Buffering: no` и timeout 3600 секунд для `/cloud-render/`. Аналогичные настройки нужны на внешнем reverse proxy.

Рекомендуемые исходные значения для одного GPU-инстанса: 8 сессий, 15 FPS, JPEG quality 72, максимум 1600×1000. Поднимать FPS/качество следует только после измерения GPU, CPU encoder time и исходящего трафика. Переход на WebRTC + H.264/AV1/NVENC можно сделать позже, сохранив текущий API конфигурации и управления.

## Логи

Backend пишет CSV-логи в `EVENT_LOG_DIR` или в `logs` внутри проекта.

Рекомендуется:

- монтировать директорию логов как persistent volume;
- собирать CSV централизованным агентом;
- архивировать старые файлы;
- не отдавать папку `logs` наружу через web server;
- ограничить доступ к логам, так как они содержат email, id пользователей и историю заказов.

Один файл содержит максимум 10 000 строк. Новые файлы создаются автоматически.

## Загруженные файлы

Backend использует:

```text
uploads/logos
uploads/renders
```

Эта директория должна быть persistent volume. Если контейнер пересоздается без volume, загруженные логотипы и render-изображения будут потеряны.

## JSON типы заказов

Файлы типов заказов лежат в `ORDER_TYPES_DIR`. Для production лучше хранить их на persistent volume или доставлять как часть релиза с резервным копированием.

Администратор может редактировать файлы через панель. После правки рекомендуется:

1. открыть JSON в панели повторно;
2. создать тестовый заказ соответствующего типа;
3. проверить CSV-событие `ORDER_TYPE_JSON_UPDATED`.

## Безопасность перед запуском

Проверьте:

- `APP_ENV=production`;
- `SECRET_KEY` задан и не равен dev-значению;
- `ALLOWED_ORIGINS` содержит только реальные домены;
- `ALLOWED_HOSTS` настроен под реальные host;
- реальные секреты не лежат в Git;
- HTTPS включен на внешнем контуре;
- reverse proxy не публикует `/logs`;
- доступ к админским учетным записям ограничен;
- SVG/EPS не используются для загрузки логотипов;
- Sentry или другой мониторинг получает ошибки backend.

## Бэкапы

Нужно сохранять:

- PostgreSQL;
- `uploads`;
- JSON типы заказов, если они изменяются в production;
- архивные CSV-логи, если они нужны для аудита.

Минимальная политика:

- ежедневный бэкап базы;
- ежедневный бэкап `uploads`;
- бэкап JSON типов заказов после каждого изменения;
- хранение логов согласно требованиям бизнеса и законодательства.

## Healthcheck

Endpoint:

```text
GET /api/health
```

Успешный ответ:

```json
{
  "status": "ok",
  "db": "connected",
  "kafka": "connected"
}
```

Если Kafka недоступна, backend может продолжать принимать заказы, но события не будут опубликованы. Такие случаи фиксируются в CSV-логах.

## Rollback

При откате:

1. остановить новую версию;
2. вернуть предыдущий backend/frontend/renderer artifact;
3. убедиться, что схема базы совместима;
4. восстановить JSON типы заказов из бэкапа, если они менялись;
5. проверить `/api/health`;
6. создать тестовый заказ.

Если миграция базы несовместима назад, rollback должен выполняться по отдельному плану миграций.
