"""Database engine and session management."""

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from api.config import Settings


class Base(AsyncAttrs, DeclarativeBase):
    """Declarative base for all ORM models.

    AsyncAttrs provides ``awaitable_attrs``, so a lazy relationship can be
    loaded explicitly (``await obj.awaitable_attrs.photos``) instead of raising
    the greenlet error that unguarded lazy loading produces under asyncio.
    """


def create_engine(settings: Settings) -> AsyncEngine:
    return create_async_engine(
        settings.database_url,
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        echo=False,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        engine,
        expire_on_commit=False,
        autoflush=False,
    )


async def session_dependency(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a session bound to the request.

    Commits on success, rolls back on any exception. Route handlers never
    manage the transaction boundary themselves.

    The ``Request`` annotation is load-bearing: without it FastAPI reads
    ``request`` as a query parameter and rejects every call to a route that
    depends on this with a 422.
    """
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
