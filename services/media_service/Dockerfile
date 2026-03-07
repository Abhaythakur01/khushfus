FROM python:3.11-slim

WORKDIR /app

# System dependencies: ffmpeg for video/audio, tesseract as OCR fallback
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev ffmpeg tesseract-ocr libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY services/media_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY services/media_service/app/ /app/services/media_service/app/

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "services.media_service.app.main"]
