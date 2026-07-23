"""FastAPI application factory."""

import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from api.auth.tokens import TokenVerifier
from api.config import Settings, get_settings
from api.db import create_engine, create_session_factory
from api.errors import register_error_handlers
from api.events import build_event_bus
from api.logging_config import configure_logging
from api.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from api.ratelimit import RateLimitMiddleware, build_limiter
from api.routers import (
    claims_router,
    listings_router,
    uploads_router,
    users_router,
)
from api.services.scheduler import sweep_forever


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings: Settings = app.state.settings
    engine = create_engine(settings)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)

    sweeper: asyncio.Task[None] | None = None
    limiter = app.state.limiter
    event_bus = app.state.event_bus
    await event_bus.start()
    if settings.scheduler_enabled:
        sweeper = asyncio.create_task(
            sweep_forever(
                app.state.session_factory,
                interval_seconds=settings.sweep_interval_seconds,
            )
        )

    try:
        yield
    finally:
        if sweeper is not None:
            sweeper.cancel()
            # Await the cancellation so shutdown does not race the task still
            # holding a database connection.
            with suppress(asyncio.CancelledError):
                await sweeper
        await event_bus.close()
        await limiter.close()
        await engine.dispose()


def _build_verifier(settings: Settings) -> TokenVerifier | None:
    """Construct the token verifier for this environment.

    Imported lazily so the firebase_admin dependency is only needed when it is
    actually used — tests inject their own verifier and never touch it.
    """
    # A dev bypass in production would let anyone authenticate as anyone. Fail
    # to start rather than serve traffic in that state.
    if settings.dev_auth_bypass and settings.is_production:
        raise RuntimeError(
            "DEV_AUTH_BYPASS must never be enabled in production — it accepts "
            "stand-in tokens that impersonate any user."
        )

    firebase: TokenVerifier | None = None
    if settings.firebase_configured:
        from api.auth.firebase import FirebaseTokenVerifier

        assert settings.firebase_project_id is not None
        assert settings.firebase_credentials_path is not None
        firebase = FirebaseTokenVerifier(
            project_id=settings.firebase_project_id,
            credentials_path=settings.firebase_credentials_path,
        )
    elif settings.is_production:
        raise RuntimeError(
            "FIREBASE_PROJECT_ID and FIREBASE_CREDENTIALS_PATH are required "
            "in production — every authenticated route depends on them."
        )

    if settings.dev_auth_bypass:
        import logging

        from api.auth.dev import DevTokenVerifier

        logging.getLogger(__name__).warning(
            "DEV_AUTH_BYPASS is ON — dev:<slug> tokens are accepted. "
            "This must never run in production."
        )
        # Real Firebase tokens still work through the fallback.
        return DevTokenVerifier(fallback=firebase)

    return firebase


def create_app(
    settings: Settings | None = None,
    *,
    token_verifier: TokenVerifier | None = None,
) -> FastAPI:
    settings = settings or get_settings()

    # Configure logging for real processes; skip under tests so pytest's caplog
    # keeps ownership of the root logger.
    if settings.app_env != "test":
        configure_logging(level=settings.log_level, json_output=settings.log_as_json)

    # Interactive docs and the OpenAPI schema expose the full API surface;
    # serve them in development only.
    docs_on = not settings.is_production
    app = FastAPI(
        title="EcoEats API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if docs_on else None,
        redoc_url="/redoc" if docs_on else None,
        openapi_url="/openapi.json" if docs_on else None,
    )
    app.state.settings = settings
    app.state.token_verifier = token_verifier or _build_verifier(settings)
    app.state.limiter = build_limiter(settings.redis_url)
    app.state.event_bus = build_event_bus(settings.redis_url)

    if settings.rate_limit_enabled:
        app.add_middleware(
            RateLimitMiddleware,
            limiter=app.state.limiter,
            limit=settings.rate_limit_ip_requests,
            window_seconds=settings.rate_limit_ip_window_seconds,
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,  # exact match, not prefix
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)

    # Added last so it wraps everything else: the correlation id is assigned and
    # timing starts before any other middleware runs, and the access log sees
    # the final status.
    app.add_middleware(RequestContextMiddleware)

    register_error_handlers(app)

    @app.get("/health", tags=["ops"])
    async def health() -> dict[str, str]:
        """Liveness. Deliberately does not touch the database — a brief DB blip
        should not make the process look dead to the orchestrator."""
        return {"status": "ok"}

    @app.get("/health/ready", tags=["ops"])
    async def ready() -> dict[str, str]:
        """Readiness. Confirms we can actually reach Postgres."""
        async with app.state.session_factory() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}

    app.include_router(users_router)
    app.include_router(listings_router)
    app.include_router(claims_router)
    app.include_router(uploads_router)

    return app


# Deliberately no module-level `app = create_app()`.
#
# Building the app at import time means importing this module requires a fully
# populated environment — which breaks tests, tooling, and any `python -c
# "import api.main"`. Uvicorn is pointed at the factory instead:
#
#     uvicorn api.main:create_app --factory --reload
