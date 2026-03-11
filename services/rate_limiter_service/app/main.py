"""
Rate Limiter / Platform Orchestrator Service — centralized API rate limit tracking.

Responsibilities:
1. Track and enforce rate limits for all external platform APIs
2. Redis-based sliding window rate limiting using sorted sets for precision
3. Pre-configured defaults for Twitter, YouTube, Facebook, Reddit, LinkedIn
4. Endpoints to acquire permission, query quota status, and configure quotas
5. Backoff recommendations when approaching limits
6. Persists quota configurations in PostgreSQL via PlatformQuota model

Port: 8014
"""

import logging
import os
import time
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, select

from shared.database import create_db, init_tables
from shared.internal_auth import verify_internal_token
from shared.models import Platform, PlatformQuota
from shared.tracing import setup_tracing

setup_tracing("rate-limiter")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Redis key prefix for rate limit sorted sets
RATE_LIMIT_PREFIX = "khushfus:ratelimit"


# ---------------------------------------------------------------------------
# Pre-configured platform defaults
# ---------------------------------------------------------------------------

DEFAULT_QUOTAS: list[dict] = [
    # Twitter
    {"platform": "twitter", "endpoint": "search", "max_requests": 300, "window_seconds": 900},
    {"platform": "twitter", "endpoint": "user_lookup", "max_requests": 900, "window_seconds": 900},
    {"platform": "twitter", "endpoint": "post_tweet", "max_requests": 200, "window_seconds": 900},
    # YouTube
    {"platform": "youtube", "endpoint": "search", "max_requests": 10000, "window_seconds": 86400},
    {"platform": "youtube", "endpoint": "default", "max_requests": 10000, "window_seconds": 86400},
    # Facebook
    {"platform": "facebook", "endpoint": "default", "max_requests": 200, "window_seconds": 3600},
    {"platform": "facebook", "endpoint": "page_post", "max_requests": 200, "window_seconds": 3600},
    # Reddit
    {"platform": "reddit", "endpoint": "default", "max_requests": 60, "window_seconds": 60},
    {"platform": "reddit", "endpoint": "search", "max_requests": 60, "window_seconds": 60},
    # LinkedIn
    {"platform": "linkedin", "endpoint": "default", "max_requests": 100, "window_seconds": 86400},
    {"platform": "linkedin", "endpoint": "ugc_post", "max_requests": 100, "window_seconds": 86400},
    # Instagram (shares Facebook's Graph API limits)
    {"platform": "instagram", "endpoint": "default", "max_requests": 200, "window_seconds": 3600},
    {"platform": "instagram", "endpoint": "media_publish", "max_requests": 25, "window_seconds": 86400},
]


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------


class AcquireRequest(BaseModel):
    platform: str
    endpoint: str = "default"


class AcquireResponse(BaseModel):
    allowed: bool
    current_usage: int
    max_requests: int
    window_seconds: int
    remaining: int
    wait_seconds: float = 0.0
    backoff_recommended: bool = False
    backoff_factor: float = 1.0


class QuotaConfigRequest(BaseModel):
    platform: str
    endpoint: str = "default"
    max_requests: int
    window_seconds: int


class QuotaOut(BaseModel):
    id: int
    platform: str
    endpoint: str
    max_requests: int
    window_seconds: int
    model_config = {"from_attributes": True}


class QuotaStatusOut(BaseModel):
    platform: str
    endpoint: str
    max_requests: int
    window_seconds: int
    current_usage: int
    remaining: int
    utilization_pct: float
    window_resets_in_seconds: float
    backoff_recommended: bool


# ---------------------------------------------------------------------------
# Sliding Window Rate Limiter (Redis sorted sets)
# ---------------------------------------------------------------------------


class SlidingWindowLimiter:
    """
    Precision sliding window rate limiter using Redis sorted sets.

    Each API call is recorded as a member in a sorted set keyed by
    platform:endpoint. The score is the Unix timestamp of the call.
    To check the rate, we count members within [now - window, now].
    """

    def __init__(self, redis_client: aioredis.Redis):
        self.redis = redis_client

    def _key(self, platform: str, endpoint: str) -> str:
        return f"{RATE_LIMIT_PREFIX}:{platform}:{endpoint}"

    async def acquire(self, platform: str, endpoint: str, max_requests: int, window_seconds: int) -> AcquireResponse:
        """
        Attempt to acquire a rate limit slot.
        Returns whether the request is allowed, plus usage metadata.
        """
        key = self._key(platform, endpoint)
        now = time.time()
        window_start = now - window_seconds

        pipe = self.redis.pipeline()
        # Remove expired entries outside the window
        pipe.zremrangebyscore(key, 0, window_start)
        # Count current usage within window
        pipe.zcard(key)
        results = await pipe.execute()

        current_usage = results[1]
        remaining = max(0, max_requests - current_usage)

        # Calculate utilization for backoff recommendation
        utilization = current_usage / max_requests if max_requests > 0 else 1.0
        backoff_recommended = utilization >= 0.8
        backoff_factor = 1.0
        if utilization >= 0.95:
            backoff_factor = 4.0
        elif utilization >= 0.9:
            backoff_factor = 2.0
        elif utilization >= 0.8:
            backoff_factor = 1.5

        if current_usage >= max_requests:
            # Denied — calculate how long to wait
            # Find the oldest entry in the window to know when a slot frees up
            oldest = await self.redis.zrangebyscore(key, window_start, "+inf", start=0, num=1)
            wait_seconds = 0.0
            if oldest:
                oldest_score = await self.redis.zscore(key, oldest[0])
                if oldest_score is not None:
                    wait_seconds = max(0.0, (oldest_score + window_seconds) - now)
                else:
                    wait_seconds = 1.0
            else:
                wait_seconds = 1.0

            return AcquireResponse(
                allowed=False,
                current_usage=current_usage,
                max_requests=max_requests,
                window_seconds=window_seconds,
                remaining=0,
                wait_seconds=round(wait_seconds, 2),
                backoff_recommended=True,
                backoff_factor=backoff_factor,
            )

        # Allowed — record the request
        # Use a unique member: timestamp with microsecond counter to avoid collisions
        member = f"{now}:{id(object())}"
        await self.redis.zadd(key, {member: now})
        # Set TTL on the key so Redis cleans up automatically
        await self.redis.expire(key, window_seconds + 60)

        return AcquireResponse(
            allowed=True,
            current_usage=current_usage + 1,
            max_requests=max_requests,
            window_seconds=window_seconds,
            remaining=remaining - 1,
            wait_seconds=0.0,
            backoff_recommended=backoff_recommended,
            backoff_factor=backoff_factor,
        )

    async def get_usage(self, platform: str, endpoint: str, window_seconds: int) -> int:
        """Get current usage count within the window."""
        key = self._key(platform, endpoint)
        now = time.time()
        window_start = now - window_seconds
        await self.redis.zremrangebyscore(key, 0, window_start)
        return await self.redis.zcard(key)

    async def get_window_reset(self, platform: str, endpoint: str, window_seconds: int) -> float:
        """Get seconds until the oldest entry in window expires (freeing a slot)."""
        key = self._key(platform, endpoint)
        now = time.time()
        window_start = now - window_seconds
        oldest = await self.redis.zrangebyscore(key, window_start, "+inf", start=0, num=1)
        if oldest:
            oldest_score = await self.redis.zscore(key, oldest[0])
            if oldest_score is not None:
                return max(0.0, (oldest_score + window_seconds) - now)
        return 0.0


# ---------------------------------------------------------------------------
# Quota Configuration Helpers
# ---------------------------------------------------------------------------


async def get_quota_config(session_factory, platform: str, endpoint: str) -> dict | None:
    """Look up quota config from DB, falling back to defaults."""
    async with session_factory() as db:
        result = await db.execute(
            select(PlatformQuota).where(
                and_(
                    PlatformQuota.platform == Platform(platform),
                    PlatformQuota.endpoint == endpoint,
                )
            )
        )
        quota = result.scalar_one_or_none()
        if quota:
            return {
                "platform": platform,
                "endpoint": endpoint,
                "max_requests": quota.max_requests,
                "window_seconds": quota.window_seconds,
            }

    # Fallback to defaults
    for d in DEFAULT_QUOTAS:
        if d["platform"] == platform and d["endpoint"] == endpoint:
            return d

    # If specific endpoint not found, try 'default' for the platform
    if endpoint != "default":
        return await get_quota_config(session_factory, platform, "default")

    return None


async def seed_default_quotas(session_factory):
    """Seed default quota configurations into PostgreSQL if they don't exist."""
    async with session_factory() as db:
        for q in DEFAULT_QUOTAS:
            result = await db.execute(
                select(PlatformQuota).where(
                    and_(
                        PlatformQuota.platform == Platform(q["platform"]),
                        PlatformQuota.endpoint == q["endpoint"],
                    )
                )
            )
            existing = result.scalar_one_or_none()
            if not existing:
                from datetime import datetime, timezone

                quota = PlatformQuota(
                    platform=Platform(q["platform"]),
                    endpoint=q["endpoint"],
                    max_requests=q["max_requests"],
                    window_seconds=q["window_seconds"],
                    requests_used=0,
                    window_reset_at=datetime.now(timezone.utc),
                )
                db.add(quota)
        await db.commit()
    logger.info(f"Seeded {len(DEFAULT_QUOTAS)} default quota configurations")


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine, session_factory = create_db(DATABASE_URL)
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    limiter = SlidingWindowLimiter(redis_client)

    await init_tables(engine)
    await seed_default_quotas(session_factory)

    app.state.db_session = session_factory
    app.state.redis = redis_client
    app.state.limiter = limiter

    logger.info("Rate Limiter Service started on port 8014")
    yield

    await redis_client.aclose()
    await engine.dispose()


app = FastAPI(
    title="KhushFus Rate Limiter Service",
    description="Centralized platform API rate limit tracking and enforcement",
    version="0.1.0",
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "Rate Limiting", "description": "Acquire rate limit slots and check quota status."},
        {"name": "Quotas", "description": "Configure and list platform quota definitions."},
        {"name": "Health", "description": "Service health check."},
    ],
    lifespan=lifespan,
)


try:
    from shared.request_logging import RequestLoggingMiddleware

    app.add_middleware(RequestLoggingMiddleware, service_name="rate-limiter")
except ImportError:
    logger.debug("RequestLoggingMiddleware not available")


try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass

v1_router = APIRouter(prefix="/api/v1")


@app.get(
    "/health",
    tags=["Health"],
    summary="Rate limiter health check",
    description="Returns the health status of the Rate Limiter service and its dependencies.",
)
async def health():
    from shared.health import build_health_response, check_postgres, check_redis

    checks = {
        "postgres": await check_postgres(database_url=DATABASE_URL),
        "redis": await check_redis(REDIS_URL),
    }
    return await build_health_response("rate-limiter", checks=checks)


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------


@v1_router.post(
    "/acquire",
    response_model=AcquireResponse,
    tags=["Rate Limiting"],
    summary="Acquire a rate limit slot",
    description="Request permission to call a platform endpoint. Returns allow/deny with wait time.",
    dependencies=[Depends(verify_internal_token)],
)
async def acquire(body: AcquireRequest):
    """
    Request permission to make an API call to a platform endpoint.
    Returns allow/deny with wait_seconds if denied, and backoff
    recommendations when approaching limits.
    """
    session_factory = app.state.db_session
    limiter: SlidingWindowLimiter = app.state.limiter

    config = await get_quota_config(session_factory, body.platform, body.endpoint)
    if not config:
        raise HTTPException(
            status_code=404,
            detail={
                "error_code": "QUOTA_NOT_FOUND",
                "message": f"No quota configuration found for {body.platform}/{body.endpoint}",
            },
        )

    result = await limiter.acquire(
        platform=body.platform,
        endpoint=body.endpoint,
        max_requests=config["max_requests"],
        window_seconds=config["window_seconds"],
    )
    return result


@v1_router.get(
    "/quotas",
    response_model=list[QuotaOut],
    tags=["Quotas"],
    summary="List quota configurations",
    description="List all configured platform quota definitions sorted by platform and endpoint.",
    dependencies=[Depends(verify_internal_token)],
)
async def list_quotas():
    """List all configured platform quota definitions."""
    session_factory = app.state.db_session

    async with session_factory() as db:
        result = await db.execute(select(PlatformQuota).order_by(PlatformQuota.platform, PlatformQuota.endpoint))
        quotas = result.scalars().all()
        return [QuotaOut.model_validate(q) for q in quotas]


@v1_router.post(
    "/quotas",
    response_model=QuotaOut,
    status_code=201,
    tags=["Quotas"],
    summary="Create or update a quota",
    description="Create or update a platform quota configuration with custom max_requests and window_seconds.",
    dependencies=[Depends(verify_internal_token)],
)
async def configure_quota(body: QuotaConfigRequest):
    """Create or update a platform quota configuration."""
    session_factory = app.state.db_session

    async with session_factory() as db:
        result = await db.execute(
            select(PlatformQuota).where(
                and_(
                    PlatformQuota.platform == Platform(body.platform),
                    PlatformQuota.endpoint == body.endpoint,
                )
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.max_requests = body.max_requests
            existing.window_seconds = body.window_seconds
            await db.commit()
            await db.refresh(existing)
            logger.info(
                f"Updated quota: {body.platform}/{body.endpoint} -> {body.max_requests} req / {body.window_seconds}s"
            )
            return QuotaOut.model_validate(existing)
        else:
            from datetime import datetime, timezone

            quota = PlatformQuota(
                platform=Platform(body.platform),
                endpoint=body.endpoint,
                max_requests=body.max_requests,
                window_seconds=body.window_seconds,
                requests_used=0,
                window_reset_at=datetime.now(timezone.utc),
            )
            db.add(quota)
            await db.commit()
            await db.refresh(quota)
            logger.info(
                f"Created quota: {body.platform}/{body.endpoint} -> {body.max_requests} req / {body.window_seconds}s"
            )
            return QuotaOut.model_validate(quota)


@v1_router.get(
    "/quotas/{platform}/status",
    response_model=list[QuotaStatusOut],
    tags=["Rate Limiting"],
    summary="Get platform quota status",
    description="Real-time usage status for all endpoints of a platform with utilization and backoff.",
    dependencies=[Depends(verify_internal_token)],
)
async def platform_status(platform: str):
    """Get current usage status for all endpoints of a platform."""
    session_factory = app.state.db_session
    limiter: SlidingWindowLimiter = app.state.limiter

    # Validate platform
    try:
        Platform(platform)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "INVALID_PLATFORM", "message": f"Unknown platform: {platform}"},
        )

    async with session_factory() as db:
        result = await db.execute(select(PlatformQuota).where(PlatformQuota.platform == Platform(platform)))
        quotas = result.scalars().all()

    if not quotas:
        raise HTTPException(
            status_code=404,
            detail={
                "error_code": "PLATFORM_QUOTAS_NOT_FOUND",
                "message": f"No quotas configured for platform: {platform}",
            },
        )

    statuses = []
    for q in quotas:
        current_usage = await limiter.get_usage(platform, q.endpoint, q.window_seconds)
        remaining = max(0, q.max_requests - current_usage)
        utilization = current_usage / q.max_requests if q.max_requests > 0 else 0.0
        window_resets_in = await limiter.get_window_reset(platform, q.endpoint, q.window_seconds)

        statuses.append(
            QuotaStatusOut(
                platform=platform,
                endpoint=q.endpoint,
                max_requests=q.max_requests,
                window_seconds=q.window_seconds,
                current_usage=current_usage,
                remaining=remaining,
                utilization_pct=round(utilization * 100, 2),
                window_resets_in_seconds=round(window_resets_in, 2),
                backoff_recommended=utilization >= 0.8,
            )
        )

    return statuses


app.include_router(v1_router)

# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8014)
