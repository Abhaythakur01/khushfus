"""
API Gateway — the single entry point for all client requests.

Responsibilities:
- JWT authentication and authorization
- Route requests to appropriate microservices
- Rate limiting
- Request/response logging
"""

import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from shared.database import create_db, init_tables
from shared.events import EventBus
from shared.tracing import setup_tracing

from .middleware import RateLimitMiddleware, close_http_client
from .routes import alerts, auth, dashboard, mentions, projects, reports


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique X-Request-ID to every request/response for correlation."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

setup_tracing("gateway")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine, session_factory = create_db(DATABASE_URL)
    app.state.db_session = session_factory
    app.state.event_bus = EventBus(REDIS_URL)
    await init_tables(engine)
    await app.state.event_bus.connect()
    yield
    await close_http_client()
    await app.state.event_bus.close()
    await engine.dispose()


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

# Request correlation ID (outermost — runs first on every request)
app.add_middleware(RequestIDMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting via centralized Rate Limiter service (fail-open if unreachable)
app.add_middleware(RateLimitMiddleware)

try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(mentions.router, prefix="/api/v1/mentions", tags=["Mentions"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["Alerts"])


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
