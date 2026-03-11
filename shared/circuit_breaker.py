"""Async circuit breaker for inter-service HTTP calls."""

import asyncio
import logging
import os
import time
from enum import Enum

logger = logging.getLogger(__name__)

# Defaults overridable via env vars
DEFAULT_FAILURE_THRESHOLD = int(os.getenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5"))
DEFAULT_RECOVERY_TIMEOUT = float(os.getenv("CIRCUIT_BREAKER_RECOVERY_TIMEOUT", "30.0"))


class CircuitState(Enum):
    CLOSED = "closed"       # Normal operation
    OPEN = "open"           # Failing, reject calls
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreakerError(Exception):
    """Raised when circuit is open."""


class CircuitBreaker:
    """Async circuit breaker pattern for resilient inter-service calls.

    Usage:
        breaker = CircuitBreaker("identity-service", failure_threshold=5, recovery_timeout=30)
        result = await breaker.call(httpx_client.get, "http://identity:8010/health")
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = DEFAULT_FAILURE_THRESHOLD,
        recovery_timeout: float = DEFAULT_RECOVERY_TIMEOUT,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: float = 0
        self._lock = asyncio.Lock()

    async def call(self, func, *args, **kwargs):
        """Execute a function through the circuit breaker.

        Args:
            func: An async callable to execute.
            *args: Positional arguments for the callable.
            **kwargs: Keyword arguments for the callable.

        Returns:
            The result of the callable.

        Raises:
            CircuitBreakerError: If the circuit is open.
        """
        async with self._lock:
            if self.state == CircuitState.OPEN:
                if time.monotonic() - self.last_failure_time >= self.recovery_timeout:
                    self.state = CircuitState.HALF_OPEN
                    logger.info(f"Circuit {self.name}: OPEN -> HALF_OPEN")
                else:
                    raise CircuitBreakerError(f"Circuit {self.name} is OPEN")

        try:
            result = await func(*args, **kwargs)
            async with self._lock:
                if self.state == CircuitState.HALF_OPEN:
                    self.state = CircuitState.CLOSED
                    self.failure_count = 0
                    logger.info(f"Circuit {self.name}: HALF_OPEN -> CLOSED")
                elif self.state == CircuitState.CLOSED:
                    self.failure_count = 0
            return result
        except Exception:
            async with self._lock:
                self.failure_count += 1
                self.last_failure_time = time.monotonic()
                if self.failure_count >= self.failure_threshold:
                    self.state = CircuitState.OPEN
                    logger.warning(f"Circuit {self.name}: -> OPEN after {self.failure_count} failures")
            raise

    @property
    def is_open(self) -> bool:
        """Check if the circuit breaker is currently in the OPEN state."""
        return self.state == CircuitState.OPEN
