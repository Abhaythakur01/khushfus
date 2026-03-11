"""Shared utilities for consumer/worker services.

Provides:
- Error classification (transient vs permanent)
- Backoff with jitter
- Consumer metrics (Prometheus counters if available, no-op otherwise)
- Startup env var validation
- Graceful shutdown helpers
- TCP liveness probe server for K8s
- Consumer lag monitoring
"""

import asyncio
import json
import logging
import os
import random
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# ============================================================
# TCP Liveness Probe Server
# ============================================================


async def start_liveness_server(port: int = 9090):
    """Start a minimal TCP server for K8s liveness probes.

    Returns True on any connection to confirm the process is alive.
    Consumer services (no HTTP) use this for K8s livenessProbe: tcpSocket.
    """
    async def handle_client(reader, writer):
        writer.write(b"OK\n")
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle_client, "0.0.0.0", port)
    logger.info("Liveness probe server started on port %d", port)
    return server


# ============================================================
# Consumer Lag Monitoring
# ============================================================


async def log_consumer_lag_periodically(bus, stream: str, group: str, interval: int = 60):
    """Log consumer lag every `interval` seconds. Run as a background task."""
    while True:
        try:
            lag = await bus.get_consumer_lag(stream, group)
            pending = lag.get("pending", 0)
            if pending > 0:
                logger.info("Consumer lag: stream=%s group=%s pending=%s", stream, group, pending)
        except Exception:
            pass
        await asyncio.sleep(interval)

# ============================================================
# Error Classification
# ============================================================

PERMANENT_ERRORS: tuple[type[Exception], ...] = (
    ValueError,
    TypeError,
    KeyError,
    json.JSONDecodeError,
)


def is_transient_error(exc: Exception) -> bool:
    """Return True if the error is likely transient and worth retrying.

    Transient: connection errors, timeouts, 5xx HTTP, Redis/DB unavailable.
    Permanent: bad data, validation errors, missing fields, parse errors.
    """
    if isinstance(exc, PERMANENT_ERRORS):
        return False

    # Connection/timeout errors are always transient
    exc_name = type(exc).__name__.lower()
    transient_patterns = (
        "timeout", "connection", "refused", "reset", "broken",
        "unavailable", "temporary", "retry", "503", "502", "429",
    )
    exc_str = str(exc).lower()
    if any(p in exc_name or p in exc_str for p in transient_patterns):
        return True

    # Default: treat unknown errors as transient (safer — retries won't lose data)
    return True


# ============================================================
# Backoff with Jitter
# ============================================================


def backoff_with_jitter(
    attempt: int,
    base: float = 1.0,
    max_delay: float = 60.0,
) -> float:
    """Calculate exponential backoff with full jitter.

    Returns a delay in seconds: random(0, min(max_delay, base * 2^attempt)).
    """
    delay = min(max_delay, base * (2 ** attempt))
    return random.uniform(0, delay)


# ============================================================
# Consumer Metrics
# ============================================================


@dataclass
class ConsumerMetrics:
    """Lightweight in-process metrics for consumer services.

    If prometheus_client is installed, exposes real Counter/Histogram.
    Otherwise, tracks in-memory counters for logging.
    """

    service_name: str
    _messages_processed: int = 0
    _messages_failed: int = 0
    _messages_dlq: int = 0
    _batch_durations: list = field(default_factory=list)

    # Prometheus objects (set if library available)
    _prom_processed: object = None
    _prom_failed: object = None
    _prom_dlq: object = None
    _prom_duration: object = None

    def __post_init__(self):
        try:
            from prometheus_client import Counter, Histogram

            self._prom_processed = Counter(
                "consumer_messages_processed_total",
                "Total messages processed",
                ["service"],
            )
            self._prom_failed = Counter(
                "consumer_messages_failed_total",
                "Total messages failed",
                ["service"],
            )
            self._prom_dlq = Counter(
                "consumer_messages_dlq_total",
                "Total messages sent to DLQ",
                ["service"],
            )
            self._prom_duration = Histogram(
                "consumer_batch_duration_seconds",
                "Batch processing duration",
                ["service"],
            )
        except ImportError:
            pass

    def record_processed(self, count: int = 1):
        self._messages_processed += count
        if self._prom_processed:
            self._prom_processed.labels(service=self.service_name).inc(count)

    def record_failed(self, count: int = 1):
        self._messages_failed += count
        if self._prom_failed:
            self._prom_failed.labels(service=self.service_name).inc(count)

    def record_dlq(self, count: int = 1):
        self._messages_dlq += count
        if self._prom_dlq:
            self._prom_dlq.labels(service=self.service_name).inc(count)

    def record_batch_duration(self, seconds: float):
        self._batch_durations.append(seconds)
        if self._prom_duration:
            self._prom_duration.labels(service=self.service_name).observe(seconds)

    def start_timer(self) -> float:
        return time.monotonic()

    def stop_timer(self, start: float):
        self.record_batch_duration(time.monotonic() - start)

    def summary(self) -> dict:
        return {
            "processed": self._messages_processed,
            "failed": self._messages_failed,
            "dlq": self._messages_dlq,
        }


# ============================================================
# Env Var Validation
# ============================================================


def validate_env(
    required: list[str] | None = None,
    warn_if_missing: list[str] | None = None,
) -> list[str]:
    """Validate environment variables at service startup.

    Args:
        required: Env vars that MUST be set (exits if missing in production).
        warn_if_missing: Env vars that SHOULD be set (logs warning if missing).

    Returns:
        List of missing required vars (empty if all present).
    """
    missing = []
    for var in (required or []):
        if not os.getenv(var):
            missing.append(var)

    for var in (warn_if_missing or []):
        if not os.getenv(var):
            logger.warning("Recommended env var %s is not set", var)

    if missing:
        is_production = os.getenv("ENVIRONMENT", "").lower() == "production"
        if is_production:
            logger.critical(
                "Missing required env vars in production: %s", missing
            )
        else:
            logger.warning("Missing env vars (non-production): %s", missing)

    return missing
