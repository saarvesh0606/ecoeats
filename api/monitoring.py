"""Error tracking via Sentry.

Structured logs (api.logging_config) tell the story of a request; Sentry
aggregates the failures across all of them — groups the same error, counts it,
and alerts. It's inactive until a DSN is configured, so dev and tests run
untouched.
"""

import logging

from api.config import Settings

logger = logging.getLogger(__name__)


def init_sentry(settings: Settings) -> bool:
    """Initialise Sentry if a DSN is configured. Returns whether it's active."""
    if not settings.sentry_dsn:
        return False

    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Don't ship request bodies, headers, or user IP to the error tracker.
        send_default_pii=False,
    )
    logger.info("Sentry error tracking enabled")
    return True


def capture_exception(exc: BaseException, *, request_id: str | None = None) -> None:
    """Report an unhandled exception, tagged with the request id.

    Both `set_tag` and `capture_exception` are safe no-ops when Sentry isn't
    initialised, so callers never have to check.
    """
    try:
        import sentry_sdk
    except ImportError:  # pragma: no cover
        return

    if request_id:
        sentry_sdk.set_tag("request_id", request_id)
    sentry_sdk.capture_exception(exc)
