# Production Deploy

Push to `main` → GitHub Actions builds images and deploys to the server.

## Pipeline

1. Push to `main` triggers `.github/workflows/deploy-production.yml`.
2. Only services whose source changed get rebuilt (`paths-filter`); images are tagged `:latest` in `ghcr.io/admst-dz/`.
3. The `deploy` job SSHes into the server, uploads `docker-compose.prod.yml` + `.env`, runs `docker compose pull && docker compose up -d --remove-orphans`.
4. Backend runs `alembic upgrade head` on startup; migrations apply automatically.
5. Caddy on the host (separate from compose) terminates TLS for `sproogeek.com` and proxies to `127.0.0.1:8080`.

## Required GitHub repository secrets

| Secret | Example / how to get |
|---|---|
| `PROD_HOST` | `217.25.93.108` |
| `PROD_USER` | `root` |
| `PROD_SSH_KEY` | private key (ed25519) — see below |
| `PROD_PATH` | `/opt/spruzhyk` |
| `PROD_ENV_FILE` | full multi-line `.env` (template below) |
| `GHCR_USERNAME` | GitHub username with read access to `ghcr.io/admst-dz/*` |
| `GHCR_READ_TOKEN` | PAT with `read:packages` scope |

### Generating the SSH key

On your laptop:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/spruzhyk_deploy -N ""
ssh-copy-id -i ~/.ssh/spruzhyk_deploy.pub root@217.25.93.108
```

Paste the contents of `~/.ssh/spruzhyk_deploy` (private key, including the BEGIN/END lines) into the `PROD_SSH_KEY` secret.

### `PROD_ENV_FILE` template

```env
APP_ENV=production
SECRET_KEY=<random 32+ bytes>

POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong>
POSTGRES_DB=spruzhuk
DATABASE_USER=postgres
DATABASE_PASSWORD=<strong>
DATABASE_HOST=pgbouncer
DATABASE_PORT=5432
DATABASE_NAME=spruzhuk
DATABASE_URL=

KAFKA_BOOTSTRAP_SERVERS=kafka:9092

ALLOWED_HOSTS=sproogeek.com,www.sproogeek.com
ALLOWED_ORIGINS=https://sproogeek.com,https://www.sproogeek.com

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SENTRY_DSN=

MINIO_ROOT_USER=spruzhyk
MINIO_ROOT_PASSWORD=<strong>
S3_ENDPOINT_URL=http://minio:9000
S3_PUBLIC_ENDPOINT=https://sproogeek.com
S3_REGION=us-east-1
S3_ACCESS_KEY=spruzhyk
S3_SECRET_KEY=<strong>
S3_BUCKET=techcards

TECHCARD_URL=http://techcard:8000
RENDERER_URL=http://renderer:3000

ADMIN_BACKDOOR_ENABLED=false
ADMIN_BACKDOOR_LOGIN=
ADMIN_BACKDOOR_PASSWORD=
ADMIN_BACKDOOR_KEY=

MANUFACTURER_NAME=ООО «Спружык»
MANUFACTURER_ID=SPRUZHYK-001
```

Prefer the `DATABASE_*` fields over a hand-written `DATABASE_URL`. The backend builds the SQLAlchemy
URL itself, so production passwords may safely contain URL-reserved characters like `#`, `?`, `/`,
`@`, and `:`. If backend containers restart during `alembic upgrade head` with
`asyncpg.exceptions.ProtocolViolationError: SASL authentication failed`, check that
`POSTGRES_PASSWORD` and `DATABASE_PASSWORD` match the password that initialized the existing
Postgres volume. Only set `DATABASE_URL` as a legacy override when the password is percent-encoded.

Large configurator orders can include uploaded design textures. The frontend nginx config allows
requests up to `12m`, matching the backend upload guard.

## First server bootstrap

`S3_ACCESS_KEY` / `S3_SECRET_KEY` should match `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` (or use a dedicated MinIO user with `mc admin user add`).

Once, manually on `root@217.25.93.108`:

```bash
mkdir -p /opt/spruzhyk
cd /opt/spruzhyk

# stop the legacy stack (the dev compose that's currently running)
docker compose down --remove-orphans 2>/dev/null || true

# remove watchtower — replaced by GitHub Actions deploy
docker rm -f spruzhuk_watchtower 2>/dev/null || true
```

After this, every push to `main` deploys.

## Manual deploy

GitHub → Actions → "Deploy to Production" → Run workflow.

- `target: all` — rebuild every image and deploy
- `target: deploy-only` — skip image builds, just upload compose + restart (use after editing `.env` or compose)

## Caddy reverse proxy

Caddy runs in host network on the server, terminates TLS for `sproogeek.com`, proxies to `127.0.0.1:8080`. Config at `/etc/caddy/Caddyfile`. Not managed by this pipeline — set up once.

## Troubleshooting

- **`docker compose ps` shows `:dev` images instead of `:latest`** — server still has the old dev compose. Run the bootstrap section, then trigger `workflow_dispatch` with `target: deploy-only`.
- **`Multiple head revisions are present`** — alembic graph diverged again. Create a `merge_heads` migration.
- **`unauthorized` on `docker compose pull`** — `GHCR_READ_TOKEN` is missing/expired or the user lacks access to the package. The deploy step does `docker login` itself, so the token only needs `read:packages`.
