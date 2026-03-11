"""Centralized CORS configuration for all services."""

import logging
import os

logger = logging.getLogger(__name__)


def get_cors_origins() -> list[str]:
    """Return the list of allowed CORS origins from environment variable.

    Set CORS_ALLOWED_ORIGINS as a comma-separated list of origins, e.g.:
        CORS_ALLOWED_ORIGINS=https://app.khushfus.com,http://localhost:3000

    Security: Rejects wildcard (*) origins in production. Only http/https origins allowed.
    """
    env = os.getenv("ENVIRONMENT", "development")
    origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
    parsed = [o.strip() for o in origins.split(",") if o.strip()]

    # Reject wildcard in production
    if "*" in parsed and env == "production":
        logger.error("CORS wildcard (*) is not allowed in production. Falling back to empty list.")
        return []

    # Validate origin format
    validated = []
    for origin in parsed:
        if origin == "*":
            if env != "production":
                validated.append(origin)
            continue
        if not origin.startswith(("http://", "https://")):
            logger.warning("Skipping invalid CORS origin (must start with http:// or https://): %s", origin)
            continue
        validated.append(origin)

    return validated
