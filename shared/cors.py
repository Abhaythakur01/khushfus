"""Centralized CORS configuration for all services."""

import os


def get_cors_origins() -> list[str]:
    """Return the list of allowed CORS origins from environment variable.

    Set CORS_ALLOWED_ORIGINS as a comma-separated list of origins, e.g.:
        CORS_ALLOWED_ORIGINS=https://app.khushfus.com,http://localhost:3000
    """
    origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
    return [o.strip() for o in origins.split(",") if o.strip()]
