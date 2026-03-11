# =============================================================================
# KhushFus Project Service - Multi-stage Docker Build
# Pin to digest in production: python:3.11-slim@sha256:...
# =============================================================================

FROM python:3.11-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY services/project_service/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /install /usr/local
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser
COPY shared/ /app/shared/
COPY services/project_service/app/ /app/services/project_service/app/
EXPOSE 8020
USER appuser
CMD ["uvicorn", "services.project_service.app.main:app", "--host", "0.0.0.0", "--port", "8020"]
