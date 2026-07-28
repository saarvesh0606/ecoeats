"""Alembic environment, wired for the async engine.

The database URL comes from application settings rather than alembic.ini, so
there is one source of truth and no credentials in a committed file. Setting
ALEMBIC_DATABASE_URL overrides it — that is how the test suite points
migrations at ecoeats_test.
"""

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from api.config import Settings, get_settings
from api.db import build_connect_args

# Importing the models package registers every table on Base.metadata.
# Without it autogenerate would produce an empty migration.
from api.models import Base

config = context.config

if config.config_file_name is not None:
    # disable_existing_loggers=False, or Alembic's logging config silently
    # disables every logger that already existed — including the application's
    # own (api.access, etc.) when migrations run in-process, e.g. from tests or
    # an app-managed migration step.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _database_url() -> str:
    override = os.getenv("ALEMBIC_DATABASE_URL")
    if override:
        # Reuse the settings validator so the driver prefix is normalised
        # the same way it is everywhere else.
        return Settings(database_url=override).database_url
    return get_settings().database_url


# configparser treats % as interpolation syntax; passwords often contain it.
config.set_main_option("sqlalchemy.url", _database_url().replace("%", "%%"))


def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # Same TLS / prepared-statement policy the app uses, so migrating against
        # a managed pooler (Neon, Supabase) connects rather than erroring.
        connect_args=build_connect_args(get_settings()),
    )
    async with engine.connect() as connection:
        await connection.run_sync(_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
