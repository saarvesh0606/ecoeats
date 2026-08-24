"""Sentry error tracking — inactive by default, wired to the error handler."""

import api.monitoring as monitoring
from api.config import Settings
from api.monitoring import REDACTED, capture_exception, init_sentry, scrub_event


def _settings(**overrides) -> Settings:
    base = {"database_url": "postgresql://x/y"}
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_sentry_is_inactive_without_a_dsn() -> None:
    assert init_sentry(_settings(sentry_dsn=None)) is False


def test_sentry_initialises_when_a_dsn_is_set(monkeypatch) -> None:
    import sentry_sdk

    captured: dict[str, object] = {}
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: captured.update(kw))

    active = init_sentry(
        _settings(
            sentry_dsn="https://key@example.com/1",
            app_env="production",
            sentry_traces_sample_rate=0.1,
        )
    )

    assert active is True
    assert captured["dsn"] == "https://key@example.com/1"
    assert captured["environment"] == "production"
    assert captured["traces_sample_rate"] == 0.1
    assert captured["send_default_pii"] is False  # never ship PII to the tracker
    assert captured["before_send"] is scrub_event  # ...and scrub the URL too


def test_capture_exception_is_a_noop_when_unconfigured() -> None:
    # No Sentry initialised in tests — must not raise.
    capture_exception(RuntimeError("boom"), request_id="abc123")


def test_capture_exception_reports_with_the_request_id(monkeypatch) -> None:
    import sentry_sdk

    tags: dict[str, str] = {}
    reported: list[BaseException] = []
    monkeypatch.setattr(sentry_sdk, "set_tag", lambda k, v: tags.__setitem__(k, v))
    monkeypatch.setattr(sentry_sdk, "capture_exception", reported.append)

    err = RuntimeError("kaboom")
    capture_exception(err, request_id="trace-9")

    assert tags["request_id"] == "trace-9"
    assert reported == [err]


def test_monitoring_module_exposes_the_helpers() -> None:
    assert callable(monitoring.init_sentry)
    assert callable(monitoring.capture_exception)


def test_the_stream_token_never_reaches_sentry() -> None:
    """The one credential that travels in a URL. send_default_pii=False does
    not cover query strings, so this is the check that closes it."""
    event = scrub_event(
        {
            "request": {
                "url": "https://api.example.com/api/v1/listings/stream",
                "query_string": "token=eyJhbGciOi.REAL_CREDENTIAL.sig",
            }
        }
    )

    assert "REAL_CREDENTIAL" not in str(event)
    assert event["request"]["query_string"] == f"token={REDACTED}"


def test_a_token_in_the_url_itself_is_redacted() -> None:
    """Integrations disagree about whether the query lands in `url` or
    `query_string`, so both are scrubbed."""
    event = scrub_event(
        {"request": {"url": "https://api.example.com/stream?token=secret-value"}}
    )

    assert event["request"]["url"] == (
        f"https://api.example.com/stream?token={REDACTED}"
    )


def test_harmless_query_params_survive() -> None:
    """Which page or filter was in play is often the whole explanation for an
    error — dropping the query string wholesale would cost that."""
    event = scrub_event(
        {"request": {"query_string": "cursor=abc123&limit=20&token=secret"}}
    )

    assert event["request"]["query_string"] == (
        f"cursor=abc123&limit=20&token={REDACTED}"
    )


def test_every_sensitive_key_is_covered() -> None:
    query = "&".join(f"{key}=leaked" for key in sorted(monitoring.SENSITIVE_QUERY_KEYS))
    event = scrub_event({"request": {"query_string": query}})

    assert "leaked" not in event["request"]["query_string"]


def test_query_string_as_pairs_is_also_scrubbed() -> None:
    event = scrub_event(
        {"request": {"query_string": [("token", "secret"), ("page", "2")]}}
    )

    assert event["request"]["query_string"] == [("token", REDACTED), ("page", "2")]


def test_events_without_a_request_pass_through() -> None:
    event = {"exception": {"values": []}}
    assert scrub_event(event) is event


def test_a_broken_event_drops_its_request_rather_than_leaking_it() -> None:
    """A scrubber that raised would take the error report down with it. Failing
    closed keeps the report and loses only the part that could not be cleaned."""
    event = scrub_event({"request": {"query_string": [("only-one-element",)]}})

    assert "request" not in event
