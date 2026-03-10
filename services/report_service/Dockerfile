FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY services/report_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

COPY shared/ /app/shared/
COPY src/reports/templates/ /app/services/report_service/app/templates/
COPY services/report_service/app/ /app/services/report_service/app/

RUN mkdir -p /app/reports_output /app/output && chown -R appuser:appuser /app/reports_output /app/output

USER appuser

CMD ["python", "-m", "services.report_service.app.main"]
