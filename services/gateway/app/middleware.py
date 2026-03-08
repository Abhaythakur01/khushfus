"""
Rate limiting middleware for the API Gateway.

Calls the centralized Rate Limiter service (:8014) on each inbound request.
Uses the client's API key (X-API-Key header) or IP address as the identifier.

Fail-open: if the rate limiter service is unreachable, the request is allowed
and a warning is logged.
"""

import logging
import math
import os

import httpx
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

RATE_LIMITER_URL = os.getenv("RATE_LIMITER_URL", "http://rate-limiter:8014")
# Default per-minute limits (configurable via env)
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "120"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMITER_TIMEOUT = float(os.getenv("RATE_LIMITER_TIMEOUT", "2.0"))

# Paths that skip rate limiting
SKIP_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


# ---------------------------------------------------------------------------
# Shared httpx client — created once and reused across requests
# ---------------------------------------------------------------------------

_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return (and lazily create) the shared httpx.AsyncClient."""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            base_url=RATE_LIMITER_URL,
            timeout=httpx.Timeout(RATE_LIMITER_TIMEOUT),
        )
    return _http_client


async def close_http_client() -> None:
    """Close the shared httpx client (call during shutdown)."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_identifier(request: Request) -> str:
    """
    Derive a rate-limit key from the request.
    Prefer the X-API-Key header; fall back to the client IP address.
    """
    api_key = request.headers.get("x-api-key")
    if api_key:
        return f"apikey:{api_key}"
    # Use forwarded-for if behind a reverse proxy, else direct client IP
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    return f"ip:{ip}"


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Starlette middleware that checks the rate limiter service before
    passing the request through to the application.
    """

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health/docs endpoints
        if request.url.path in SKIP_PATHS:
            return await call_next(request)

        identifier = _client_identifier(request)

        try:
            client = get_http_client()
            # We repurpose the rate limiter's /acquire endpoint.
            # "platform" = the client identifier, "endpoint" = "gateway".
            # The rate limiter will look up quota config; if none exists it
            # returns 404, which we treat as "no limit configured" (allow).
            resp = await client.post(
                "/acquire",
                json={
                    "platform": identifier,
                    "endpoint": "gateway",
                },
            )

            if resp.status_code == 200:
                data = resp.json()
                if not data.get("allowed", True):
                    wait_seconds = data.get("wait_seconds", 1.0)
                    retry_after = max(1, math.ceil(wait_seconds))
                    return JSONResponse(
                        status_code=429,
                        content={
                            "detail": "Rate limit exceeded. Please retry later.",
                            "retry_after_seconds": retry_after,
                        },
                        headers={"Retry-After": str(retry_after)},
                    )
            elif resp.status_code == 404:
                # No quota configured for this identifier — allow through
                logger.debug(
                    "No rate limit quota configured for %s; allowing request",
                    identifier,
                )
            else:
                # Unexpected status — fail open
                logger.warning(
                    "Rate limiter returned unexpected status %s for %s",
                    resp.status_code,
                    identifier,
                )

        except (httpx.HTTPError, Exception) as exc:
            # Fail open: if the rate limiter is unreachable, allow the request
            logger.warning(
                "Rate limiter service unreachable (%s); allowing request (fail-open)",
                exc,
            )

        return await call_next(request)
