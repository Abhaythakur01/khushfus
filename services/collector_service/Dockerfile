FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY services/collector_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY src/collectors/ /app/src/collectors/
COPY src/config/ /app/src/config/
COPY src/__init__.py /app/src/__init__.py
COPY services/collector_service/app/ /app/services/collector_service/app/

CMD ["python", "-m", "services.collector_service.app.main"]
