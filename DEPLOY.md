# Production Deploy

## What this setup does

- `push` to `main` builds fresh Docker images in `ghcr.io`
- GitHub Actions uploads the production compose file to the server
- GitHub Actions refreshes the server `.env`
- The server runs `docker compose pull && docker compose up -d --remove-orphans`
- New services are created automatically
- Existing services are updated automatically
- Backend runs `alembic upgrade head` on startup, so migrations apply automatically

## Server layout

Keep only these deployment artifacts on the server:

- `docker-compose.prod.yml`
- `.env`
- Docker volumes

Do not edit application source files directly on the server.

## GitHub secrets

Add these repository secrets:

- `PROD_HOST`
- `PROD_USER`
- `PROD_SSH_KEY`
- `PROD_PATH`
- `PROD_ENV_FILE`
- `GHCR_USERNAME`
- `GHCR_READ_TOKEN`

## PROD_ENV_FILE format

Store the whole production env file as one multiline secret:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-me
POSTGRES_DB=spruzhuk
DATABASE_URL=postgresql+asyncpg://postgres:change-me@db:5432/spruzhuk
SECRET_KEY=change-me-before-production
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
SENTRY_DSN=
```

`DATABASE_URL` must match the actual Postgres credentials. If backend containers restart during
`alembic upgrade head` with `asyncpg.exceptions.ProtocolViolationError: SASL authentication failed`,
the app is reaching Postgres/PgBouncer but the username/password pair is rejected. For a direct
Postgres connection use the `db:5432` URL shown above. Only point `DATABASE_URL` at `pgbouncer:5432`
after PgBouncer is configured with the same database user and password.

Large configurator orders can include uploaded design textures. The frontend nginx config allows
requests up to `12m`, matching the backend upload guard.

## First server bootstrap

Run once on the server:

```bash
mkdir -p /opt/spruzhyk
```

After that, deployments happen from GitHub Actions.

## Manual deploy

You can still trigger the workflow manually from GitHub Actions with `workflow_dispatch`.
