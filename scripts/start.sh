#!/bin/sh
# Container entrypoint: migrate, then serve.
#
# This lives in a script rather than inline in render.yaml/fly.toml because
# hosts parse their command fields themselves, and a quoted "sh -c '... && ...'"
# gets re-wrapped into a single argv element — the shell then treats the whole
# string as one command name and exits 127.
#
# RUN_MIGRATIONS=false for hosts that migrate in a separate release step (Fly's
# release_command), so the schema isn't upgraded once per booting instance.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
	echo "Running database migrations..."
	alembic upgrade head
fi

# exec so uvicorn is PID 1 and receives the platform's stop signals directly.
exec uvicorn api.main:create_app \
	--factory \
	--host 0.0.0.0 \
	--port "${PORT:-8000}" \
	--workers "${WEB_CONCURRENCY:-2}" \
	--no-access-log
