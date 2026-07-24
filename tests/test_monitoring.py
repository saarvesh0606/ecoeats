"""Sentry error tracking — inactive by default, wired to the error handler."""

import api.monitoring as monitoring
from api.config import Settings
from api.monitoring import capture_exception, init_sentry


def _settings(**overrides) -> Settings:
    base = dict(database_url="postgresql://x/y")
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
