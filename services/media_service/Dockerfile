# syntax=docker/dockerfile:1
# =============================================================================
# KhushFus Media Service - Multi-stage Docker Build
# Pin to digest in production: python:3.11-slim@sha256:...
# =============================================================================

FROM python:3.11-slim AS builder
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY services/media_service/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install -r requirements.txt

FROM python:3.11-slim AS runtime
WORKDIR /app
# Runtime: ffmpeg for video/audio, tesseract as OCR fallback
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 ffmpeg tesseract-ocr libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /install /usr/local
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser
COPY shared/ /app/shared/
COPY services/media_service/app/ /app/services/media_service/app/
ENV PYTHONUNBUFFERED=1
RUN mkdir -p /app/output && chown appuser:appuser /app/output
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
    CMD pgrep -f python || exit 1

USER appuser
CMD ["python", "-m", "services.media_service.app.main"]
