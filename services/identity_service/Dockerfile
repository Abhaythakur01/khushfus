FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev pkg-config libxml2-dev libxmlsec1-dev libxmlsec1-openssl && rm -rf /var/lib/apt/lists/*

COPY services/identity_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY services/identity_service/app/ /app/services/identity_service/app/

EXPOSE 8010

CMD ["uvicorn", "services.identity_service.app.main:app", "--host", "0.0.0.0", "--port", "8010"]
