# Deploying the EcoEats API

The API ships as a Docker image (see `Dockerfile`). This guide uses **Fly.io**
for hosting, **Neon** for Postgres, and **Upstash** for Redis — all have free
tiers and no server to manage. Railway works too; the container is the same.

## What you need

| Service | For | Free tier |
|---|---|---|
| **Neon** | Postgres (with a built-in connection pooler) | yes |
| **Upstash** | Redis (rate limiting + real-time fan-out) | yes |
| **Fly.io** | running the container | yes |
| Firebase | already set up (auth) | — |
| Cloudinary | already set up (photos) | — |

## 1 · Postgres (Neon)

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (the host contains `-pooler`). Using
   the pooler is what lets many API workers share a small connection budget.
3. Because the pooler is transaction-mode, prepared-statement caching must be
   off — that's what `DB_STATEMENT_CACHE=false` (already in `fly.toml`) does.

## 2 · Redis (Upstash)

1. Create a database at [upstash.com](https://upstash.com).
2. Copy the `rediss://` URL. **Required in production** — the app refuses to
   start without it, because rate limiting and real-time events must be shared
   across instances, not held per-process.

## 3 · Deploy to Fly

```bash
fly launch --no-deploy      # reads fly.toml; pick an app name/region
```

Set the secrets (never commit these):

```bash
fly secrets set \
  DATABASE_URL="postgresql://…-pooler…/neondb" \
  REDIS_URL="rediss://…upstash.io:6379" \
  AUTH_SECRET="$(openssl rand -hex 32)" \
  FIREBASE_PROJECT_ID="ecoeats-f09a8" \
  FIREBASE_CREDENTIALS_JSON="$(cat secrets/firebase-service-account.json)" \
  CLOUDINARY_CLOUD_NAME="…" \
  CLOUDINARY_API_KEY="…" \
  CLOUDINARY_API_SECRET="…" \
  CORS_ORIGINS="https://your-app-domain,ecoeats://"
```

> In a container there's no service-account *file*, so Firebase credentials are
> passed as JSON in `FIREBASE_CREDENTIALS_JSON` instead of a path.

```bash
fly deploy
```

`fly deploy` runs `alembic upgrade head` (the release command) before the new
version takes traffic, then starts the workers.

## 4 · Point the app at it

In `mobile/.env` set `EXPO_PUBLIC_API_URL` to the deployed URL
(`https://ecoeats-api.fly.dev`), and turn the dev bypass off on both sides:

```env
EXPO_PUBLIC_DEV_AUTH=false
```
```
# and in the API's production secrets, DEV_AUTH_BYPASS must be absent/false —
# the app refuses to start if it's true in production.
```

## Scaling notes

- **Workers vs. instances.** `WEB_CONCURRENCY` sets workers per machine; Fly
  scales machines. Total Postgres connections are
  `(DB_POOL_SIZE + DB_MAX_OVERFLOW) × workers × machines` — keep the pool small
  and lean on the Neon pooler.
- **The background sweeper** runs in every worker. It's idempotent and
  row-locked, so that's safe, just slightly redundant. To run it once instead,
  set `SCHEDULER_ENABLED=false` on the web machines and run one separate machine
  with it enabled.
- **Health checks:** `/health` is liveness (no DB); `/health/ready` also checks
  Postgres.
- **Logs** are structured JSON in production (`LOG_JSON` defaults on), ready for
  any aggregator.
