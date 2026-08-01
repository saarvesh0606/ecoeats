# Production image for the EcoEats API.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies from the project metadata first, so this layer is cached
# and only rebuilds when dependencies change.
COPY pyproject.toml ./
COPY api ./api
COPY migrations ./migrations
COPY alembic.ini ./
RUN pip install --upgrade pip && pip install .

# Normalise line endings and set the exec bit here rather than trusting the
# checkout: on Windows a CRLF shebang would make this fail as "not found".
COPY scripts/start.sh ./scripts/start.sh
RUN sed -i 's/\r$//' ./scripts/start.sh && chmod +x ./scripts/start.sh

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

# Migrates (unless RUN_MIGRATIONS=false) then execs uvicorn. Kept in a script so
# hosts don't have to parse a multi-command string — see scripts/start.sh.
CMD ["./scripts/start.sh"]
