"""FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from api.config import Settings, get_settings
from api.db import create_engine, create_session_factory
from api.errors import register_error_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_engine(app.state.settings)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    try:
        yield
    finally:
        await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(
        title="EcoEats API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,  # exact match, not prefix
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

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

    return app


# Deliberately no module-level `app = create_app()`.
#
# Building the app at import time means importing this module requires a fully
# populated environment — which breaks tests, tooling, and any `python -c
# "import api.main"`. Uvicorn is pointed at the factory instead:
#
#     uvicorn api.main:create_app --factory --reload
