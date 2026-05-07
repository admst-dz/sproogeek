# Хранилище S3 (MinIO в dev, S3-совместимое в prod)

Все сгенерированные техкарты и (в перспективе) рендеры/PDF-согласования складываются
в S3-совместимый бакет. В dev-окружении это локальный **MinIO** в Docker, в prod —
любой S3-совместимый сервис (AWS S3, Selectel, Yandex Object Storage, Cloudflare R2 и т.д.).

## Где смотреть в dev

После `docker compose up -d` поднимается:

| Адрес                        | Что это                                   |
| ---------------------------- | ----------------------------------------- |
| `http://localhost:9000`      | S3 API — для приложений (boto3, awscli)   |
| `http://localhost:9001`      | Web-консоль MinIO для людей               |

Логин/пароль по умолчанию (`docker-compose.yml`):

```
MINIO_ROOT_USER=spruzhyk
MINIO_ROOT_PASSWORD=spruzhyk-dev-secret
```

Через консоль:

1. Открыть `http://localhost:9001`.
2. Залогиниться `spruzhyk` / `spruzhyk-dev-secret`.
3. Слева **Buckets** → `techcards` → видишь папки вида `<order_id>/techcard-<timestamp>.pdf`.
4. Кликнуть по файлу → **Preview** или **Download**.

> Бакет `techcards` создаётся автоматически при старте `techcard`-сервиса
> (см. `microservices/techcard/app/storage.py:ensure_bucket`).

## Как смотреть из CLI

Через **mc** (MinIO Client) — поставить локально:

```bash
brew install minio/stable/mc           # macOS
mc alias set local http://localhost:9000 spruzhyk spruzhyk-dev-secret

mc ls local/techcards                  # список заказов
mc ls local/techcards/<order_id>/      # файлы конкретного заказа
mc cp local/techcards/<order_id>/techcard-XXXXX.pdf .   # скачать
mc cat local/techcards/<order_id>/techcard-XXXXX.pdf | open -fa Preview
```

Через **awscli** (любой S3-совместимый бакет):

```bash
aws --endpoint-url http://localhost:9000 \
    --profile minio \
    s3 ls s3://techcards/

# ~/.aws/credentials
# [minio]
# aws_access_key_id = spruzhyk
# aws_secret_access_key = spruzhyk-dev-secret
```

## Как смотреть через бэкенд (продакшн-флоу)

Админ открывает заказ в `AdminDashboard` → жмёт **«⬇ Техкарта PDF»**:

1. Фронт делает `POST /api/v1/admin/orders/{id}/techcard` — бэк зовёт `techcard`-сервис,
   тот рендерит и кладёт в S3, возвращает `{s3_key, download_url, bytes}`.
2. Фронт сразу делает `GET /api/v1/admin/orders/{id}/techcard.pdf?filename=<…>` —
   бэк читает байты из S3 и стримит браузеру.

То есть пользователю не нужны прямой доступ к MinIO — всё проксируется через
авторизованный backend. Но если надо **глазами** перепроверить — заходим в консоль (см. выше).

## Структура ключей в S3

```
techcards/
├── 4f7a-…-2c5b/                      # order_id (UUID)
│   ├── techcard-20260507-104512.pdf  # генерация 1
│   └── techcard-20260507-115903.pdf  # перегенерация
└── 8b91-…-aa31/
    └── techcard-20260507-120014.pdf
```

Имя файла содержит UTC-timestamp — старые версии техкарты не перезаписываются,
их можно посмотреть в истории.

## Прод: как подключить внешний S3

В `.env` для прода (см. `docker-compose.prod.yml`):

```env
S3_ENDPOINT_URL=https://s3.selectel.ru
S3_PUBLIC_ENDPOINT=                       # оставить пустым, если не отличается
S3_REGION=ru-1
S3_ACCESS_KEY=<service-key>
S3_SECRET_KEY=<service-secret>
S3_BUCKET=spruzhyk-techcards
```

Бакет нужно создать заранее в кабинете провайдера (в проде сервис не пытается
создавать его сам, чтобы случайно не натворить). Доступ — `private`,
файлы из бэкенда отдаются через presigned URL или проксированием.

## Бэкап / ретенция

Сейчас политика жизни объектов **не настроена**. Рекомендации:

- **dev (MinIO):** периодически чистить вручную `mc rm --recursive --force local/techcards`,
  или дать MinIO ILM-правило: «удалять > 30 дней».
- **prod:** настроить в кабинете провайдера lifecycle:
  - перевод в `Glacier`/`cold` через 90 дней,
  - удаление по запросу (заказ закрыт + N лет).

## Траблшутинг

| Симптом | Причина / лечение |
|---------|-------------------|
| `503 NotFound` при загрузке файла из admin UI | `techcard` сервис не дотянулся до S3. Проверить `docker logs spruzhuk_techcard`. |
| `NoSuchBucket` в логах | Бакет не создан и/или у service-key нет прав на `CreateBucket`. В проде — создать руками. |
| Presigned URL отдаёт `localhost:9000` снаружи Docker | Выставить `S3_PUBLIC_ENDPOINT` в реальный публичный адрес — бэкенд подменит хост в URL. |
| Console показывает `0 bytes` | `Content-Length` не выставлен — обычно проблема с MinIO версией. Перезапустить `minio` контейнер. |
