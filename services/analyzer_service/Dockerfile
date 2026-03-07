FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential && rm -rf /var/lib/apt/lists/*

COPY services/analyzer_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY src/nlp/ /app/src/nlp/
COPY src/config/ /app/src/config/
COPY src/__init__.py /app/src/__init__.py
COPY services/analyzer_service/app/ /app/services/analyzer_service/app/

CMD ["python", "-m", "services.analyzer_service.app.main"]
