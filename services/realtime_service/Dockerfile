FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY services/realtime_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY services/realtime_service/app/ /app/services/realtime_service/app/

EXPOSE 8019

CMD ["uvicorn", "services.realtime_service.app.main:app", "--host", "0.0.0.0", "--port", "8019"]
