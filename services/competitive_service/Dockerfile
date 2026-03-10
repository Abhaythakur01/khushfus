FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY services/competitive_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

COPY shared/ /app/shared/
COPY services/competitive_service/app/ /app/services/competitive_service/app/

EXPOSE 8016

USER appuser

CMD ["uvicorn", "services.competitive_service.app.main:app", "--host", "0.0.0.0", "--port", "8016"]
