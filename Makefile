# ─── Spruzhyk DevOps shortcuts ──────────────────────────────────────────────
# Все команды можно посмотреть: `make help`
.DEFAULT_GOAL := help
SHELL := /bin/bash

COMPOSE ?= docker compose
COMPOSE_PROD := $(COMPOSE) -f docker-compose.prod.yml

# ─── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help: ## Показать все команды
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ─── Setup ────────────────────────────────────────────────────────────────────
.PHONY: setup
setup: ## Скопировать .env.example в .env (один раз)
	@if [ ! -f .env ]; then cp .env.example .env && echo "✓ .env создан из .env.example"; else echo ".env уже существует — пропуск"; fi

# ─── Dev cluster ──────────────────────────────────────────────────────────────
.PHONY: up down restart logs ps build pull
up: ## Запустить dev-стек (db, backend, frontend, renderer, minio, techcard)
	$(COMPOSE) up -d

down: ## Остановить dev-стек (volumes остаются)
	$(COMPOSE) down

down-all: ## Остановить dev-стек + удалить volumes (полный сброс)
	$(COMPOSE) down -v

restart: ## Перезапустить указанный сервис: make restart SVC=backend
	$(COMPOSE) restart $(SVC)

logs: ## Логи сервиса в реальном времени: make logs SVC=backend
	$(COMPOSE) logs -f --tail=200 $(SVC)

ps: ## Статус контейнеров
	$(COMPOSE) ps

build: ## Пересобрать локально без push: make build SVC=techcard
	$(COMPOSE) build $(SVC)

pull: ## Подтянуть свежие :dev образы из GHCR
	$(COMPOSE) pull

# ─── Prod ─────────────────────────────────────────────────────────────────────
.PHONY: prod-up prod-down prod-pull prod-logs
prod-up: ## Запустить prod-стек
	$(COMPOSE_PROD) up -d

prod-down: ## Остановить prod-стек
	$(COMPOSE_PROD) down

prod-pull: ## Подтянуть свежие :latest образы
	$(COMPOSE_PROD) pull

prod-logs: ## Prod-логи: make prod-logs SVC=backend
	$(COMPOSE_PROD) logs -f --tail=200 $(SVC)

# ─── Backend / DB ─────────────────────────────────────────────────────────────
.PHONY: migrate db-shell backend-shell
migrate: ## Прогнать alembic upgrade head
	$(COMPOSE) exec backend alembic upgrade head

migration: ## Создать новую миграцию: make migration MSG="add foo"
	$(COMPOSE) exec backend alembic revision --autogenerate -m "$(MSG)"

db-shell: ## psql внутри контейнера db
	$(COMPOSE) exec db psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-spruzhuk}

backend-shell: ## Bash в backend
	$(COMPOSE) exec backend bash

# ─── S3 / MinIO ───────────────────────────────────────────────────────────────
.PHONY: s3-ls s3-clear s3-console
s3-ls: ## Список объектов в bucket techcards (нужен mc локально)
	@command -v mc >/dev/null || { echo "Установите MinIO Client: brew install minio/stable/mc"; exit 1; }
	@mc alias set local http://localhost:9000 $${MINIO_ROOT_USER:-spruzhyk} $${MINIO_ROOT_PASSWORD:-spruzhyk-dev-secret} >/dev/null
	mc ls --recursive local/techcards

s3-clear: ## Очистить bucket techcards (ВНИМАНИЕ — удалит все техкарты)
	@mc alias set local http://localhost:9000 $${MINIO_ROOT_USER:-spruzhyk} $${MINIO_ROOT_PASSWORD:-spruzhyk-dev-secret} >/dev/null
	mc rm --recursive --force local/techcards

s3-console: ## Открыть MinIO web-консоль в браузере
	@open http://localhost:9001 || xdg-open http://localhost:9001

# ─── Quality ──────────────────────────────────────────────────────────────────
.PHONY: lint fe-build fe-dev test
fe-build: ## Production-сборка фронта (vite build)
	cd frontend && npm run build

fe-dev: ## Dev-сервер фронта (vite на :5173)
	cd frontend && npm run dev

test: ## Прогнать тесты бэкенда (если есть)
	$(COMPOSE) exec backend pytest -v

# ─── Health ───────────────────────────────────────────────────────────────────
.PHONY: health
health: ## Healthchecks всех сервисов
	@echo "── backend ──";   curl -fsS http://localhost:8000/api/v1/health   2>&1 || true
	@echo "── renderer ──";  curl -fsS http://localhost:3000/healthz         2>&1 || true
	@echo "── techcard ──";  $(COMPOSE) exec -T techcard wget -qO- http://localhost:8000/healthz 2>&1 || true
	@echo "── minio ──";     curl -fsS http://localhost:9000/minio/health/live 2>&1 || true
