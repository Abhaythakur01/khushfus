FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY services/export_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY services/export_service/app/ /app/services/export_service/app/

RUN mkdir -p /app/exports_output

EXPOSE 8015

CMD ["uvicorn", "services.export_service.app.main:app", "--host", "0.0.0.0", "--port", "8015"]
