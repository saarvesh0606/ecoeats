"""Typed application errors and the single handler that renders them.

Every expected failure raises an AppError subclass; the handler maps it to a
status code and a clean JSON body. Anything else is an unhandled bug: it becomes
a 500 and gets logged, and the internal detail never reaches the client.

v1 returned raw PostgreSQL error text to callers with a 400 attached. That both
leaked internals and made real server faults look like client mistakes.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from api.logging_config import request_id_var

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base for all expected, client-facing failures."""

    status_code: int = 400
    message: str = "Request failed"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.message
        self.headers: dict[str, str] = {}
        super().__init__(self.message)


class TooManyRequestsError(AppError):
    """429 — the caller exceeded a rate limit. Carries Retry-After."""

    status_code = 429
    message = "Too many requests. Please slow down."

    def __init__(self, *, retry_after: int, message: str | None = None) -> None:
        super().__init__(message)
        self.headers = {"Retry-After": str(retry_after)}


class NotFoundError(AppError):
    status_code = 404
    message = "Not found"


class ConflictError(AppError):
    """The request contradicts current state — already claimed, wrong status."""

    status_code = 409
    message = "Conflict"


class ValidationError(AppError):
    status_code = 400
    message = "Invalid request"


class UnauthorizedError(AppError):
    status_code = 401
    message = "Authentication required"


class ForbiddenError(AppError):
    status_code = 403
    message = "Not permitted"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"message": exc.message},
            headers=exc.headers or None,
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        # This handler runs in Starlette's outermost layer, after the request
        # middleware has unwound, so the ContextVar is already cleared — read
        # the id from request.state (backed by the shared scope) instead, and
        # pass it explicitly into the log so the stack trace carries it too.
        request_id = getattr(request.state, "request_id", None) or request_id_var.get()
        logger.exception(
            "Unhandled error on %s %s",
            request.method,
            request.url.path,
            extra={"request_id": request_id} if request_id else {},
        )
        # Hand the id back so a user's report ("I got an error, id abc123") maps
        # straight to the logged trace. The message stays generic — internal
        # detail never reaches the client.
        body: dict[str, str] = {"message": "Internal server error"}
        headers: dict[str, str] = {}
        if request_id:
            body["request_id"] = request_id
            # This response is emitted by Starlette's outermost error layer,
            # which bypasses the request middleware — so set the id header here.
            headers["X-Request-ID"] = request_id
        return JSONResponse(status_code=500, content=body, headers=headers)
