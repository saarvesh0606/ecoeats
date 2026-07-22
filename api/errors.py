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

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base for all expected, client-facing failures."""

    status_code: int = 400
    message: str = "Request failed"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.message
        super().__init__(self.message)


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
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "Unhandled error on %s %s", request.method, request.url.path
        )
        return JSONResponse(
            status_code=500,
            content={"message": "Internal server error"},
        )
