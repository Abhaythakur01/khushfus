"""
API Gateway — the single entry point for all client requests.

Responsibilities:
- JWT authentication and authorization
- Route requests to appropriate microservices
- Rate limiting
- Request/response logging
"""

import logging
import os
import traceback
import uuid
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi import Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from shared.config import get_settings, reset_settings
from shared.cors import get_cors_origins
from shared.database import create_db, init_tables
from shared.events import EventBus
from shared.idempotency import IdempotencyMiddleware
from shared.request_size_limit import RequestSizeLimitMiddleware
from shared.tracing import setup_tracing

from .middleware import RateLimitMiddleware, close_http_client
from .routes import alerts, auth, dashboard, mentions, notifications, projects, reports

logger = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique X-Request-ID to every request/response for correlation."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every request with method, path, status, latency, and user context."""

    async def dispatch(self, request: Request, call_next):
        import time

        start = time.monotonic()
        response = await call_next(request)
        latency_ms = round((time.monotonic() - start) * 1000, 1)

        request_id = getattr(request.state, "request_id", "-")
        user = getattr(request.state, "_current_user", None)
        user_id = user.id if user else "-"
        client_ip = request.client.host if request.client else "-"

        logger.info(
            "request %s %s status=%d latency=%.1fms user=%s ip=%s req_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            latency_ms,
            user_id,
            client_ip,
            request_id,
        )
        return response

setup_tracing("gateway")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Centralized config validation on startup ---
    try:
        settings = get_settings()
        settings.validate_or_exit()
        logger.info("Configuration summary: %s", settings.summary())
        # Use validated settings for connections (fall back to module-level vars for compat)
        db_url = settings.database.url
        redis_url = settings.redis.url
    except Exception as e:
        logger.warning("Config validation unavailable (%s), falling back to env vars", e)
        db_url = DATABASE_URL
        redis_url = REDIS_URL

    engine, session_factory = create_db(db_url)
    app.state.db_session = session_factory
    app.state.event_bus = EventBus(redis_url, max_reconnect_attempts=1, reconnect_delay=0.5)
    await init_tables(engine)
    try:
        await app.state.event_bus.connect()
    except Exception as e:
        logger.warning(f"Redis unavailable — event bus disabled: {e}")
    yield
    await close_http_client()
    try:
        await app.state.event_bus.close()
    except Exception:
        pass
    await engine.dispose()
    reset_settings()


tags_metadata = [
    {
        "name": "Auth",
        "description": "User registration, login, and profile retrieval.",
    },
    {
        "name": "Projects",
        "description": "Project CRUD, keyword management, and collection triggers.",
    },
    {
        "name": "Mentions",
        "description": "Browse, search, and flag social mentions.",
    },
    {
        "name": "Reports",
        "description": "Generate and retrieve analytics reports.",
    },
    {
        "name": "Dashboard",
        "description": "Aggregated dashboard metrics and trends.",
    },
    {
        "name": "Alerts",
        "description": "Alert rules and alert log management.",
    },
    {
        "name": "Health",
        "description": "Service health checks.",
    },
]

app = FastAPI(
    title="KhushFus API Gateway",
    description=(
        "Enterprise Social Listening Platform -- the single entry point for all client requests.\n\n"
        "Handles JWT authentication, request routing, rate limiting, and exposes the core "
        "social-listening REST API including projects, mentions, reports, dashboards, and alerts."
    ),
    version="0.1.0",
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=tags_metadata,
    lifespan=lifespan,
)

# Request correlation ID
app.add_middleware(RequestIDMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request body size limit (default 10 MB, configurable via MAX_REQUEST_BODY_SIZE env)
app.add_middleware(RequestSizeLimitMiddleware)

# Rate limiting and idempotency disabled in local dev (require Redis)
# app.add_middleware(RateLimitMiddleware)
# app.add_middleware(IdempotencyMiddleware, redis_url=REDIS_URL)

try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass

@app.exception_handler(Exception)
async def global_exception_handler(request: FastAPIRequest, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
    logger.error(f"Unhandled exception [request_id={request_id}]: {''.join(tb)}")
    # Include CORS headers so the browser can read the error response
    origin = request.headers.get("origin", "")
    headers = {}
    allowed = get_cors_origins()
    if origin and (origin in allowed or "*" in allowed):
        headers["access-control-allow-origin"] = origin
        headers["access-control-allow-credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
        headers=headers,
    )


# --- API v1 routes (current, stable) ---
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(mentions.router, prefix="/api/v1/mentions", tags=["Mentions"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["Alerts"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])

# --- API v2 routes (future) ---
# When v2 endpoints are ready, create route modules under routes/v2/ and mount them here.
# v1 endpoints should remain available with Deprecation headers (see shared.deprecation)
# until the sunset date passes.
#
# Example:
#   from .routes.v2 import projects as projects_v2
#   app.include_router(projects_v2.router, prefix="/api/v2/projects", tags=["Projects v2"])
v2_router = APIRouter()


@v2_router.get("/", summary="API v2 placeholder", include_in_schema=False)
async def v2_root():
    return {"message": "API v2 is under development. Please use /api/v1/ endpoints."}


app.include_router(v2_router, prefix="/api/v2")


@app.get(
    "/health",
    tags=["Health"],
    summary="Gateway health check",
    description="Returns the health status of the API gateway and its dependencies (Postgres, Redis).",
)
async def health():
    """Return current health status of the gateway service with dependency checks."""
    from shared.health import build_health_response, check_postgres, check_redis

    checks = {
        "postgres": await check_postgres(app.state.db_session),
        "redis": await check_redis(REDIS_URL),
    }
    return await build_health_response("gateway", checks=checks)
