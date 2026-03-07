FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY services/audit_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY services/audit_service/app/ /app/services/audit_service/app/

EXPOSE 8018

CMD ["uvicorn", "services.audit_service.app.main:app", "--host", "0.0.0.0", "--port", "8018"]
