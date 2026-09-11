# Deploying the EcoEats API

The API ships as a Docker image (see `Dockerfile`). It needs **Postgres** and
**Redis**; we use **Neon** and **Upstash** (both free, no card). For hosting,
**Render** (`render.yaml` Blueprint, Starter plan) is what production runs on —
see [§3a](#3a--deploy-to-render). **Fly.io** is also documented in
[§3b](#3b--deploy-to-fly). The container is identical either way.

> **Env var names** (these are what `api/config.py` actually reads):
> `DATABASE_URL`, `REDIS_URL`, `APP_ENV=production`, `ALLOWED_ORIGINS`
> (comma-separated — **not** `CORS_ORIGINS`), `FIREBASE_PROJECT_ID`,
> `FIREBASE_CREDENTIALS_JSON`, `CLOUDINARY_*`, `DB_STATEMENT_CACHE=false`.
> There is **no `AUTH_SECRET`** — the app doesn't use one.

## What you need

| Service | For | Free tier |
|---|---|---|
| **Neon** | Postgres (with a built-in connection pooler) | yes |
| **Upstash** | Redis (rate limiting + real-time fan-out) | yes |
| **Render** | running the container (production) | no — Starter, $7/mo; the free tier spins down |
| **Fly.io** | running the container (alternative) | yes |
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

## 3a · Deploy to Render

`render.yaml` in the repo root is a Blueprint that defines the API as a Docker
web service on the **Starter** plan, plus the public site as a static site.
Migrations run at container start (`alembic upgrade head && uvicorn …`); the
service is a single instance, so that's safe.

> The plan is in `render.yaml` on purpose. The service is Blueprint-managed, so
> whatever the file says is what Render applies on the next sync — `plan: free`
> in git would be a live downgrade waiting to happen.

1. Push `render.yaml` to `main` (already committed).
2. In the [Render dashboard](https://dashboard.render.com) → **New +** →
   **Blueprint**, connect the `saarvesh0606/ecoeats` repo. Render reads
   `render.yaml` and creates the `ecoeats-api` service.
3. It prompts for every `sync: false` env var. Paste:
   - `DATABASE_URL` — the Neon **pooled** string
   - `REDIS_URL` — the Upstash `rediss://` URL
   - `FIREBASE_PROJECT_ID` — `ecoeats-f09a8`
   - `FIREBASE_CREDENTIALS_JSON` — the entire contents of
     `secrets/firebase-service-account.json` (paste the JSON inline)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `ALLOWED_ORIGINS` — optional; set once a web client is deployed
4. **Apply** → Render builds the image, runs the migrations, and starts the
   service at `https://ecoeats-api.onrender.com` (name may vary).

> Starter does not spin down: measured 0.9s for the first request after 17 min
> idle, versus 43–54s on the free tier. `/health` is the liveness check Render
> polls. When load-testing, reuse connections — a fresh TLS handshake per
> request measures the ocean, not the box (8 req/s vs 98 req/s at 50
> concurrent on the same instance).

## 3b · Deploy to Fly (needs a card)

```bash
fly launch --no-deploy      # reads fly.toml; pick an app name/region
```

Set the secrets (never commit these):

```bash
fly secrets set \
  DATABASE_URL="postgresql://…-pooler…/neondb" \
  REDIS_URL="rediss://…upstash.io:6379" \
  FIREBASE_PROJECT_ID="ecoeats-f09a8" \
  FIREBASE_CREDENTIALS_JSON="$(cat secrets/firebase-service-account.json)" \
  CLOUDINARY_CLOUD_NAME="…" \
  CLOUDINARY_API_KEY="…" \
  CLOUDINARY_API_SECRET="…" \
  ALLOWED_ORIGINS="https://your-app-domain,ecoeats://"
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
