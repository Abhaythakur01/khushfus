FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY services/publishing_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

COPY shared/ /app/shared/
COPY services/publishing_service/app/ /app/services/publishing_service/app/

EXPOSE 8013

USER appuser

CMD ["uvicorn", "services.publishing_service.app.main:app", "--host", "0.0.0.0", "--port", "8013"]
