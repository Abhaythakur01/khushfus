"""Shared health check utilities for KhushFus services.

Provides dependency-aware health checks that verify database, Redis,
and OpenSearch connectivity instead of just returning {"status": "ok"}.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def check_postgres(session_factory=None, database_url: str | None = None) -> dict[str, Any]:
    """Check PostgreSQL connectivity via session factory or URL."""
    try:
        from sqlalchemy import text

        if session_factory:
            async with session_factory() as session:
                await session.execute(text("SELECT 1"))
        elif database_url:
            from sqlalchemy.ext.asyncio import create_async_engine

            engine = create_async_engine(database_url)
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            await engine.dispose()
        else:
            return {"status": "unknown", "error": "No connection info provided"}
        return {"status": "up"}
    except Exception as e:
        logger.warning(f"Postgres health check failed: {e}")
        return {"status": "down", "error": str(e)}


async def check_redis(redis_url: str) -> dict[str, Any]:
    """Check Redis connectivity."""
    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(redis_url, decode_responses=True)
        pong = await r.ping()
        await r.aclose()
        return {"status": "up" if pong else "down"}
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        return {"status": "down", "error": str(e)}


async def check_elasticsearch(es_url: str) -> dict[str, Any]:
    """Check OpenSearch connectivity (function name kept for backward compatibility)."""
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{es_url}/_cluster/health")
            data = resp.json()
            return {"status": "up", "cluster_status": data.get("status", "unknown")}
    except Exception as e:
        logger.warning(f"OpenSearch health check failed: {e}")
        return {"status": "down", "error": str(e)}


async def build_health_response(
    service_name: str,
    version: str = "0.1.0",
    checks: dict[str, dict] | None = None,
) -> dict[str, Any]:
    """Build a standardized health response.

    Args:
        service_name: Name of the service.
        version: Service version.
        checks: Dict of dependency check results, e.g. {"postgres": {"status": "up"}}.

    Returns:
        Health response dict with overall status derived from individual checks.
    """
    checks = checks or {}
    all_up = all(c.get("status") == "up" for c in checks.values())
    return {
        "status": "ok" if all_up else "degraded",
        "service": service_name,
        "version": version,
        "dependencies": checks,
    }
