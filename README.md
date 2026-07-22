# EcoEats

Campus food rescue for ASU. Organizers post surplus food with a photo, a
location, and a countdown; recipients browse the feed, claim a portion, and walk
over before it expires.

- **API** — FastAPI (Python 3.11+)
- **Database** — PostgreSQL 16
- **Auth** — Firebase Auth, `@asu.edu` addresses only
- **Client** — Expo / React Native

## Quickstart

Requires Python 3.11+ and Docker.

```bash
docker compose up -d db
```

```bash
python -m venv .venv && .venv/Scripts/python.exe -m pip install -e ".[dev]"
```

```bash
cp .env.example .env
```

Run the API:

```bash
.venv/Scripts/python.exe -m uvicorn api.main:create_app --factory --reload
```

- API — http://localhost:8000
- Interactive docs — http://localhost:8000/docs
- Liveness — http://localhost:8000/health
- Readiness (checks Postgres) — http://localhost:8000/health/ready

## Tests

```bash
.venv/Scripts/python.exe -m pytest
```

Tests run against a **real PostgreSQL database** — `ecoeats_test`, created
automatically alongside the dev database on first container start.

**A missing or unreachable database fails the run.** It does not skip. The
previous implementation of this project skipped roughly 3,500 lines of route
tests whenever no database was configured, so CI reported green while testing
nothing at all. That is designed out here: `tests/conftest.py` calls
`pytest.exit()` with a non-zero code and tells you how to fix it.

## Layout

```text
api/
  main.py       app factory, CORS, health endpoints
  config.py     settings from env, validated at boot — no silent fallbacks
  db.py         async engine, session dependency, declarative base
  errors.py     typed errors → HTTP status, one handler
tests/
  conftest.py   fixtures; hard-fails without a database
scripts/
  init-test-db.sql
docker-compose.yml
```

There is deliberately no module-level `app = create_app()`. Building the app at
import time would make the module unimportable without a full environment.
Uvicorn is pointed at the factory with `--factory`.

## Conventions

- Settings are validated at startup. Missing required config is a boot failure,
  never a runtime surprise.
- Route handlers never manage transactions — the session dependency commits on
  success and rolls back on any exception.
- Expected failures raise an `AppError` subclass. Anything else becomes a
  logged 500; internal detail is never returned to the client.
- CORS is an exact-match allowlist.

## Status

Scaffold complete. Next: schema and models (Alembic + SQLAlchemy), then Firebase
auth, listings, and the claim transaction.
