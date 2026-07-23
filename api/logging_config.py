"""Logging setup: structured JSON in production, readable lines in development.

At scale you operate the service through its logs, so every line carries the
request id (see api.middleware) — that's the thread that ties a user's report,
an error, and the requests around it together. The id lives in a ContextVar so
any log call anywhere in a request picks it up automatically, with no plumbing
through call signatures.
"""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

#: The current request's correlation id, or None outside a request.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# LogRecord attributes that are structural, not user-supplied context. Anything
# else on the record (passed via logger.info(..., extra={...})) is real data and
# gets included in the JSON output.
_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "taskName", "message", "asctime",
}


class JsonFormatter(logging.Formatter):
    """One JSON object per line — what log aggregators (Datadog, Loki, …) want."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = request_id_var.get()
        if request_id:
            payload["request_id"] = request_id
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = value

        return json.dumps(payload, default=str)


class ConsoleFormatter(logging.Formatter):
    """Compact, readable output for local development."""

    def format(self, record: logging.LogRecord) -> str:
        request_id = request_id_var.get()
        prefix = f"[{request_id[:8]}] " if request_id else ""
        base = f"{record.levelname:<7} {prefix}{record.name}: {record.getMessage()}"

        extras = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _RESERVED and not key.startswith("_")
        }
        if extras:
            base += " " + " ".join(f"{k}={v}" for k, v in extras.items())
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base


def configure_logging(*, level: str = "INFO", json_output: bool = False) -> None:
    """Install a single root handler. Call once, from the process entrypoint.

    Deliberately not called during tests — pytest's caplog manages the root
    logger itself, and replacing handlers here would fight it.
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if json_output else ConsoleFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # Uvicorn's own access log would duplicate ours (api.middleware). Silence it
    # and let the structured access log be the single source of truth.
    logging.getLogger("uvicorn.access").disabled = True
