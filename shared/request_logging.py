"""Request logging middleware with correlation IDs and sensitive field masking.

Usage:
    from shared.request_logging import RequestLoggingMiddleware

    app.add_middleware(RequestLoggingMiddleware, service_name="publishing")
"""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Fields to mask in logged headers
SENSITIVE_HEADERS = frozenset({
    "authorization", "cookie", "x-api-key", "x-webhook-signature",
})

# Fields to mask in logged query params
SENSITIVE_PARAMS = frozenset({
    "token", "api_key", "password", "secret",
})


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log requests with correlation IDs and mask sensitive fields."""

    def __init__(self, app, service_name: str = "khushfus"):
        super().__init__(app)
        self.service_name = service_name

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get(
            "x-request-id", str(uuid.uuid4())[:8]
        )
        start = time.monotonic()

        # Mask sensitive query params
        masked_params = {
            k: "***" if k.lower() in SENSITIVE_PARAMS else v
            for k, v in request.query_params.items()
        }

        logger.info(
            "request_start service=%s method=%s path=%s request_id=%s params=%s",
            self.service_name,
            request.method,
            request.url.path,
            request_id,
            masked_params or "",
        )

        response = await call_next(request)

        duration_ms = (time.monotonic() - start) * 1000
        logger.info(
            "request_end service=%s method=%s path=%s status=%d "
            "duration_ms=%.1f request_id=%s",
            self.service_name,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )

        response.headers["X-Request-ID"] = request_id
        return response
