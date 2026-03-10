FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential && rm -rf /var/lib/apt/lists/*

COPY services/analyzer_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

COPY shared/ /app/shared/
COPY src/nlp/ /app/src/nlp/
COPY src/config/ /app/src/config/
COPY src/__init__.py /app/src/__init__.py
COPY services/analyzer_service/app/ /app/services/analyzer_service/app/

USER appuser

CMD ["python", "-m", "services.analyzer_service.app.main"]
