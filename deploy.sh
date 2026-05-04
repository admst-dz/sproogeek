#!/bin/bash
set -e

SERVER="root@217.25.93.108"
REMOTE="/opt/spruzhyk"
LOCAL="$(cd "$(dirname "$0")" && pwd)"

echo "▶ Сборка фронтенда..."
cd "$LOCAL/frontend"
npm run build

echo "▶ Загрузка файлов на сервер..."
rsync -avz \
  --exclude='node_modules' \
  --exclude='__pycache__' \
  --exclude='.git' \
  --exclude='frontend/node_modules' \
  "$LOCAL/" "$SERVER:$REMOTE/"

echo "▶ Применение изменений..."
ssh "$SERVER" "
  cd $REMOTE
  # Первый запуск: пересоздать контейнеры с новыми volume-маунтами
  # После первого раза достаточно только restart
  if docker inspect spruzhuk_backend | grep -q '/opt/spruzhyk/backend/app'; then
    docker restart spruzhuk_backend
  else
    docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend frontend-render
  fi
"

echo "✅ Готово! Фронтенд обновился сразу, бекенд перезапущен."
