"""
Redis cache layer for KhushFus.

Provides async caching with JSON serialization, graceful degradation,
per-tenant key isolation, and cache invalidation helpers.

All keys are prefixed with ``cache:`` to avoid collisions with Redis Streams.
"""

import asyncio
import functools
import hashlib
import json
import logging
import os
import time
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default TTLs (seconds)
# ---------------------------------------------------------------------------

TTL_DASHBOARD = 60
TTL_PROJECT_LIST = 300
TTL_MENTIONS = 30
TTL_DEFAULT = 120

KEY_PREFIX = "cache:"

# ---------------------------------------------------------------------------
# Metrics (lightweight counters; exposed to Prometheus if available)
# ---------------------------------------------------------------------------

_hits = 0
_misses = 0

try:
    from prometheus_client import Counter

    CACHE_HIT_COUNTER = Counter("cache_hits_total", "Total cache hits")
    CACHE_MISS_COUNTER = Counter("cache_misses_total", "Total cache misses")
except ImportError:
    CACHE_HIT_COUNTER = None
    CACHE_MISS_COUNTER = None


def _record_hit():
    global _hits
    _hits += 1
    if CACHE_HIT_COUNTER is not None:
        CACHE_HIT_COUNTER.inc()


def _record_miss():
    global _misses
    _misses += 1
    if CACHE_MISS_COUNTER is not None:
        CACHE_MISS_COUNTER.inc()


# ---------------------------------------------------------------------------
# RedisCache
# ---------------------------------------------------------------------------


class RedisCache:
    """Async Redis cache with JSON serialization and graceful degradation."""

    def __init__(self, redis_url: str | None = None):
        self._redis_url = redis_url or os.getenv(
            "REDIS_URL", "redis://redis:6379/0"
        )
        self._redis: aioredis.Redis | None = None

    # -- connection ----------------------------------------------------------

    async def connect(self) -> None:
        """Open a pooled connection to Redis."""
        if self._redis is not None:
            return
        try:
            self._redis = aioredis.from_url(
                self._redis_url,
                decode_responses=True,
                socket_connect_timeout=3.0,
                socket_timeout=3.0,
                max_connections=int(os.getenv("CACHE_POOL_SIZE", "20")),
            )
            await self._redis.ping()
            logger.info("Cache connected to Redis at %s", self._redis_url)
        except Exception as exc:
            logger.warning("Cache failed to connect to Redis: %s", exc)
            self._redis = None

    async def close(self) -> None:
        if self._redis:
            try:
                await self._redis.aclose()
            except Exception:
                pass
            finally:
                self._redis = None

    @property
    def available(self) -> bool:
        return self._redis is not None

    # -- core operations -----------------------------------------------------

    async def get(self, key: str) -> Any | None:
        """Return the cached value or ``None`` on miss / error."""
        if not self._redis:
            _record_miss()
            return None
        full_key = f"{KEY_PREFIX}{key}"
        try:
            raw = await self._redis.get(full_key)
            if raw is None:
                _record_miss()
                return None
            _record_hit()
            return json.loads(raw)
        except Exception as exc:
            logger.warning("Cache GET error for %s: %s", full_key, exc)
            _record_miss()
            return None

    async def set(self, key: str, value: Any, ttl: int = TTL_DEFAULT) -> None:
        """Store *value* as JSON with the given TTL (seconds)."""
        if not self._redis:
            return
        full_key = f"{KEY_PREFIX}{key}"
        try:
            await self._redis.set(full_key, json.dumps(value, default=str), ex=ttl)
        except Exception as exc:
            logger.warning("Cache SET error for %s: %s", full_key, exc)

    async def delete(self, key: str) -> None:
        """Delete a single cache key."""
        if not self._redis:
            return
        full_key = f"{KEY_PREFIX}{key}"
        try:
            await self._redis.delete(full_key)
        except Exception as exc:
            logger.warning("Cache DELETE error for %s: %s", full_key, exc)

    async def invalidate_pattern(self, pattern: str) -> int:
        """Delete all keys matching *pattern* (glob-style, under ``cache:`` prefix).

        Uses SCAN to avoid blocking Redis on large keyspaces.
        Returns the number of keys deleted.
        """
        if not self._redis:
            return 0
        full_pattern = f"{KEY_PREFIX}{pattern}"
        deleted = 0
        try:
            cursor = 0
            while True:
                cursor, keys = await self._redis.scan(
                    cursor=cursor, match=full_pattern, count=200
                )
                if keys:
                    await self._redis.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
        except Exception as exc:
            logger.warning("Cache INVALIDATE_PATTERN error for %s: %s", full_pattern, exc)
        if deleted:
            logger.debug("Invalidated %d keys matching %s", deleted, full_pattern)
        return deleted

    def stats(self) -> dict:
        """Return current hit/miss counters."""
        total = _hits + _misses
        return {
            "hits": _hits,
            "misses": _misses,
            "hit_rate": round(_hits / total, 4) if total else 0.0,
        }


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_cache_instance: RedisCache | None = None
_cache_lock = asyncio.Lock()


async def get_cache() -> RedisCache:
    """Return (and lazily initialize) the global ``RedisCache`` singleton."""
    global _cache_instance
    if _cache_instance is not None:
        return _cache_instance
    async with _cache_lock:
        # Double-check after acquiring lock
        if _cache_instance is not None:
            return _cache_instance
        _cache_instance = RedisCache()
        await _cache_instance.connect()
        return _cache_instance


# ---------------------------------------------------------------------------
# Cache decorator
# ---------------------------------------------------------------------------


def _make_cache_key(prefix: str, func_name: str, args: tuple, kwargs: dict) -> str:
    """Deterministic cache key from function name + arguments."""
    parts = [prefix, func_name]
    for a in args:
        parts.append(str(a))
    for k in sorted(kwargs):
        if k == "bust":
            continue
        parts.append(f"{k}={kwargs[k]}")
    raw = ":".join(parts)
    # Keep keys short but unique
    if len(raw) > 200:
        h = hashlib.sha256(raw.encode()).hexdigest()[:16]
        return raw[:180] + ":" + h
    return raw


def cached(ttl: int = TTL_DEFAULT, key_prefix: str = ""):
    """Decorator that caches the return value of an async function.

    Usage::

        @cached(ttl=60, key_prefix="dashboard")
        async def get_dashboard_metrics(project_id: int, org_id: int):
            ...

    Pass ``bust=True`` as a keyword argument at call-time to force a refresh::

        await get_dashboard_metrics(project_id=1, org_id=5, bust=True)

    The ``org_id`` kwarg (if present) is automatically included in the key
    for per-tenant isolation.
    """

    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            bust = kwargs.pop("bust", False)
            cache = await get_cache()

            cache_key = _make_cache_key(
                key_prefix or fn.__module__,
                fn.__qualname__,
                args,
                kwargs,
            )

            if not bust:
                hit = await cache.get(cache_key)
                if hit is not None:
                    return hit

            result = await fn(*args, **kwargs)
            await cache.set(cache_key, result, ttl=ttl)
            return result

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Invalidation helpers
# ---------------------------------------------------------------------------


async def invalidate_project(project_id: int) -> int:
    """Clear all caches related to a project."""
    cache = await get_cache()
    return await cache.invalidate_pattern(f"*project*{project_id}*")


async def invalidate_dashboard(project_id: int) -> int:
    """Clear dashboard metric caches for a project."""
    cache = await get_cache()
    return await cache.invalidate_pattern(f"*dashboard*{project_id}*")


async def invalidate_mentions(project_id: int) -> int:
    """Clear mention list caches for a project."""
    cache = await get_cache()
    return await cache.invalidate_pattern(f"*mention*{project_id}*")
