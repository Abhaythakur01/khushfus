"""Centralized JWT configuration shared across all services."""

import os
import sys

JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

if not JWT_SECRET_KEY:
    JWT_SECRET_KEY = "dev-secret-change-in-production"
    if os.getenv("TESTING") != "1":
        print(
            "WARNING: JWT_SECRET_KEY not set, using insecure default. "
            "Set JWT_SECRET_KEY in production.",
            file=sys.stderr,
        )
