"""
Pre-configured async HTTP client with timeouts, retry, logging, and circuit breaker.

Usage::

    from shared.http_client import get_http_client

    client = get_http_client()
    response = await client.get("http://identity:8010/api/v1/users/me")

    # With circuit breaker:
    from shared.http_client import resilient_request

    response = await resilient_request("identity-service", "GET", "http://identity:8010/health")

Environment variables:
    HTTP_CONNECT_TIMEOUT   — TCP connect timeout in seconds (default 5)
    HTTP_READ_TIMEOUT      — Response read timeout in seconds (default 30)
    HTTP_WRITE_TIMEOUT     — Request write timeout in seconds (default 10)
    HTTP_POOL_TIMEOUT      — Connection pool wait timeout in seconds (default 5)
    HTTP_MAX_RETRIES       — Maximum retry attempts for 5xx/timeout errors (default 3)
"""

import asyncio
import logging
import os
import time
from typing import Any

import httpx

from shared.circuit_breaker import CircuitBreaker, CircuitBreakerError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Timeout configuration (all in seconds)
# ---------------------------------------------------------------------------
CONNECT_TIMEOUT = float(os.getenv("HTTP_CONNECT_TIMEOUT", "5"))
READ_TIMEOUT = float(os.getenv("HTTP_READ_TIMEOUT", "30"))
WRITE_TIMEOUT = float(os.getenv("HTTP_WRITE_TIMEOUT", "10"))
POOL_TIMEOUT = float(os.getenv("HTTP_POOL_TIMEOUT", "5"))

MAX_RETRIES = int(os.getenv("HTTP_MAX_RETRIES", "3"))

# Retry backoff: 0.5s, 1s, 2s …
_BACKOFF_BASE = 0.5
_BACKOFF_FACTOR = 2

# Status codes eligible for automatic retry
_RETRYABLE_STATUS_CODES = frozenset(range(500, 600))

# ---------------------------------------------------------------------------
# Singleton client
# ---------------------------------------------------------------------------
_client: httpx.AsyncClient | None = None


def _build_timeout() -> httpx.Timeout:
    return httpx.Timeout(
        connect=CONNECT_TIMEOUT,
        read=READ_TIMEOUT,
        write=WRITE_TIMEOUT,
        pool=POOL_TIMEOUT,
    )


def get_http_client() -> httpx.AsyncClient:
    """Return a module-level singleton ``httpx.AsyncClient`` with configured timeouts.

    The client is created lazily on first call.  Call :func:`close_http_client`
    during application shutdown to release the underlying connection pool.
    """
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=_build_timeout(),
            follow_redirects=True,
            # Limit connection pool to avoid resource exhaustion
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
                keepalive_expiry=30,
            ),
        )
    return _client


async def close_http_client() -> None:
    """Gracefully close the singleton HTTP client (call at app shutdown)."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None


# ---------------------------------------------------------------------------
# Circuit breaker registry
# ---------------------------------------------------------------------------
_breakers: dict[str, CircuitBreaker] = {}


def _get_breaker(service_name: str) -> CircuitBreaker:
    if service_name not in _breakers:
        _breakers[service_name] = CircuitBreaker(service_name)
    return _breakers[service_name]


# ---------------------------------------------------------------------------
# Retry-capable request with circuit breaker
# ---------------------------------------------------------------------------
def _is_retryable(exc: Exception | None, response: httpx.Response | None) -> bool:
    """Determine whether the request should be retried."""
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)):
        return True
    if response is not None and response.status_code in _RETRYABLE_STATUS_CODES:
        return True
    return False


async def resilient_request(
    service_name: str,
    method: str,
    url: str,
    *,
    max_retries: int = MAX_RETRIES,
    **kwargs: Any,
) -> httpx.Response:
    """Send an HTTP request with retry, backoff, logging, and circuit breaker.

    Args:
        service_name: Logical name for the target service (used by circuit breaker).
        method: HTTP method (GET, POST, etc.).
        url: Fully-qualified URL.
        max_retries: Maximum number of retry attempts (default from env).
        **kwargs: Passed through to ``httpx.AsyncClient.request``.

    Returns:
        An ``httpx.Response`` on success.

    Raises:
        CircuitBreakerError: If the circuit for *service_name* is open.
        httpx.HTTPError: If all retries are exhausted.
    """
    client = get_http_client()
    breaker = _get_breaker(service_name)
    last_exc: Exception | None = None

    for attempt in range(1, max_retries + 1):
        start = time.monotonic()
        response: httpx.Response | None = None
        exc: Exception | None = None

        try:
            response = await breaker.call(client.request, method, url, **kwargs)
        except CircuitBreakerError:
            raise  # Don't retry when circuit is open
        except Exception as e:
            exc = e
            last_exc = e

        elapsed_ms = round((time.monotonic() - start) * 1000, 1)

        # Log request outcome at debug level
        if response is not None:
            logger.debug(
                "http %s %s -> %d (%.1fms, attempt %d/%d, service=%s)",
                method,
                url,
                response.status_code,
                elapsed_ms,
                attempt,
                max_retries,
                service_name,
            )
            if not _is_retryable(None, response):
                return response
            # Retryable server error — fall through to backoff
            last_exc = httpx.HTTPStatusError(
                f"Server error {response.status_code}",
                request=response.request,
                response=response,
            )
        else:
            logger.debug(
                "http %s %s -> ERROR %s (%.1fms, attempt %d/%d, service=%s)",
                method,
                url,
                type(exc).__name__ if exc else "unknown",
                elapsed_ms,
                attempt,
                max_retries,
                service_name,
            )

        if attempt < max_retries and _is_retryable(exc, response):
            delay = _BACKOFF_BASE * (_BACKOFF_FACTOR ** (attempt - 1))
            logger.info(
                "Retrying %s %s in %.1fs (attempt %d/%d, service=%s)",
                method,
                url,
                delay,
                attempt + 1,
                max_retries,
                service_name,
            )
            await asyncio.sleep(delay)
        elif attempt == max_retries:
            break

    # All retries exhausted
    if last_exc is not None:
        raise last_exc
    # Should not reach here, but satisfy type checker
    raise RuntimeError(f"All {max_retries} retries exhausted for {method} {url}")
