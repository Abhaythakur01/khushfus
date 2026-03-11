"""Shared database connection factory for all services."""

import logging
import os
import time

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from shared.models import Base

logger = logging.getLogger(__name__)


def create_db(database_url: str, echo: bool = False):
    kwargs: dict = {"echo": echo}
    # SQLite doesn't support connection pool options or SSL
    if "sqlite" not in database_url:
        kwargs.update(
            pool_size=int(os.getenv("DB_POOL_SIZE", "20")),
            max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
            pool_recycle=300,
            pool_pre_ping=True,
            pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "30")),
        )
        # TLS/SSL configuration for asyncpg connections
        ssl_mode = os.getenv("DATABASE_SSL_MODE")
        if ssl_mode:
            import ssl as _ssl

            if ssl_mode == "require":
                ssl_ctx = _ssl.create_default_context()
                ssl_ctx.check_hostname = False
                ssl_ctx.verify_mode = _ssl.CERT_NONE
            elif ssl_mode == "verify-ca":
                ssl_ctx = _ssl.create_default_context(cafile=os.getenv("DATABASE_SSL_CA_FILE"))
            elif ssl_mode == "verify-full":
                ssl_ctx = _ssl.create_default_context(cafile=os.getenv("DATABASE_SSL_CA_FILE"))
                ssl_ctx.check_hostname = True
            else:
                ssl_ctx = True  # Basic SSL with default verification
            kwargs["connect_args"] = {"ssl": ssl_ctx}
            logger.info("Database SSL mode: %s", ssl_mode)
    engine = create_async_engine(database_url, **kwargs)

    # Slow query logging
    slow_query_threshold = float(os.getenv("DB_SLOW_QUERY_THRESHOLD_MS", "500"))

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        conn.info["query_start_time"] = time.monotonic()

    @event.listens_for(engine.sync_engine, "after_cursor_execute")
    def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        start = conn.info.pop("query_start_time", None)
        if start is not None:
            elapsed_ms = (time.monotonic() - start) * 1000
            if elapsed_ms > slow_query_threshold:
                logger.warning("Slow query (%.1fms): %s", elapsed_ms, statement[:200])

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, session_factory


def create_read_replica_db(replica_url: str | None = None, echo: bool = False):
    """Create a read-only engine for read replicas.

    Returns None if no replica URL is configured.
    """
    url = replica_url or os.getenv("DATABASE_READ_REPLICA_URL")
    if not url:
        return None
    kwargs: dict = {"echo": echo}
    if "sqlite" not in url:
        kwargs.update(
            pool_size=int(os.getenv("DB_REPLICA_POOL_SIZE", "10")),
            max_overflow=int(os.getenv("DB_REPLICA_MAX_OVERFLOW", "5")),
            pool_recycle=300,
            pool_pre_ping=True,
        )
    engine = create_async_engine(url, **kwargs)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    logger.info("Read replica configured: %s", url.split("@")[-1] if "@" in url else url)
    return engine, session_factory


async def init_tables(engine):
    """Create all tables. Use Alembic in production instead."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db(session_factory: async_sessionmaker) -> AsyncSession:
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def check_migration_version(engine) -> str | None:
    """Query the ``alembic_version`` table and log the current migration head.

    Returns the version string if found, or ``None`` on any error.
    This is intentionally non-fatal -- a missing table or old version only
    produces a warning so that services can still start.
    """
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
            row = result.first()
            if row:
                version = row[0]
                logger.info("Database migration version: %s", version)
                return version
            else:
                logger.warning("alembic_version table exists but is empty -- no migration head recorded")
                return None
    except Exception as exc:
        logger.warning("Could not check migration version (table may not exist): %s", exc)
        return None


async def set_tenant_context(session: AsyncSession, org_id: int):
    """Set the current tenant for RLS policies.

    Uses set_config() with parameterized query to prevent SQL injection.
    The 'true' argument scopes it to the current transaction (like SET LOCAL).
    Silently skips on SQLite (no RLS support).
    """
    safe_id = int(org_id)  # Raises ValueError/TypeError if not numeric
    dialect = session.bind.dialect.name if session.bind else ""
    if dialect == "sqlite":
        logger.debug("RLS not supported on SQLite — skipping set_tenant_context(org_id=%s)", safe_id)
        return
    await session.execute(
        text("SELECT set_config('app.current_org_id', :val, true)"),
        {"val": str(safe_id)},
    )
