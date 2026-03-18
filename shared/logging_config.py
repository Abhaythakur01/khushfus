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

PII scrubbing (controlled by LOG_PII_SCRUB env var):
    LOG_PII_SCRUB=standard  (default) - scrub PII, keep full IPs
    LOG_PII_SCRUB=strict    - scrub PII + mask last IP octet
    LOG_PII_SCRUB=off       - no scrubbing (dev only)

Examples of scrubbed output:
    "User user@example.com logged in"       -> "User [EMAIL] logged in"
    "Token eyJhbGci...xyz"                  -> "Token [JWT_TOKEN]"
    "API key khf_abc123def"                 -> "API key [API_KEY]"
    "password=hunter2"                      -> "password=[REDACTED]"
    "CC 4111-1111-1111-1111"                -> "CC [CC]"
    "Call +1-555-123-4567"                  -> "Call [PHONE]"
    "From IP 192.168.1.42" (strict mode)    -> "From IP 192.168.1.xxx"
"""

import json
import logging
import os
import re
import sys
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Compiled regex patterns for PII scrubbing (module-level for performance)
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# JWT tokens: header.payload.signature (each part is base64url)
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")

# KhushFus API keys: khf_ prefix followed by alphanumeric
_API_KEY_RE = re.compile(r"\bkhf_[A-Za-z0-9]{8,}\b")

# Password-like assignments in log messages: password=..., passwd=..., secret=...
# Captures up to the next whitespace, comma, quote, or end of string
_PASSWORD_FIELD_RE = re.compile(
    r"(?i)((?:password|passwd|pwd|secret|token|authorization)"
    r"\s*[=:]\s*)"
    r"(\S+)"
)

# Credit card: 4 groups of 4 digits (with separators) or 16 consecutive digits
_CC_RE = re.compile(r"\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b|\b\d{16}\b")

# SSN: 123-45-6789 or 123 45 6789
_SSN_RE = re.compile(r"\b\d{3}[-\s]\d{2}[-\s]\d{4}\b")

# US/international phone formats
_PHONE_RE = re.compile(
    r"(?<!\d)"
    r"(?:\+?\d{1,3}[-.\s]?)?"
    r"(?:\(?\d{2,4}\)?[-.\s]?)"
    r"\d{3,4}[-.\s]?\d{3,4}"
    r"(?!\d)"
)

# IPv4 address — used only in strict mode to mask last octet
_IPV4_RE = re.compile(r"\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b")

# Sensitive field names for dictionary-based scrubbing
_SENSITIVE_FIELD_NAMES = re.compile(
    r"(?i)(password|passwd|pwd|secret|token|key|authorization|credential|api_key)"
)


# ---------------------------------------------------------------------------
# PIIScrubFilter — scrubs PII from log message strings
# ---------------------------------------------------------------------------

class PIIScrubFilter(logging.Filter):
    """Logging filter that scrubs PII from log record messages and args.

    Scrub levels:
        "standard" — scrub emails, JWTs, API keys, passwords, CC, SSN, phones.
                     IP addresses are kept intact (useful for security logs).
        "strict"   — same as standard, plus masks the last octet of IPv4 addresses.
        "off"      — no scrubbing (pass-through).
    """

    def __init__(self, scrub_level: str = "standard"):
        super().__init__()
        self.scrub_level = scrub_level.lower()

    def _scrub_text(self, text: str) -> str:
        """Apply all PII regex substitutions to a text string."""
        if not isinstance(text, str) or not text:
            return text

        # Order matters: SSN/CC before phone to avoid partial matches
        text = _EMAIL_RE.sub("[EMAIL]", text)
        text = _JWT_RE.sub("[JWT_TOKEN]", text)
        text = _API_KEY_RE.sub("[API_KEY]", text)
        text = _PASSWORD_FIELD_RE.sub(r"\1[REDACTED]", text)
        text = _SSN_RE.sub("[SSN]", text)
        text = _CC_RE.sub("[CC]", text)
        text = _PHONE_RE.sub("[PHONE]", text)

        if self.scrub_level == "strict":
            text = _IPV4_RE.sub(r"\1.xxx", text)

        return text

    def _scrub_args(self, args):
        """Scrub PII from log record format args (tuple or dict)."""
        if args is None:
            return args
        if isinstance(args, dict):
            return {k: self._scrub_text(str(v)) if isinstance(v, str) else v for k, v in args.items()}
        if isinstance(args, tuple):
            return tuple(self._scrub_text(str(a)) if isinstance(a, str) else a for a in args)
        return args

    def filter(self, record: logging.LogRecord) -> bool:
        if self.scrub_level == "off":
            return True

        # Scrub the primary message
        if isinstance(record.msg, str):
            record.msg = self._scrub_text(record.msg)

        # Scrub %-style format arguments
        if record.args:
            record.args = self._scrub_args(record.args)

        return True


# ---------------------------------------------------------------------------
# SensitiveFieldFilter — scrubs dictionary-like extra fields by name
# ---------------------------------------------------------------------------

class SensitiveFieldFilter(logging.Filter):
    """Logging filter that redacts extra fields whose names suggest sensitive data.

    Any extra field whose name contains 'password', 'secret', 'token', 'key',
    'authorization', 'credential', or 'api_key' will have its value replaced
    with '[REDACTED]'.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        for attr_name in list(record.__dict__):
            if _SENSITIVE_FIELD_NAMES.search(attr_name):
                setattr(record, attr_name, "[REDACTED]")
        return True


# ---------------------------------------------------------------------------
# JSONFormatter — structured JSON log lines
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# setup_logging — configure root logger with PII scrubbing
# ---------------------------------------------------------------------------

def setup_logging(service_name: str, level: str | None = None):
    """Configure root logger with JSON or plain formatting and PII scrubbing.

    Set ``LOG_FORMAT=plain`` env var to keep human-readable output during
    local development.  Default is JSON for production.

    Set ``LOG_PII_SCRUB`` env var to control PII scrubbing:
        - ``standard`` (default): scrub PII, keep full IPs
        - ``strict``: scrub PII + mask last IP octet
        - ``off``: disable scrubbing (dev only, not recommended)
    """
    log_level = level or os.getenv("LOG_LEVEL", "INFO")
    log_format = os.getenv("LOG_FORMAT", "json")
    pii_scrub = os.getenv("LOG_PII_SCRUB", "standard").lower()

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

    # Attach PII scrubbing filters to the handler so they apply to all loggers
    if pii_scrub != "off":
        handler.addFilter(PIIScrubFilter(scrub_level=pii_scrub))
        handler.addFilter(SensitiveFieldFilter())

    root.addHandler(handler)
