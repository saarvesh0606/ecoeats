# Production image for the EcoEats API.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies come from requirements.lock, not from the `>=` ranges in
# pyproject.toml. Two reasons, both security:
#   * reproducible — the image contains exactly what was resolved and reviewed,
#     so what runs in production is knowable rather than "whatever was newest
#     on deploy day"
#   * --require-hashes — every wheel is checked against a recorded digest, so a
#     tampered or substituted package fails the build instead of shipping
# Regenerate after changing dependencies (see requirements.lock's header).
#
# Copied on its own, before the source, so this layer is genuinely cached and
# only rebuilds when the lock changes — editing a route must not re-resolve and
# re-download 58 packages.
COPY requirements.lock ./
RUN pip install --upgrade pip \
    && pip install --require-hashes --no-deps -r requirements.lock

# Which commit this image was built from, so /health/version can report it.
# Render injects RENDER_GIT_COMMIT at runtime and needs nothing here — this is
# for every other host, and for a local build, which should report its own
# revision rather than claiming to be whatever was deployed last.
#
# Declared after the dependency layer so passing it never re-resolves packages.
# Unset arrives as an empty string, which build_revision treats as absent.
ARG GIT_COMMIT=""
ENV GIT_COMMIT=$GIT_COMMIT

# Then the application itself, with --no-deps: everything it needs is installed
# above, and resolving again here would silently reintroduce the unpinned ranges.
COPY pyproject.toml alembic.ini ./
COPY api ./api
COPY migrations ./migrations
RUN pip install --no-deps .

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
