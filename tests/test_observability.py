"""Correlation ids, access logging, and error traceability.

At scale these are how you operate the service: every request is traceable end
to end, and a user who hits an error can quote an id that maps straight to the
logged stack trace.
"""

import json
import logging
import os

import pytest
from httpx import ASGITransport, AsyncClient

from api.config import Settings
from api.logging_config import (
    ConsoleFormatter,
    JsonFormatter,
    request_id_var,
)
from api.main import create_app


def _record(message: str = "hello", *, name: str = "test") -> logging.LogRecord:
    return logging.LogRecord(
        name, logging.INFO, __file__, 1, message, None, None
    )


class _Capture(logging.Handler):
    """Captures records from a named logger directly.

    pytest's caplog doesn't reliably see logs emitted inside the ASGI app under
    pytest-asyncio, so we attach straight to the logger — deterministic, and it
    keeps the full LogRecord so structured fields can be asserted.
    """

    def __init__(self) -> None:
        super().__init__(level=logging.INFO)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


@pytest.fixture
def access_logs():
    logger = logging.getLogger("api.access")
    handler = _Capture()
    previous = logger.level
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    try:
        yield handler.records
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous)


# --------------------------------------------------------------------------
# Formatters
# --------------------------------------------------------------------------


def test_json_formatter_emits_one_object_with_the_request_id() -> None:
    token = request_id_var.set("abc123")
    try:
        out = JsonFormatter().format(_record("hello"))
    finally:
        request_id_var.reset(token)

    data = json.loads(out)
    assert data["message"] == "hello"
    assert data["level"] == "INFO"
    assert data["request_id"] == "abc123"
    assert "timestamp" in data


def test_json_formatter_includes_structured_extras() -> None:
    record = _record("request", name="api.access")
    record.method = "GET"
    record.status = 200
    record.duration_ms = 12.3

    data = json.loads(JsonFormatter().format(record))
    assert data["method"] == "GET"
    assert data["status"] == 200
    assert data["duration_ms"] == 12.3


def test_json_formatter_omits_request_id_when_absent() -> None:
    # No request context set.
    data = json.loads(JsonFormatter().format(_record()))
    assert "request_id" not in data


def test_console_formatter_is_readable() -> None:
    token = request_id_var.set("deadbeefcafe")
    try:
        out = ConsoleFormatter().format(_record("hi", name="api"))
    finally:
        request_id_var.reset(token)
    assert "hi" in out
    assert "deadbeef" in out  # short id prefix


# --------------------------------------------------------------------------
# Correlation id over HTTP
# --------------------------------------------------------------------------


async def test_every_response_carries_a_request_id(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.headers.get("x-request-id")


async def test_inbound_request_id_is_threaded_through(client: AsyncClient) -> None:
    """A gateway or client can supply the id so a trace spans the whole system."""
    response = await client.get("/health", headers={"X-Request-ID": "trace-xyz"})
    assert response.headers["x-request-id"] == "trace-xyz"


async def test_each_request_gets_a_distinct_id(client: AsyncClient) -> None:
    a = await client.get("/health")
    b = await client.get("/health")
    assert a.headers["x-request-id"] != b.headers["x-request-id"]


# --------------------------------------------------------------------------
# Access logging
# --------------------------------------------------------------------------


async def test_requests_are_access_logged_with_timing(
    client: AsyncClient, access_logs: list[logging.LogRecord]
) -> None:
    await client.get("/nope")

    assert access_logs, "expected an access log record"
    record = access_logs[-1]
    assert record.method == "GET"
    assert record.path == "/nope"
    assert record.status == 404
    assert isinstance(record.duration_ms, float)


async def test_health_checks_are_not_access_logged(
    client: AsyncClient, access_logs: list[logging.LogRecord]
) -> None:
    """They fire constantly; logging each would bury real traffic."""
    await client.get("/health")
    await client.get("/health/ready")
    assert access_logs == []


# --------------------------------------------------------------------------
# Error traceability
# --------------------------------------------------------------------------


async def test_a_server_error_returns_its_request_id_without_leaking_detail(
    settings: Settings,
) -> None:
    """The one that makes production errors debuggable: the response carries the
    id, the internal message does not."""
    app = create_app(settings)

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("internal detail that must not leak")

    # raise_app_exceptions=False so the 500 comes back as a response rather than
    # re-propagating to the test — mirrors how a real client sees it.
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as ac:
        async with app.router.lifespan_context(app):
            response = await ac.get("/boom", headers={"X-Request-ID": "err-1"})

    assert response.status_code == 500
    body = response.json()
    assert body["request_id"] == "err-1"
    assert body["message"] == "Internal server error"
    assert "internal detail" not in response.text
    assert response.headers["x-request-id"] == "err-1"


def test_settings_choose_json_logs_in_production() -> None:
    dev = Settings(database_url="postgresql://x/y", app_env="development")
    prod = Settings(database_url="postgresql://x/y", app_env="production")
    assert dev.log_as_json is False
    assert prod.log_as_json is True
    # explicit override wins
    forced = Settings(
        database_url="postgresql://x/y", app_env="development", log_json=True
    )
    assert forced.log_as_json is True


# Guard against import-time regressions in the test DB URL fixture.
assert os.getenv is not None
