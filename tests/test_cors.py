"""CORS preflight coverage.

⚠️ WHY THIS FILE EXISTS. A route was added using PUT and every test passed —
httpx's ASGI transport sends no preflight, and the Jest suite mocks the API
module outright. Only a real browser noticed, and it failed the call as "Can't
reach the server", which reads as a network fault rather than a config one.

⚠️ AND WHY IT IS WRITTEN THIS WAY. Two earlier attempts at this guard passed
against the very bug they were meant to catch:

1. Preflighting with a hardcoded ``Access-Control-Request-Method: POST``.
   CORSMiddleware answers a preflight from its own allow_methods list and never
   consults the routing table, so asking about POST says nothing about a route
   that is actually a PUT. The question has to come from the route.
2. Walking ``app.routes``. ``include_router`` is materialised lazily in this
   FastAPI version, so the whole v1 tree hides behind one ``_IncludedRouter``
   entry carrying no path or methods — the walk found 6 routes out of 24 and
   passed vacuously.

The OpenAPI schema is generated from every registered route, so it is the one
view that sees all 24. Both tests below were confirmed to FAIL with the PUT
route in place before being committed.
"""

from fastapi import FastAPI
from httpx import AsyncClient

ORIGIN = "http://localhost:8081"  # the allowed origin in tests/conftest.py


def _methods_by_path(app: FastAPI) -> dict[str, set[str]]:
    """Every method the app actually serves, keyed by path."""
    return {
        path: {method.upper() for method in operations}
        for path, operations in app.openapi()["paths"].items()
    }


async def _allowed_methods(client: AsyncClient) -> set[str]:
    """The CORS allowlist, read from a real preflight response."""
    r = await client.request(
        "OPTIONS",
        "/users/me",
        headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET"},
    )
    assert r.status_code == 200, f"baseline preflight failed: {r.status_code}"
    header = r.headers.get("access-control-allow-methods", "")
    return {m.strip().upper() for m in header.split(",") if m.strip()}


async def test_every_served_method_is_in_the_cors_allowlist(
    client: AsyncClient, app: FastAPI
) -> None:
    """No route may use a verb a browser can't preflight.

    Derived from the schema rather than a hand-written list of verbs: the
    failure being guarded against is *adding* a route with a new method, so
    enumerating them by hand would leave exactly the hole this closes.
    """
    allowed = await _allowed_methods(client)
    offenders = {
        path: sorted(methods - allowed)
        for path, methods in _methods_by_path(app).items()
        if methods - allowed
    }

    assert not offenders, (
        f"These routes use methods the CORS allowlist rejects: {offenders}. "
        f"Allowed: {sorted(allowed)}. The web client cannot call them at all — "
        "add the method to allow_methods in api/main.py, or use an allowed verb."
    )


async def test_the_role_switch_is_callable_from_a_browser(
    client: AsyncClient, app: FastAPI
) -> None:
    """The specific regression, asked the only way that means anything: preflight
    the verb the route really declares, not one chosen by the test."""
    paths = _methods_by_path(app)
    path = "/api/v1/users/me/role"
    assert path in paths, f"role switch route missing from the schema: {sorted(paths)}"

    for method in paths[path]:
        r = await client.request(
            "OPTIONS",
            "/users/me/role",
            headers={"Origin": ORIGIN, "Access-Control-Request-Method": method},
        )
        assert r.status_code == 200, f"preflight for {method} failed: {r.status_code}"
        allowed = r.headers.get("access-control-allow-methods", "")
        assert method in allowed, (
            f"{method} /users/me/role is served but not in the CORS allowlist "
            f"({allowed}) — a browser would report a network error."
        )
