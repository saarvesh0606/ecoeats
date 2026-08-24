"""Production-readiness config: the checks that keep a bad deploy from booting."""

import json
import re
import tomllib
from pathlib import Path

import pytest

from api.auth.firebase import FirebaseTokenVerifier
from api.config import Settings
from api.db import build_connect_args, create_engine
from api.main import create_app

FIREBASE_JSON_PATH = "secrets/firebase-service-account.json"


def _prod_settings(**overrides) -> Settings:
    base = {
        "database_url": "postgresql+asyncpg://ecoeats:ecoeats@localhost:5432/ecoeats_test",
        "app_env": "production",
        "firebase_project_id": "ecoeats-f09a8",
        "firebase_credentials_path": FIREBASE_JSON_PATH,
        "dev_auth_bypass": False,
        "redis_url": "redis://localhost:6379/1",
        "scheduler_enabled": False,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_production_refuses_to_start_without_redis() -> None:
    """Without Redis, rate limiting and real-time silently go per-process —
    wrong the moment there's more than one instance."""
    with pytest.raises(RuntimeError, match="REDIS_URL is required in production"):
        create_app(_prod_settings(redis_url=None))


def test_production_starts_with_redis_configured() -> None:
    app = create_app(_prod_settings())
    assert app.state.settings.is_production


def test_firebase_configured_accepts_json_or_path() -> None:
    with_path = Settings(
        database_url="postgresql://x/y",
        firebase_project_id="p",
        firebase_credentials_path=FIREBASE_JSON_PATH,
    )
    with_json = Settings(
        database_url="postgresql://x/y",
        firebase_project_id="p",
        firebase_credentials_json='{"type":"service_account"}',
    )
    neither = Settings(
        database_url="postgresql://x/y",
        firebase_project_id="p",
        # Explicit None overrides FIREBASE_CREDENTIALS_PATH from the dev .env.
        firebase_credentials_path=None,
        firebase_credentials_json=None,
    )

    assert with_path.firebase_configured is True
    assert with_json.firebase_configured is True
    assert neither.firebase_configured is False


def test_firebase_verifier_loads_credentials_from_json() -> None:
    """Containers inject the service account as JSON, not a file."""
    raw = open(FIREBASE_JSON_PATH, encoding="utf-8").read()
    verifier = FirebaseTokenVerifier(
        project_id="ecoeats-f09a8", credentials_json=raw
    )
    assert verifier is not None


def test_firebase_verifier_rejects_malformed_json() -> None:
    with pytest.raises(ValueError, match="not valid service-account JSON"):
        FirebaseTokenVerifier(
            project_id="p", credentials_json="{not valid json"
        )


def test_firebase_verifier_needs_some_credential() -> None:
    with pytest.raises(ValueError, match="FIREBASE_CREDENTIALS"):
        FirebaseTokenVerifier(project_id="p")


def test_engine_builds_with_pooler_settings() -> None:
    """A transaction-mode pooler needs statement caching off; the engine must
    construct with that connect arg without error."""
    settings = Settings(
        database_url="postgresql+asyncpg://ecoeats:ecoeats@localhost:5432/ecoeats_test",
        db_statement_cache=False,
        db_pool_size=3,
        db_max_overflow=2,
    )
    engine = create_engine(settings)
    assert engine.pool.size() == 3


def test_database_url_strips_asyncpg_incompatible_params() -> None:
    """A managed-Postgres URL (async driver + libpq ssl params asyncpg rejects)
    is normalised to something asyncpg can actually connect with."""
    settings = Settings(
        database_url=(
            "postgresql://u:p@ep-cool-pooler.us-east-2.aws.neon.tech/neondb"
            "?sslmode=require&channel_binding=require"
        ),
    )
    assert settings.database_url == (
        "postgresql+asyncpg://u:p@ep-cool-pooler.us-east-2.aws.neon.tech/neondb"
    )


def test_database_url_keeps_unrelated_query_params() -> None:
    settings = Settings(
        database_url="postgresql://u:p@host:5432/db?application_name=ecoeats&sslmode=require",
    )
    assert settings.database_url == (
        "postgresql+asyncpg://u:p@host:5432/db?application_name=ecoeats"
    )


def test_connect_args_ssl_and_statement_cache() -> None:
    prod = build_connect_args(
        Settings(database_url="postgresql://x/y", db_ssl=True, db_statement_cache=False)
    )
    assert prod == {"ssl": True, "statement_cache_size": 0}

    local = build_connect_args(Settings(database_url="postgresql://x/y"))
    assert local == {}


def test_json_credentials_win_over_a_bad_path() -> None:
    """If both are set, JSON is used — the path isn't even opened."""
    raw = json.dumps(json.load(open(FIREBASE_JSON_PATH, encoding="utf-8")))
    verifier = FirebaseTokenVerifier(
        project_id="ecoeats-f09a8",
        credentials_path="/does/not/exist.json",
        credentials_json=raw,
    )
    assert verifier is not None


# --- dependency pinning -------------------------------------------------
#
# pyproject declares `>=` ranges, which is right for a library and wrong for a
# deployed image: every rebuild would pull whatever was newest, so what runs in
# production would be unknowable and a compromised upstream release would ship
# unreviewed. requirements.lock is what the Dockerfile actually installs.

_ROOT = Path(__file__).resolve().parent.parent
_LOCK = _ROOT / "requirements.lock"
_PYPROJECT = _ROOT / "pyproject.toml"
_DOCKERFILE = _ROOT / "Dockerfile"


def _normalise(name: str) -> str:
    """PEP 503 name normalisation, so sentry_sdk and sentry-sdk are one name."""
    return re.sub(r"[-_.]+", "-", name).lower()


def _declared_dependencies() -> set[str]:
    data = tomllib.loads(_PYPROJECT.read_text(encoding="utf-8"))
    names = set()
    for spec in data["project"]["dependencies"]:
        # "sqlalchemy[asyncio]>=2.0.36" -> "sqlalchemy"
        names.add(_normalise(re.split(r"[\[<>=!;~ ]", spec, maxsplit=1)[0]))
    return names


def _locked_requirements() -> dict[str, list[str]]:
    """Map each pinned name to the lines belonging to its entry."""
    entries: dict[str, list[str]] = {}
    current: str | None = None
    for line in _LOCK.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line[0].isspace():
            current = _normalise(re.split(r"[\[<>=!;~ ]", line.strip(), maxsplit=1)[0])
            entries[current] = [line]
        elif current is not None:
            entries[current].append(line)
    return entries


def test_every_production_dependency_is_locked() -> None:
    """Adding a dependency without regenerating the lock fails here rather than
    at deploy time, where --require-hashes would break the build."""
    missing = _declared_dependencies() - set(_locked_requirements())
    assert not missing, (
        f"Not in requirements.lock: {sorted(missing)}. "
        "Regenerate it — see the header of that file."
    )


def test_the_lockfile_pins_exact_versions_with_hashes() -> None:
    """A range or a missing digest would defeat the point of locking."""
    for name, lines in _locked_requirements().items():
        entry = " ".join(lines)
        assert "==" in lines[0], f"{name} is not pinned to one version"
        assert "--hash=sha256:" in entry, f"{name} carries no hash"


def test_the_image_installs_from_the_lockfile_with_hash_checking() -> None:
    """The lock only protects anything if the Dockerfile actually uses it."""
    dockerfile = _DOCKERFILE.read_text(encoding="utf-8")
    assert "--require-hashes" in dockerfile
    assert "-r requirements.lock" in dockerfile
    # Installing the app itself must not re-resolve and reintroduce the ranges.
    assert "pip install --no-deps ." in dockerfile


# --- build identity -----------------------------------------------------


def _revision_settings(**overrides) -> Settings:
    base = {"database_url": "postgresql://x/y"}
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_an_explicit_commit_wins_over_the_platforms() -> None:
    """GIT_COMMIT is the portable override, so it has to beat the host's."""
    settings = _revision_settings(git_commit="abc123", render_git_commit="def456")
    assert settings.build_revision == "abc123"


def test_the_platform_value_is_used_when_nothing_overrides_it() -> None:
    """Render injects RENDER_GIT_COMMIT, which is why production needs no
    configuration for this."""
    settings = _revision_settings(git_commit=None, render_git_commit="def456")
    assert settings.build_revision == "def456"


def test_an_unset_build_arg_counts_as_absent() -> None:
    """A Docker ARG that was never passed arrives as "", not as nothing — so an
    image built without one must still fall through to the host's value."""
    settings = _revision_settings(git_commit="", render_git_commit="def456")
    assert settings.build_revision == "def456"


def test_an_unknown_revision_says_so() -> None:
    """Reporting a plausible-looking value where none is known would be worse
    than admitting it: the endpoint exists to be trusted."""
    settings = _revision_settings(
        git_commit="", render_git_commit="", render_git_branch=""
    )
    assert settings.build_revision == "unknown"
    assert settings.build_branch is None
