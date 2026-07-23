"""Request-scoped ASGI middleware: correlation ids and access logging.

Written as raw ASGI rather than Starlette's BaseHTTPMiddleware on purpose.
BaseHTTPMiddleware runs the handler in a copied context, so a ContextVar it
sets isn't reliably visible downstream, and the unhandled-error handler runs in
Starlette's outermost layer — outside any BaseHTTPMiddleware — where the id
would already be gone. Pure ASGI avoids both traps.

The id is carried two ways for that reason:
  * a ContextVar, for every log line emitted *during* the request
  * ``scope["state"]``, which the outermost error handler reads via
    ``request.state`` even after this middleware has unwound
"""

import logging
import time
import uuid

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from api.logging_config import request_id_var

access_logger = logging.getLogger("api.access")

REQUEST_ID_HEADER = b"x-request-id"

# Health checks fire constantly from the orchestrator; access-logging every one
# buries real traffic. Still traced by id, just not logged.
_SILENT_PATHS = frozenset({"/health", "/health/ready"})


def _client_ip(scope: Scope, headers: Headers) -> str:
    """The caller's IP, honouring the proxy chain.

    Behind a load balancer the socket peer is the balancer, so the real client
    is the first hop of X-Forwarded-For. Rate limiting keys on this too, so it
    must come from a proxy you control.
    """
    forwarded = headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


class RequestContextMiddleware:
    """Assigns a correlation id, times the request, logs the outcome."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        incoming = headers.get("x-request-id")
        request_id = incoming or uuid.uuid4().hex

        # Shared with every layer, including the outermost error handler.
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_var.set(request_id)

        start = time.perf_counter()
        status_code = 500  # assume the worst until we see the response start

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                message.setdefault("headers", []).append(
                    (REQUEST_ID_HEADER, request_id.encode())
                )
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            if scope["path"] not in _SILENT_PATHS:
                access_logger.info(
                    "request",
                    extra={
                        "method": scope["method"],
                        "path": scope["path"],
                        "status": status_code,
                        "duration_ms": duration_ms,
                        "client_ip": _client_ip(scope, headers),
                    },
                )
            request_id_var.reset(token)
