"""
Idempotency middleware for FastAPI.

Ensures that POST/PUT/PATCH requests carrying an ``Idempotency-Key`` header are
processed at most once.  Duplicate keys receive the cached response without
re-executing the handler.

Usage::

    from shared.idempotency import IdempotencyMiddleware

    app.add_middleware(IdempotencyMiddleware, redis_url="redis://redis:6379/0")

Requests without the header are processed normally (backwards compatible).

Environment variables:
    IDEMPOTENCY_TTL_SECONDS — how long to cache responses (default 86400 = 24h)
    IDEMPOTENCY_REDIS_URL  — Redis URL (fallback: REDIS_URL, then redis://redis:6379/0)
"""

import hashlib
import json
import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

DEFAULT_TTL = int(os.getenv("IDEMPOTENCY_TTL_SECONDS", "86400"))  # 24 hours

# HTTP methods that support idempotency
_IDEMPOTENT_METHODS = frozenset({"POST", "PUT", "PATCH"})

_REDIS_KEY_PREFIX = "idempotency:"


class IdempotencyMiddleware(BaseHTTPMiddleware):
    """Check ``Idempotency-Key`` header on mutating requests and cache responses in Redis.

    If the same key + body fingerprint is seen again within the TTL, the cached
    response is returned immediately.  If only the key matches but the body
    differs, a 422 error is returned to signal misuse.
    """

    def __init__(
        self,
        app,
        redis_url: str | None = None,
        ttl: int = DEFAULT_TTL,
    ):
        super().__init__(app)
        self.redis_url = redis_url or os.getenv(
            "IDEMPOTENCY_REDIS_URL",
            os.getenv("REDIS_URL", "redis://redis:6379/0"),
        )
        self.ttl = ttl
        self._redis = None

    async def _get_redis(self):
        """Lazily connect to Redis.  Returns ``None`` if Redis is unavailable."""
        if self._redis is not None:
            try:
                await self._redis.ping()
                return self._redis
            except Exception:
                self._redis = None

        try:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            await self._redis.ping()
            return self._redis
        except Exception as exc:
            logger.warning("Idempotency middleware: Redis unavailable (%s), passing through", exc)
            self._redis = None
            return None

    async def dispatch(self, request: Request, call_next) -> Response:
        # Only apply to mutating methods
        if request.method not in _IDEMPOTENT_METHODS:
            return await call_next(request)

        # If no Idempotency-Key header, process normally
        idem_key = request.headers.get("Idempotency-Key") or request.headers.get("idempotency-key")
        if not idem_key:
            return await call_next(request)

        # Read and hash the request body
        body = await request.body()
        body_hash = hashlib.sha256(body).hexdigest()

        redis = await self._get_redis()
        if redis is None:
            # Redis down — fail open, process normally
            return await call_next(request)

        redis_key = f"{_REDIS_KEY_PREFIX}{idem_key}"

        try:
            cached = await redis.get(redis_key)
        except Exception as exc:
            logger.warning("Idempotency middleware: Redis read error (%s), passing through", exc)
            return await call_next(request)

        if cached is not None:
            # We have a cached entry for this key
            try:
                entry = json.loads(cached)
            except (json.JSONDecodeError, TypeError):
                # Corrupted entry — delete and reprocess
                await redis.delete(redis_key)
                return await self._process_and_cache(request, call_next, redis, redis_key, body_hash)

            # Verify body fingerprint matches — reject misuse
            if entry.get("body_hash") != body_hash:
                return JSONResponse(
                    status_code=422,
                    content={
                        "detail": "Idempotency-Key has already been used with a different request body."
                    },
                )

            # Return the cached response
            logger.debug("Idempotency hit for key=%s", idem_key)
            return Response(
                content=entry.get("body", ""),
                status_code=entry.get("status_code", 200),
                media_type=entry.get("media_type", "application/json"),
            )

        # No cache entry — process and store
        return await self._process_and_cache(request, call_next, redis, redis_key, body_hash)

    async def _process_and_cache(
        self,
        request: Request,
        call_next,
        redis,
        redis_key: str,
        body_hash: str,
    ) -> Response:
        """Execute the handler and cache its response in Redis."""
        response = await call_next(request)

        # Read the response body so we can cache it
        response_body = b""
        async for chunk in response.body_iterator:
            if isinstance(chunk, str):
                response_body += chunk.encode("utf-8")
            else:
                response_body += chunk

        entry = {
            "status_code": response.status_code,
            "body": response_body.decode("utf-8", errors="replace"),
            "body_hash": body_hash,
            "media_type": response.media_type or "application/json",
        }

        try:
            await redis.setex(redis_key, self.ttl, json.dumps(entry))
        except Exception as exc:
            logger.warning("Idempotency middleware: Redis write error (%s), response still returned", exc)

        # Rebuild the response since we consumed the body iterator
        return Response(
            content=response_body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )
