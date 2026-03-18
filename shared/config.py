"""
Centralized configuration validation using Pydantic Settings.

Validates ALL required environment variables on startup with helpful error
messages, sensible development defaults, and strict production enforcement.

Usage:
    from shared.config import get_settings

    settings = get_settings()
    engine = create_db(settings.database.url)

The module is additive — existing os.environ.get() calls continue to work.
This provides an opt-in validated alternative that catches misconfigurations
at startup instead of at runtime.
"""

from __future__ import annotations

import logging
import os
import sys
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel, Field, model_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Sub-settings groups
# ---------------------------------------------------------------------------


class DatabaseSettings(BaseModel):
    """PostgreSQL / SQLite database configuration."""

    url: str = Field(
        default="postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus",
        description="Primary database URL (postgres or sqlite for local dev)",
    )
    read_replica_url: str | None = Field(
        default=None,
        description="Read replica URL for scaling reads",
    )
    pool_size: int = Field(default=20, ge=1, le=100, description="Connection pool size")
    max_overflow: int = Field(default=10, ge=0, le=50, description="Max overflow connections")
    pool_timeout: int = Field(default=30, ge=5, le=120, description="Pool checkout timeout (seconds)")
    ssl_mode: str | None = Field(
        default=None,
        description="SSL mode: require, verify-ca, verify-full",
    )
    ssl_ca_file: str | None = Field(
        default=None,
        description="Path to CA certificate file for SSL verify-ca / verify-full",
    )
    slow_query_threshold_ms: float = Field(
        default=500.0,
        ge=0,
        description="Log queries slower than this (milliseconds)",
    )
    replica_pool_size: int = Field(default=10, ge=1, le=100)
    replica_max_overflow: int = Field(default=5, ge=0, le=50)

    @model_validator(mode="after")
    def _validate_ssl(self) -> "DatabaseSettings":
        if self.ssl_mode in ("verify-ca", "verify-full") and not self.ssl_ca_file:
            raise ValueError(
                f"DATABASE_SSL_CA_FILE is required when DATABASE_SSL_MODE={self.ssl_mode}"
            )
        return self


class RedisSettings(BaseModel):
    """Redis connection configuration for the event bus."""

    url: str = Field(
        default="redis://redis:6379/0",
        description="Redis URL for the event bus",
    )
    max_reconnect_attempts: int = Field(default=5, ge=1, le=30)
    reconnect_delay: float = Field(default=1.0, ge=0.1, le=30.0)
    connect_timeout: float = Field(default=5.0, ge=1.0, le=60.0)


class JWTSettings(BaseModel):
    """JWT authentication configuration."""

    secret_key: str = Field(
        default="dev-secret-change-in-production",
        description="JWT signing secret (min 32 chars in production)",
    )
    algorithm: str = Field(default="HS256")
    access_token_expire_minutes: int = Field(default=60, ge=1, le=1440)
    refresh_token_expire_days: int = Field(default=7, ge=1, le=90)
    key_id: str = Field(default="default", description="Key ID for JWT header (rotation)")
    previous_secret_key: str | None = Field(
        default=None,
        description="Previous secret key for rotation — tokens signed with it are still valid",
    )


class CORSSettings(BaseModel):
    """CORS configuration."""

    allowed_origins: str = Field(
        default="http://localhost:3000,http://localhost:3001",
        description="Comma-separated list of allowed CORS origins",
    )

    def get_origins_list(self) -> list[str]:
        """Parse the comma-separated origins string into a validated list."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


class AppSettings(BaseModel):
    """General application settings."""

    environment: Literal["development", "staging", "production", "testing"] = Field(
        default="development",
        description="Runtime environment",
    )
    log_level: str = Field(default="INFO", description="Logging level")
    log_format: str = Field(default="json", description="Log format: json or text")
    max_request_body_size: int = Field(
        default=10 * 1024 * 1024,
        ge=1024,
        description="Max request body size in bytes (default 10 MB)",
    )
    internal_service_token: str = Field(
        default="",
        description="Shared token for inter-service authentication",
    )
    webhook_signing_secret: str = Field(
        default="",
        description="Secret for signing outbound webhook payloads",
    )
    otel_exporter_endpoint: str | None = Field(
        default=None,
        description="OpenTelemetry OTLP exporter endpoint (e.g. http://jaeger:4317)",
    )
    circuit_breaker_failure_threshold: int = Field(default=5, ge=1, le=50)
    circuit_breaker_recovery_timeout: float = Field(default=30.0, ge=1.0, le=300.0)


# ---------------------------------------------------------------------------
# Root settings
# ---------------------------------------------------------------------------


class KhushFusSettings(BaseSettings):
    """Root configuration that aggregates all sub-settings.

    Environment variables are mapped as follows (case-insensitive):
        DATABASE_URL          -> database.url
        DATABASE_READ_REPLICA_URL -> database.read_replica_url
        DB_POOL_SIZE          -> database.pool_size
        DB_MAX_OVERFLOW       -> database.max_overflow
        DB_POOL_TIMEOUT       -> database.pool_timeout
        DATABASE_SSL_MODE     -> database.ssl_mode
        DATABASE_SSL_CA_FILE  -> database.ssl_ca_file
        DB_SLOW_QUERY_THRESHOLD_MS -> database.slow_query_threshold_ms
        DB_REPLICA_POOL_SIZE  -> database.replica_pool_size
        DB_REPLICA_MAX_OVERFLOW -> database.replica_max_overflow
        REDIS_URL             -> redis.url
        JWT_SECRET_KEY        -> jwt.secret_key
        JWT_ALGORITHM         -> jwt.algorithm
        ACCESS_TOKEN_EXPIRE_MINUTES -> jwt.access_token_expire_minutes
        REFRESH_TOKEN_EXPIRE_DAYS   -> jwt.refresh_token_expire_days
        JWT_KEY_ID            -> jwt.key_id
        JWT_PREVIOUS_SECRET_KEY     -> jwt.previous_secret_key
        CORS_ALLOWED_ORIGINS  -> cors.allowed_origins
        ENVIRONMENT           -> app.environment
        LOG_LEVEL             -> app.log_level
        LOG_FORMAT            -> app.log_format
        MAX_REQUEST_BODY_SIZE -> app.max_request_body_size
        INTERNAL_SERVICE_TOKEN      -> app.internal_service_token
        WEBHOOK_SIGNING_SECRET      -> app.webhook_signing_secret
        OTEL_EXPORTER_OTLP_ENDPOINT -> app.otel_exporter_endpoint
        CIRCUIT_BREAKER_FAILURE_THRESHOLD -> app.circuit_breaker_failure_threshold
        CIRCUIT_BREAKER_RECOVERY_TIMEOUT  -> app.circuit_breaker_recovery_timeout
    """

    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    redis: RedisSettings = Field(default_factory=RedisSettings)
    jwt: JWTSettings = Field(default_factory=JWTSettings)
    cors: CORSSettings = Field(default_factory=CORSSettings)
    app: AppSettings = Field(default_factory=AppSettings)

    model_config = {
        "env_prefix": "",
        "case_sensitive": False,
        "extra": "ignore",
    }

    def __init__(self, **kwargs):
        """Build sub-settings from flat environment variables for backwards compat.

        Pydantic Settings v2 does not natively map flat env vars into nested
        models, so we do a manual pass: read os.environ, map known env var
        names into the nested structure, then let pydantic validate.
        """
        # Build nested dicts from flat env vars
        env_mapping = self._build_from_env()
        # Merge explicit kwargs on top (for testing overrides)
        merged = _deep_merge(env_mapping, kwargs)
        super().__init__(**merged)

    @staticmethod
    def _build_from_env() -> dict:
        """Map flat environment variables to the nested settings structure."""
        get = os.environ.get

        db: dict = {}
        if v := get("DATABASE_URL"):
            db["url"] = v
        if v := get("DATABASE_READ_REPLICA_URL"):
            db["read_replica_url"] = v
        if v := get("DB_POOL_SIZE"):
            db["pool_size"] = int(v)
        if v := get("DB_MAX_OVERFLOW"):
            db["max_overflow"] = int(v)
        if v := get("DB_POOL_TIMEOUT"):
            db["pool_timeout"] = int(v)
        if v := get("DATABASE_SSL_MODE"):
            db["ssl_mode"] = v
        if v := get("DATABASE_SSL_CA_FILE"):
            db["ssl_ca_file"] = v
        if v := get("DB_SLOW_QUERY_THRESHOLD_MS"):
            db["slow_query_threshold_ms"] = float(v)
        if v := get("DB_REPLICA_POOL_SIZE"):
            db["replica_pool_size"] = int(v)
        if v := get("DB_REPLICA_MAX_OVERFLOW"):
            db["replica_max_overflow"] = int(v)

        redis: dict = {}
        if v := get("REDIS_URL"):
            redis["url"] = v

        jwt: dict = {}
        if v := get("JWT_SECRET_KEY"):
            jwt["secret_key"] = v
        if v := get("JWT_ALGORITHM"):
            jwt["algorithm"] = v
        if v := get("ACCESS_TOKEN_EXPIRE_MINUTES"):
            jwt["access_token_expire_minutes"] = int(v)
        if v := get("REFRESH_TOKEN_EXPIRE_DAYS"):
            jwt["refresh_token_expire_days"] = int(v)
        if v := get("JWT_KEY_ID"):
            jwt["key_id"] = v
        if v := get("JWT_PREVIOUS_SECRET_KEY"):
            jwt["previous_secret_key"] = v

        cors: dict = {}
        if v := get("CORS_ALLOWED_ORIGINS"):
            cors["allowed_origins"] = v

        app_cfg: dict = {}
        if v := get("ENVIRONMENT"):
            app_cfg["environment"] = v
        if v := get("LOG_LEVEL"):
            app_cfg["log_level"] = v
        if v := get("LOG_FORMAT"):
            app_cfg["log_format"] = v
        if v := get("MAX_REQUEST_BODY_SIZE"):
            app_cfg["max_request_body_size"] = int(v)
        if v := get("INTERNAL_SERVICE_TOKEN"):
            app_cfg["internal_service_token"] = v
        if v := get("WEBHOOK_SIGNING_SECRET"):
            app_cfg["webhook_signing_secret"] = v
        if v := get("OTEL_EXPORTER_OTLP_ENDPOINT"):
            app_cfg["otel_exporter_endpoint"] = v
        if v := get("CIRCUIT_BREAKER_FAILURE_THRESHOLD"):
            app_cfg["circuit_breaker_failure_threshold"] = int(v)
        if v := get("CIRCUIT_BREAKER_RECOVERY_TIMEOUT"):
            app_cfg["circuit_breaker_recovery_timeout"] = float(v)

        result: dict = {}
        if db:
            result["database"] = db
        if redis:
            result["redis"] = redis
        if jwt:
            result["jwt"] = jwt
        if cors:
            result["cors"] = cors
        if app_cfg:
            result["app"] = app_cfg
        return result

    # --- Production Validation ---

    def validate_production(self) -> list[str]:
        """Enforce strict rules for production deployments.

        Returns a list of error messages. If the list is non-empty, the
        service MUST NOT start.
        """
        errors: list[str] = []

        if self.app.environment != "production":
            return errors

        # JWT secret must be strong
        if self.jwt.secret_key == "dev-secret-change-in-production":
            errors.append(
                "JWT_SECRET_KEY must be set to a strong, unique secret in production "
                "(not the default dev value)"
            )
        elif len(self.jwt.secret_key) < 32:
            errors.append(
                f"JWT_SECRET_KEY must be at least 32 characters in production "
                f"(currently {len(self.jwt.secret_key)})"
            )

        # Database must be PostgreSQL
        if "sqlite" in self.database.url:
            errors.append(
                "SQLite is not supported in production — set DATABASE_URL to a PostgreSQL URL"
            )

        # CORS must not be wildcard
        origins = self.cors.get_origins_list()
        if "*" in origins:
            errors.append(
                "CORS wildcard (*) is not allowed in production — "
                "set CORS_ALLOWED_ORIGINS to specific origins"
            )

        # Internal service token should be set
        if not self.app.internal_service_token:
            errors.append(
                "INTERNAL_SERVICE_TOKEN must be set in production for inter-service auth"
            )

        # Webhook signing secret should be set
        if not self.app.webhook_signing_secret:
            errors.append(
                "WEBHOOK_SIGNING_SECRET should be set in production for webhook integrity"
            )

        # Redis should not be the default docker-compose URL
        if self.redis.url == "redis://redis:6379/0":
            logger.warning(
                "REDIS_URL is still the default docker-compose value — "
                "ensure this is intentional for your production setup"
            )

        return errors

    def validate_or_exit(self) -> None:
        """Run production validation and exit with helpful messages if it fails."""
        errors = self.validate_production()
        if errors:
            print(
                "\n=== CONFIGURATION ERROR ===\n"
                "The following environment variables must be fixed before starting "
                f"in {self.app.environment} mode:\n",
                file=sys.stderr,
            )
            for i, err in enumerate(errors, 1):
                print(f"  {i}. {err}", file=sys.stderr)
            print(
                "\nSee shared/config.py for the full list of configuration options.\n",
                file=sys.stderr,
            )
            sys.exit(1)

        logger.info(
            "Configuration validated: environment=%s database=%s redis=%s",
            self.app.environment,
            _mask_url(self.database.url),
            _mask_url(self.redis.url),
        )

    def summary(self) -> dict:
        """Return a safe-to-log summary of the current configuration."""
        return {
            "environment": self.app.environment,
            "database_url": _mask_url(self.database.url),
            "database_pool_size": self.database.pool_size,
            "database_ssl_mode": self.database.ssl_mode,
            "redis_url": _mask_url(self.redis.url),
            "jwt_algorithm": self.jwt.algorithm,
            "jwt_key_id": self.jwt.key_id,
            "access_token_expire_minutes": self.jwt.access_token_expire_minutes,
            "cors_origins": self.cors.get_origins_list(),
            "log_level": self.app.log_level,
            "log_format": self.app.log_format,
            "max_request_body_size": self.app.max_request_body_size,
            "otel_endpoint": self.app.otel_exporter_endpoint,
        }


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_settings(**kwargs) -> KhushFusSettings:
    """Return the cached settings singleton.

    Call once at startup; subsequent calls return the same instance.
    Pass keyword overrides only in tests.
    """
    return KhushFusSettings(**kwargs)


def reset_settings() -> None:
    """Clear the cached settings (useful in tests)."""
    get_settings.cache_clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mask_url(url: str) -> str:
    """Mask credentials in a database/redis URL for safe logging."""
    if "@" in url:
        scheme_and_creds, rest = url.rsplit("@", 1)
        scheme = scheme_and_creds.split("://")[0] if "://" in scheme_and_creds else ""
        return f"{scheme}://***@{rest}"
    return url


def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override into base, returning a new dict."""
    result = dict(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result
