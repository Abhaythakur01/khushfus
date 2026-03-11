"""
Middleware to enforce request body size limits.

Usage::

    from shared.request_size_limit import RequestSizeLimitMiddleware

    app.add_middleware(RequestSizeLimitMiddleware)

The default max body size is 10 MB, configurable via the ``MAX_REQUEST_BODY_SIZE``
environment variable (value in bytes).
"""

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024  # 10 MB

MAX_REQUEST_BODY_SIZE = int(os.getenv("MAX_REQUEST_BODY_SIZE", str(DEFAULT_MAX_BODY_SIZE)))


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose Content-Length exceeds a configurable maximum."""

    def __init__(self, app, max_body_size: int = MAX_REQUEST_BODY_SIZE):
        super().__init__(app)
        self.max_body_size = max_body_size

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                length = int(content_length)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid Content-Length header"},
                )
            if length > self.max_body_size:
                return JSONResponse(
                    status_code=413,
                    content={
                        "detail": f"Request body too large. Maximum allowed size is {self.max_body_size} bytes."
                    },
                )
        return await call_next(request)
