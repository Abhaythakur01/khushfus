"""Redis-based request deduplication utility.

Services opt-in by calling ``check_idempotency`` with the incoming request's
``X-Idempotency-Key`` header value.  If the key has been seen within the TTL
window the function returns the cached HTTP status code so the caller can
short-circuit with a cached response.  Otherwise it stores the key and returns
``None``, signalling that the request should proceed normally.

Usage in a FastAPI route::

    from shared.request_dedup import check_idempotency, store_response_status

    @router.post("/orders")
    async def create_order(request: Request, ...):
        idem_key = request.headers.get("X-Idempotency-Key")
        cached = await check_idempotency(redis, idem_key)
        if cached is not None:
            return JSONResponse({"detail": "Duplicate request"}, status_code=cached)
        ...
        await store_response_status(redis, idem_key, 201)
        return order
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

# Default time-to-live for idempotency keys (seconds).
DEFAULT_TTL: int = 300

# Redis key prefix to avoid collisions with other data.
_PREFIX: str = "dedup:"


async def check_idempotency(
    redis: "aioredis.Redis",
    idempotency_key: str | None,
    *,
    ttl: int = DEFAULT_TTL,
) -> int | None:
    """Return the cached HTTP status code if *idempotency_key* was already seen.

    Returns ``None`` when the key is new (i.e. the request should proceed).
    On any Redis error the function silently returns ``None`` so that
    deduplication never blocks normal traffic.
    """
    if not idempotency_key:
        return None

    full_key = f"{_PREFIX}{idempotency_key}"
    try:
        # Use SET NX (set-if-not-exists) atomically to eliminate the race window
        # between a GET and a separate SET.  A sentinel value ("pending") is stored
        # so that concurrent callers immediately see the key as taken.
        # store_response_status will overwrite it with the real status code later.
        was_set = await redis.set(full_key, "pending", ex=ttl, nx=True)
        if not was_set:
            # Key already existed — fetch the current value (may be "pending" or a
            # real status code from a previously completed request).
            existing = await redis.get(full_key)
            if existing is not None and existing != b"pending" and existing != "pending":
                logger.debug("Duplicate request detected: key=%s status=%s", idempotency_key, existing)
                return int(existing)
            # Key is present but still "pending" (another request is in-flight).
            # Treat as duplicate to avoid double-processing.
            logger.debug("Duplicate request in-flight detected: key=%s", idempotency_key)
            return 409
    except Exception:
        logger.warning("Redis error during idempotency check for key=%s", idempotency_key, exc_info=True)
    return None


async def store_response_status(
    redis: "aioredis.Redis",
    idempotency_key: str | None,
    status_code: int,
    *,
    ttl: int = DEFAULT_TTL,
) -> None:
    """Store the response status code for *idempotency_key* with a TTL.

    Silently ignores errors so deduplication is never fatal.
    """
    if not idempotency_key:
        return

    full_key = f"{_PREFIX}{idempotency_key}"
    try:
        await redis.set(full_key, str(status_code), ex=ttl)
    except Exception:
        logger.warning("Redis error storing idempotency key=%s", idempotency_key, exc_info=True)
