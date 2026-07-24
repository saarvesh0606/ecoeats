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

# Run as an unprivileged user.
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000

# $PORT is injected by Railway/Fly; WEB_CONCURRENCY sets the worker count.
# --no-access-log: uvicorn's access log is replaced by our structured one.
CMD ["sh", "-c", "uvicorn api.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --no-access-log"]
