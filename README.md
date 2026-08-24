# EcoEats

**Campus food rescue for Arizona State University.** Organizers post surplus
food with a photo, a pickup location and a countdown; recipients browse a live
feed, claim a portion, and walk over before it expires.

[![CI](https://github.com/saarvesh0606/ecoeats/actions/workflows/ci.yml/badge.svg)](https://github.com/saarvesh0606/ecoeats/actions/workflows/ci.yml)

Every event on a campus ends the same way: trays of untouched food, a room being
packed up, and no way to tell anyone within the twenty minutes it stays good.
EcoEats is that missing twenty-minute channel — a listing lives for at most an
hour by design, because food that has been sitting out longer is not food anyone
should be sent to collect.

---

## Tech stack

**Backend**

| Layer | Choice |
| --- | --- |
| Language | Python 3.12 (3.11+ supported) |
| Framework | FastAPI — async end to end |
| Data | SQLAlchemy 2.0 async + Alembic, PostgreSQL 16 |
| Redis | Rate limiting and the SSE event bus |
| Auth | Firebase Auth, verified via the Admin SDK |
| Images | Cloudinary, signed direct-to-CDN upload |
| Push | Expo Push (fronts APNs and FCM) |
| Errors | Sentry, with URL credential scrubbing |
| Packaging | Docker, hash-pinned dependency lock |

**Client**

| Layer | Choice |
| --- | --- |
| Framework | React Native 0.83 on Expo SDK 55 |
| Routing | expo-router (file-based) |
| Styling | NativeWind (Tailwind), light and dark |
| Animation | Reanimated 4 + worklets |
| Realtime | SSE — `react-native-sse` on native, `EventSource` on web |
| Native | camera roll, location, haptics, notifications, speech recognition |
| Delivery | expo-updates — JavaScript ships over the air, no rebuild |
| Tooling | TypeScript, Biome, Jest + Testing Library |

**Infrastructure** — Render (API, Docker, auto-deploy from `main`), Neon
(Postgres), Upstash (Redis), EAS (iOS builds and OTA updates).

---

## What it does

**Posting** — photo, title, description, allergens, portion count, dietary tags,
and a pickup location pinned on a map. The description can be dictated instead
of typed. Expiry is a fixed choice of 15/20/30/45/60 minutes, and posts can be
scheduled ahead rather than published immediately.

**Browsing** — a live feed sorted by urgency, with search, dietary-preference
matching that says *which* preference a card matched, and bookmarking. Quantity
changes arrive over SSE rather than by polling, so a portion disappearing is
visible without a refresh.

**Claiming** — reserve a portion and get a countdown and directions. The host
confirms pickup or marks a no-show; either side can cancel, and a cancelled
claim returns its portions to the pool. Double-claiming is rejected at the
database level, not hopefully in application code.

**After** — recipients rate the host; hosts see cumulative impact in portions
and pounds diverted, computed from completed pickups rather than from posts
created.

**Throughout** — an in-app activity feed with unread state, push notifications
that deep-link to the right screen from a locked phone, role switching between
organizer and recipient, per-role terms acceptance, dark mode, and an offline
notice that blames the network instead of the food.

A background sweeper releases lapsed reservations and retires finished listings,
so nothing depends on a client being open to stay correct.

---

## Security

The API assumes every request is hostile until the token says otherwise.

**Authentication.** Firebase ID tokens are verified with the Admin SDK using
`check_revoked=True`, so signing out genuinely ends a session rather than
leaving a stolen token valid until it expires on its own. Two rules are enforced
in a single dependency that runs before any handler, so no route can forget one:
the address must be **verified**, and it must be **`@asu.edu`** — the latter
also backed by a CHECK constraint on the table.

**Identity is never taken from a request body.** The registration schema has no
`email` or `id` field at all. It is read from the verified token or not at all.

**Authorization is per-object.** Every ownership-sensitive action — editing or
cancelling a listing, confirming pickup, marking a no-show, rating, viewing a
listing's claims — checks the actor against the row. There is no endpoint where
knowing an ID is enough to act on it.

**The development auth bypass cannot reach production.** `DEV_AUTH_BYPASS`
accepts stand-in tokens so the client can be built before real ASU accounts
exist. If it is ever true while `APP_ENV=production`, **the application refuses
to start** — a boot failure rather than a service quietly accepting forged
identities. A test pins that behaviour.

**Supply chain.** The image installs from `requirements.lock` with
`--require-hashes`: every wheel is checked against a recorded digest, so a
substituted package fails the build instead of shipping. Tests fail if a
dependency is added without re-locking.

**Also enforced** — per-user rate limits keyed on the account rather than the IP
(campus NAT makes IP limits meaningless), an exact-match CORS allowlist,
hardening headers with production-only HSTS, generic 500s that never leak
internals, deliberately opaque token-rejection reasons, API docs disabled in
production, and Sentry configured with `send_default_pii=False` **plus** a
scrubber for credentials in URLs, which that flag does not cover.

Secrets never enter the repository: the entire `secrets/` directory is ignored,
with name-pattern rules behind it. Cloudinary's signing secret stays server-side
— the client receives a short-lived signed ticket and uploads directly.

---

## Layout

```text
api/
  main.py            app factory, middleware order, health endpoints
  config.py          settings validated at boot — no silent fallbacks
  deps.py            auth, sessions, per-user rate limits
  errors.py          typed errors to HTTP status, one handler
  events.py          Redis pub/sub behind the SSE stream
  middleware.py      request context, security headers, access log
  monitoring.py      Sentry init and URL credential scrubbing
  ratelimit.py       Redis limiter, in-memory fallback for dev
  auth/              token verification: protocol, Firebase, dev bypass
  models/            SQLAlchemy tables and enums
  schemas/           Pydantic request and response shapes
  routers/           listings, claims, users, notifications, devices, uploads
  services/          business logic, push delivery, background sweeper
mobile/
  app/               expo-router routes: (auth), (app)/(tabs), detail screens
  src/screens/       screen implementations
  src/components/    shared UI
  src/context/       auth, theme, unread state
  src/hooks/         device location, audio levels, feeds
  src/lib/           API client, Firebase, streaming, validation
migrations/          Alembic revisions
tests/               backend suite — hard-fails without a database
scripts/             dev_account.py, CI helpers, container entrypoint
flutter_app/         parked prototype, not part of the product
```

There is deliberately no module-level `app = create_app()`. Building the app at
import time would make the module unimportable without a full environment, so
Uvicorn is pointed at the factory with `--factory`.

---

## Running it

Requires Python 3.11+ and Docker.

```bash
docker compose up -d db redis
```

```bash
python -m venv .venv && .venv/Scripts/python.exe -m pip install -e ".[dev]"
```

```bash
cp .env.example .env
```

```bash
.venv/Scripts/python.exe -m uvicorn api.main:create_app --factory --reload
```

| Endpoint | URL |
| --- | --- |
| API | http://localhost:8000 |
| Docs (development only) | http://localhost:8000/docs |
| Liveness | http://localhost:8000/health |
| Readiness — checks Postgres | http://localhost:8000/health/ready |
| Build identity | http://localhost:8000/health/version |

Business endpoints are versioned under `/api/v1`, so a future `/api/v2` can
change shapes without breaking builds already on people's phones. Health and
docs stay unversioned — orchestrators depend on those paths being stable.

The client talks to production by default, so it needs no local backend:

```bash
cd mobile && npx expo start --web
```

Firebase setup needs a service-account key at
`secrets/firebase-service-account.json` and `FIREBASE_PROJECT_ID` plus
`FIREBASE_CREDENTIALS_PATH` in `.env`. Without them the app still starts in
development with authentication disabled, which is what lets the suite run
against a fake token issuer. In production, missing Firebase config is a startup
failure.

`scripts/dev_account.py` handles Firebase accounts without inbox access — mint a
verification link without sending mail, mark an address verified, free an
address for re-signup, or send a real verification email to measure
deliverability.

---

## Tests

```bash
.venv/Scripts/python.exe -m pytest
```

```bash
cd mobile && npx jest
```

272 backend tests and 367 client tests. CI runs both on every push, plus `ruff`
and `biome`.

Tests run against a **real PostgreSQL database** — `ecoeats_test`, created
automatically alongside the dev database on first container start.

**A missing database fails the run. It does not skip.** An earlier version of
this project skipped roughly 3,500 lines of route tests whenever no database was
configured, so CI reported green while testing nothing at all. `conftest.py` now
calls `pytest.exit()` with a non-zero code and says how to fix it.

---

## Deploying

Pushing to `main` redeploys the API — `render.yaml` has `autoDeploy: true` with
no path filter, so even a client-only change restarts it. Migrations run at
container start.

Confirm a deploy landed without opening a dashboard:

```bash
curl https://ecoeats-api.onrender.com/health/version
```

`revision` compares directly against `git rev-parse HEAD`. This exists because
`/health` answers identically before a swap, after it, and when a build failed
and the previous container kept serving.

Client JavaScript ships **over the air** — no rebuild, no App Store round trip:

```bash
cd mobile && npx eas-cli update --branch preview --environment preview -m "message"
```

Two force-quits to apply: the first launch downloads, the second runs it.
Settings → About reports the running update and channel. A native rebuild is
only needed when a native module is added.

---

## Conventions worth knowing

- Settings are validated at startup. Missing required config is a boot failure,
  never a runtime surprise.
- Route handlers never manage transactions — the session dependency commits on
  success and rolls back on any exception.
- Expected failures raise an `AppError` subclass; anything else becomes a logged
  500 with no internal detail returned.
- Business logic lives in `services/`, not in route handlers.
- Concurrency correctness lives in the database. Double-claim protection is a
  constraint, not a check-then-act.

---

## Known limitations

- **Session tokens live in AsyncStorage**, unencrypted at rest. Protected by the
  iOS app sandbox and standard for Firebase on React Native, but a hardening
  target.
- **`flutter_app/`** is a parked prototype on mock data with no backend
  integration. It is not part of the product and is not built or shipped.

---

## Licence and ownership

Copyright © 2026 Sarvesh Sunil Jagtap. All rights reserved. See [LICENSE](LICENSE).

This is proprietary source. Reading it grants no right to use it — ask first.

Two things the licence deliberately does not cover:

- **ASU's name, wordmark and logo are Arizona State University's trademarks.**
  They are not the copyright holder's to license. They appear here for a student
  project connected to the university; any public or commercial use of the marks
  needs ASU's own permission.
- **Dependencies keep their own licences**, as do photographs loaded from
  third-party services at runtime.

Changing the terms later means editing `LICENSE` and nothing else: both
`pyproject.toml` and `mobile/package.json` point at the file rather than naming
the licence, so they stay correct on their own.
