"""Application settings, loaded from the environment and validated at boot.

Nothing here has a silent fallback. If a required setting is missing the app
refuses to start, rather than coming up half-configured and failing later on a
request path.
"""

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ASYNC_DRIVER = "postgresql+asyncpg://"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Required. No default — a missing DATABASE_URL is a startup failure.
    database_url: str

    app_env: str = "development"

    # --- observability ---------------------------------------------------
    log_level: str = "INFO"
    # None → JSON in production, readable console lines otherwise.
    log_json: bool | None = None

    # --- Firebase -------------------------------------------------------
    # Required in production. Left optional so the test suite can run with an
    # injected fake verifier and never needs real credentials on disk.
    firebase_project_id: str | None = None
    firebase_credentials_path: str | None = None

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

    # --- development only ------------------------------------------------
    # Accept `dev:<slug>` stand-in tokens so the client can be built and tested
    # before real ASU accounts exist. Off by default; the app refuses to start
    # if this is true while APP_ENV is production. See api.auth.dev.
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

    @field_validator("database_url")
    @classmethod
    def _use_async_driver(cls, value: str) -> str:
        """Accept a plain postgres:// URL and point it at the asyncpg driver."""
        for prefix in ("postgresql+asyncpg://", ):
            if value.startswith(prefix):
                return value
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return ASYNC_DRIVER + value[len(prefix):]
        raise ValueError(
            "DATABASE_URL must be a PostgreSQL connection string, "
            f"got: {value[:32]!r}"
        )

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
    def log_as_json(self) -> bool:
        return self.log_json if self.log_json is not None else self.is_production

    @property
    def firebase_configured(self) -> bool:
        return bool(self.firebase_project_id and self.firebase_credentials_path)

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
