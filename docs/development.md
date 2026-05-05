# Разработка

## Требования

Для локальной разработки нужны:

- Python 3.9+;
- Node.js 20+;
- PostgreSQL;
- Kafka, если проверяются события;
- Chromium-зависимости для renderer, если проверяется серверный render.

## Структура проекта

```text
backend/                 FastAPI backend
frontend/                React/Vite frontend
microservices/renderer/  Node.js renderer
docs/                    документация
logs/                    runtime CSV-логи, не хранить в Git
```

Docker и GitHub workflow-файлы не меняются в рамках обычной backend/frontend разработки без отдельной задачи.

## Backend

Установка зависимостей:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Минимальные переменные окружения:

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/spruzhyk
SECRET_KEY=local-dev-secret
APP_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Миграции:

```powershell
cd backend
alembic upgrade head
```

Запуск:

```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Проверка health:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

## Frontend

Установка:

```powershell
cd frontend
npm install
```

Запуск:

```powershell
cd frontend
npm run dev
```

Переменная API:

```env
VITE_API_URL=http://localhost:8000/api/v1
```

Если переменная не задана, frontend использует `/api/v1`, что удобно за reverse proxy.

## Renderer

Установка:

```powershell
cd microservices/renderer
npm install
```

Запуск:

```powershell
cd microservices/renderer
npm start
```

Важные переменные:

| Переменная | Значение |
| --- | --- |
| `RENDER_FRONTEND_HOST` | host frontend для render route |
| `RENDER_FRONTEND_PORT` | порт frontend |
| `RENDER_FRONTEND_PATH` | путь render route, по умолчанию `/render/` |

## Работа с логами

Логи создаются автоматически при первом событии:

```text
logs/events_20260504_0001.csv
```

Во время разработки удобно смотреть последние строки:

```powershell
Get-Content .\logs\events_*.csv -Tail 20
```

Не добавляйте runtime-логи в Git.

## Работа с JSON типами заказов

Исходные файлы лежат в:

```text
backend/app/data/order_types/
```

Админская панель работает с ними через API. При ручном редактировании:

1. сохраняйте валидный JSON-объект;
2. не используйте секреты внутри этих файлов;
3. держите id файла в латинице: `notebook`, `thermos`, `calendar`;
4. проверяйте изменения через `GET /api/v1/admin/order-types/{type_id}`.

## Стиль backend-разработки

- Проверку прав держать в API-слое или `app/core/deps.py`.
- Доступ к базе выносить в `app/crud`.
- Сложные операции держать в `app/services`.
- Pydantic-схемы должны ограничивать длины строк, размеры массивов и допустимые значения.
- В логи не писать пароли, токены, OAuth-коды и полные payload с чувствительными персональными данными.

## Стиль frontend-разработки

- HTTP-вызовы добавлять в `src/api.js`.
- Общие состояния брать из `src/store.js`.
- Для служебной панели учитывать роли `dealer`, `admin`, `owner`.
- Ошибки API показывать пользователю коротко, технические детали оставлять в консоли только для dev.

## Проверки перед сдачей

Backend:

```powershell
cd backend
python -m compileall app
```

Frontend:

```powershell
cd frontend
npm run build
```

Renderer:

```powershell
cd microservices/renderer
node --check server.js
```

Также проверьте:

- регистрация и вход;
- создание заказа;
- появление CSV-логов;
- админский список заказов;
- чтение и сохранение JSON типа заказа;
- запрет доступа к admin endpoints под обычным клиентом.

## Работа с секретами

Файл `.env` не должен храниться в репозитории с реальными значениями. Если секрет когда-либо попал в Git, его нужно считать скомпрометированным и заменить в провайдере.

