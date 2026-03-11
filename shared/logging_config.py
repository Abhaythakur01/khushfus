"""Structured JSON logging configuration for all KhushFus services.

Usage:
    from shared.logging_config import setup_logging

    setup_logging("analyzer-service")
    logger = logging.getLogger(__name__)
    logger.info("Processed batch", extra={"count": 20, "duration_ms": 150})

Output (JSON):
    {"timestamp":"2026-03-11T...","level":"INFO","service":"analyzer-service",
     "logger":"services.analyzer_service.app.main","message":"Processed batch",
     "count":20,"duration_ms":150}
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Emit structured JSON log lines for ELK/Splunk/Loki ingestion."""

    def __init__(self, service_name: str = "khushfus"):
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": self.service_name,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Merge extra fields (skip standard LogRecord attributes)
        _standard = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__)
        for key, val in record.__dict__.items():
            if key not in _standard and key not in ("message", "msg", "args"):
                try:
                    json.dumps(val)  # ensure serializable
                    log_entry[key] = val
                except (TypeError, ValueError):
                    log_entry[key] = str(val)

        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


def setup_logging(service_name: str, level: str | None = None):
    """Configure root logger with JSON or plain formatting.

    Set ``LOG_FORMAT=plain`` env var to keep human-readable output during
    local development.  Default is JSON for production.
    """
    log_level = level or os.getenv("LOG_LEVEL", "INFO")
    log_format = os.getenv("LOG_FORMAT", "json")

    root = logging.getLogger()
    root.setLevel(log_level.upper())

    # Remove existing handlers to avoid duplicate output
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    if log_format == "plain":
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
            )
        )
    else:
        handler.setFormatter(JSONFormatter(service_name))

    root.addHandler(handler)
