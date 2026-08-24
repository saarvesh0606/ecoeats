"""Error tracking via Sentry.

Structured logs (api.logging_config) tell the story of a request; Sentry
aggregates the failures across all of them — groups the same error, counts it,
and alerts. It's inactive until a DSN is configured, so dev and tests run
untouched.
"""

import logging
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from api.config import Settings

logger = logging.getLogger(__name__)

#: Query parameters that must never reach the error tracker.
#:
#: ``send_default_pii=False`` covers headers, cookies, bodies and client IP —
#: it does NOT cover the URL, and the SSE stream carries its bearer token in
#: the query string because browser EventSource cannot set headers. Without
#: this, one unhandled error on that route would file a live credential into
#: Sentry, where it outlives the request and is readable by anyone with project
#: access.
SENSITIVE_QUERY_KEYS = frozenset(
    {"token", "access_token", "id_token", "key", "api_key", "password", "secret"}
)
#: URL-safe on purpose. A bracketed marker like "[redacted]" comes back out
#: of urlencode as %5Bredacted%5D, which is harder to recognise at a glance
#: in a Sentry event than the thing it replaced.
REDACTED = "REDACTED"


def _redact_query(query: str) -> str:
    """Replace the value of every sensitive parameter, keeping the rest.

    The others are worth keeping: which page or filter was in play is often the
    whole explanation for an error, and dropping the query string wholesale
    would cost that.
    """
    pairs = parse_qsl(query, keep_blank_values=True)
    if not pairs:
        return query
    return urlencode(
        [
            (key, REDACTED if key.lower() in SENSITIVE_QUERY_KEYS else value)
            for key, value in pairs
        ]
    )


def _redact_url(url: str) -> str:
    parts = urlsplit(url)
    if not parts.query:
        return url
    return urlunsplit(parts._replace(query=_redact_query(parts.query)))


def scrub_event(event: dict[str, Any], hint: object = None) -> dict[str, Any]:
    """Sentry ``before_send`` hook: redact credentials from the request URL.

    Handles ``url`` and ``query_string`` separately because integrations differ
    on where the query ends up, and a version that changes its mind should not
    quietly reopen the hole.

    Never raises: a scrubber that throws would take the error report down with
    it, losing the very thing Sentry exists to show. On failure the request is
    dropped from the event rather than sent unscrubbed.
    """
    try:
        request = event.get("request")
        if not isinstance(request, dict):
            return event

        url = request.get("url")
        if isinstance(url, str):
            request["url"] = _redact_url(url)

        query = request.get("query_string")
        if isinstance(query, str):
            request["query_string"] = _redact_query(query)
        elif isinstance(query, list):
            request["query_string"] = [
                (key, REDACTED if str(key).lower() in SENSITIVE_QUERY_KEYS else value)
                for key, value in query
            ]
    except Exception:  # pragma: no cover - defensive
        logger.warning("Could not scrub Sentry event; dropping its request data")
        event.pop("request", None)
    return event


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
        # ...and strip credentials out of the URL, which that flag leaves alone.
        before_send=scrub_event,
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
