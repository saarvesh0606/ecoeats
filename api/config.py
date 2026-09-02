"""Application settings, loaded from the environment and validated at boot.

Nothing here has a silent fallback. If a required setting is missing the app
refuses to start, rather than coming up half-configured and failing later on a
request path.
"""

from functools import lru_cache
from pathlib import Path
from typing import Annotated
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ASYNC_DRIVER = "postgresql+asyncpg://"

# libpq/psycopg connection options that managed Postgres (Neon, Supabase) put in
# their URLs but asyncpg rejects as keyword arguments. SSL is turned on out of
# band via DB_SSL instead, so these are simply dropped.
_DROP_QUERY_KEYS = frozenset({"sslmode", "channel_binding", "ssl"})


def _strip_incompatible_query(url: str) -> str:
    """Remove query params asyncpg can't accept, keeping any others intact."""
    parts = urlsplit(url)
    if not parts.query:
        return url
    kept = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key not in _DROP_QUERY_KEYS
    ]
    return urlunsplit(parts._replace(query=urlencode(kept)))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Required. No default — a missing DATABASE_URL is a startup failure.
    database_url: str

    # Connection pool, per process. Total connections to Postgres are
    # (pool_size + max_overflow) x workers x instances, so behind a shared
    # database keep these modest and put a pooler (PgBouncer / Neon / Supabase)
    # in front. Set db_statement_cache off for a transaction-mode pooler, where
    # asyncpg's prepared-statement cache would break across pooled connections.
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_statement_cache: bool = True
    # Managed Postgres requires TLS. On for production (set DB_SSL=true); off for
    # the local Docker database, which speaks plaintext on the loopback.
    db_ssl: bool = False

    app_env: str = "development"

    # --- build identity ---------------------------------------------------
    # Which commit is actually serving.
    #
    # Without this a deploy cannot be verified from outside: /health answers
    # identically before a swap, after it, and — the case that matters — when a
    # build failed and the previous container kept serving. Render swaps in
    # about 70 seconds, faster than any sensible poll, so watching for a blip
    # does not answer it either.
    #
    # RENDER_GIT_COMMIT is injected by Render on every deploy, so production
    # needs no configuration. GIT_COMMIT is the portable override, passed as a
    # Docker build arg anywhere else — including a local image, which should
    # report its own revision rather than borrowing someone else's.
    git_commit: str | None = None
    render_git_commit: str | None = None
    render_git_branch: str | None = None

    # --- observability ---------------------------------------------------
    log_level: str = "INFO"
    # None → JSON in production, readable console lines otherwise.
    log_json: bool | None = None

    # Error tracking. Inactive until a DSN is set, so dev and tests are
    # unaffected. Trace sampling is off by default — turn it up in production
    # for performance monitoring.
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.0

    # --- Firebase -------------------------------------------------------
    # Required in production. Left optional so the test suite can run with an
    # injected fake verifier and never needs real credentials on disk.
    firebase_project_id: str | None = None
    # Either a path to the service-account JSON (local dev) or the JSON itself
    # (production containers, where you inject secrets as env vars, not files).
    firebase_credentials_path: str | None = None
    firebase_credentials_json: str | None = None

    # --- Cloudinary (listing photos) -----------------------------------
    # cloud_name and api_key are not secret — they appear in delivery URLs and
    # client uploads. The secret signs uploads and is loaded from a file
    # (kept in secrets/, gitignored) rather than sitting inline in .env.
    cloudinary_cloud_name: str | None = None
    cloudinary_api_key: str | None = None
    cloudinary_api_secret: str | None = None
    cloudinary_api_secret_file: str | None = None

    # --- background sweeps ----------------------------------------------
    # Releases lapsed reservations and marks finished listings expired.
    # Wants to be well under the reservation window, or a portion nobody
    # collected sits unavailable longer than it should.
    scheduler_enabled: bool = True
    sweep_interval_seconds: int = 60

    # --- push notifications ----------------------------------------------
    # Expo fronts APNs and FCM, so no vendor credentials live here: the APNs
    # key and FCM service account are uploaded to the Expo project instead.
    # This switch exists so tests and local work never reach the network, and
    # so delivery can be turned off without a deploy.
    push_enabled: bool = True
    # Optional. Only needed once the Expo project enables "enhanced security"
    # for push, which requires every send to be signed.
    expo_access_token: str | None = None

    # --- rate limiting ---------------------------------------------------
    # Redis is the shared store for multi-instance production; without a URL the
    # limiter falls back to in-memory (single process only — dev and tests).
    redis_url: str | None = None
    rate_limit_enabled: bool = True
    # Generous blanket per-IP budget. Loose on purpose: campus NAT means many
    # students share one public IP. Precise limits are per-user, per-route.
    rate_limit_ip_requests: int = 600
    rate_limit_ip_window_seconds: int = 60

    # --- who may hold an account -----------------------------------------
    # Restrict sign-in to one email domain, e.g. "asu.edu". Unset means any
    # verified address is accepted, which is the default and what the app
    # currently ships as.
    #
    # This is configuration rather than a constant because the restriction is
    # expected to come back: EcoEats was built for ASU and will be ASU-only
    # again once the university approves the use of its name. Setting
    # ALLOWED_EMAIL_DOMAIN=asu.edu restores the gate with no code change and no
    # migration.
    #
    # ⚠ It cannot be narrowed casually. Sign in with Apple issues
    # @privaterelay.appleid.com addresses when the user hides their real one,
    # and Google accounts arrive on whatever domain the person actually has —
    # so any value here turns off both social buttons for most people.
    allowed_email_domain: str | None = None

    # --- development only ------------------------------------------------
    # Accept `dev:<slug>` stand-in tokens so the client can be built and tested
    # without real accounts. Off by default; the app refuses to start if this
    # is true while APP_ENV is production. See api.auth.dev.
    dev_auth_bypass: bool = False

    # Exact-match allowlist. v1 matched by string prefix, which meant
    # http://localhost:3000.example.com passed the check.
    #
    # NoDecode stops pydantic-settings from trying to JSON-parse the env value,
    # so ALLOWED_ORIGINS can be a plain comma-separated string.
    allowed_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:8081",
        "http://localhost:19006",
    ]

    @field_validator("allowed_email_domain", mode="before")
    @classmethod
    def _normalise_domain(cls, value: object) -> object:
        """Empty or whitespace means unset, not a domain nothing can match.

        An env var that is present but blank is how a host expresses "no
        value"; read literally it would reject every address in existence.
        """
        if isinstance(value, str):
            cleaned = value.strip().lstrip("@").lower()
            return cleaned or None
        return value

    @field_validator("database_url")
    @classmethod
    def _normalise_database_url(cls, value: str) -> str:
        """Point the URL at the asyncpg driver and drop params it can't take.

        Runs for every reader of the URL — the app engine and Alembic both use
        ``settings.database_url`` — so a Neon/Supabase URL (with the async
        driver and an ``?sslmode=require`` asyncpg would choke on) is made
        connectable in exactly one place.
        """
        if value.startswith(ASYNC_DRIVER):
            url = value
        elif value.startswith(("postgresql://", "postgres://")):
            url = ASYNC_DRIVER + value.split("://", 1)[1]
        else:
            raise ValueError(
                "DATABASE_URL must be a PostgreSQL connection string, "
                f"got: {value[:32]!r}"
            )
        return _strip_incompatible_query(url)

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def build_revision(self) -> str:
        """The running commit, or "unknown" when nothing supplied one.

        "unknown" is deliberate and honest: a local checkout or a host that
        injects nothing genuinely does not know, and reporting a plausible-
        looking value there would be worse than admitting it. An empty string
        counts as absent — an unset Docker build arg arrives that way.
        """
        return self.git_commit or self.render_git_commit or "unknown"

    @property
    def build_branch(self) -> str | None:
        return self.render_git_branch or None

    @property
    def log_as_json(self) -> bool:
        return self.log_json if self.log_json is not None else self.is_production

    @property
    def firebase_configured(self) -> bool:
        return bool(
            self.firebase_project_id
            and (self.firebase_credentials_path or self.firebase_credentials_json)
        )

    def resolve_cloudinary_secret(self) -> str | None:
        """The signing secret, from the inline value or the secret file.

        Read on demand rather than at load time so the file is only touched
        when uploads are actually used, and the raw secret never lives on the
        settings object as a plain attribute.
        """
        if self.cloudinary_api_secret:
            return self.cloudinary_api_secret
        if self.cloudinary_api_secret_file:
            path = Path(self.cloudinary_api_secret_file)
            if not path.is_file():
                raise FileNotFoundError(
                    f"Cloudinary secret file not found at {path}."
                )
            return path.read_text(encoding="utf-8").strip()
        return None

    @property
    def cloudinary_configured(self) -> bool:
        return bool(
            self.cloudinary_cloud_name
            and self.cloudinary_api_key
            and (self.cloudinary_api_secret or self.cloudinary_api_secret_file)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
