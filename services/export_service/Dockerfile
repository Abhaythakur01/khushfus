# syntax=docker/dockerfile:1
# =============================================================================
# KhushFus Export Service - Multi-stage Docker Build
# Pin to digest in production: python:3.11-slim@sha256:...
# =============================================================================

FROM python:3.11-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY services/export_service/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install -r requirements.txt

FROM python:3.11-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /install /usr/local
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser
COPY shared/ /app/shared/
COPY services/export_service/app/ /app/services/export_service/app/
RUN mkdir -p /app/exports_output /app/output && chown -R appuser:appuser /app/exports_output /app/output
EXPOSE 8015

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8015/health || exit 1

USER appuser
CMD ["uvicorn", "services.export_service.app.main:app", "--host", "0.0.0.0", "--port", "8015"]
