"""Centralized JWT configuration shared across all services."""

import logging
import os
import sys
import uuid

logger = logging.getLogger(__name__)

JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# Key ID for JWT header (supports key rotation)
JWT_KEY_ID: str = os.getenv("JWT_KEY_ID", "default")

# Previous secret key for rotation — tokens signed with this key are still valid
JWT_PREVIOUS_SECRET_KEY: str | None = os.getenv("JWT_PREVIOUS_SECRET_KEY")

if not JWT_SECRET_KEY:
    JWT_SECRET_KEY = "dev-secret-change-in-production"
    if os.getenv("TESTING") != "1":
        print(
            "WARNING: JWT_SECRET_KEY not set, using insecure default. "
            "Set JWT_SECRET_KEY in production.",
            file=sys.stderr,
        )

if os.getenv("ENVIRONMENT") == "production":
    if JWT_SECRET_KEY == "dev-secret-change-in-production":
        logger.critical("JWT_SECRET_KEY must be set to a strong secret in production!")
        sys.exit(1)
    if len(JWT_SECRET_KEY) < 32:
        logger.critical("JWT_SECRET_KEY must be at least 32 characters in production!")
        sys.exit(1)


def generate_jti() -> str:
    """Generate a unique JWT ID (jti) claim for token revocation support."""
    return str(uuid.uuid4())


def get_signing_keys() -> list[tuple[str, str]]:
    """Return list of (key_id, secret) pairs for validation.

    The current key is tried first, then the previous key (for rotation).
    """
    keys = [(JWT_KEY_ID, JWT_SECRET_KEY)]
    if JWT_PREVIOUS_SECRET_KEY:
        keys.append(("previous", JWT_PREVIOUS_SECRET_KEY))
    return keys
