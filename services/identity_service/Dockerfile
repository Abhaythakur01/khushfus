FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev pkg-config libxml2-dev libxmlsec1-dev libxmlsec1-openssl && rm -rf /var/lib/apt/lists/*

COPY services/identity_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

COPY shared/ /app/shared/
COPY services/identity_service/app/ /app/services/identity_service/app/

EXPOSE 8010

USER appuser

CMD ["uvicorn", "services.identity_service.app.main:app", "--host", "0.0.0.0", "--port", "8010"]
