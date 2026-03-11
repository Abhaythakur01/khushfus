# syntax=docker/dockerfile:1
# =============================================================================
# KhushFus Notification Service - Multi-stage Docker Build
# Pin to digest in production: python:3.11-slim@sha256:...
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder - install dependencies and compile
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY services/notification_service/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2: Runtime - slim image with only needed files
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

COPY shared/ /app/shared/
COPY services/notification_service/app/ /app/services/notification_service/app/

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD pgrep -f python || exit 1

USER appuser

CMD ["python", "-m", "services.notification_service.app.main"]
