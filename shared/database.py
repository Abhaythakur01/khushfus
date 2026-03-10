"""Shared database connection factory for all services."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from shared.models import Base


def create_db(database_url: str, echo: bool = False):
    engine = create_async_engine(
        database_url,
        echo=echo,
        pool_size=20,
        max_overflow=10,
        pool_recycle=300,
        pool_pre_ping=True,
    )
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
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


async def set_tenant_context(session: AsyncSession, org_id: int):
    """Set the current tenant for RLS policies.

    Uses set_config() with parameterized query to prevent SQL injection.
    The 'true' argument scopes it to the current transaction (like SET LOCAL).
    """
    safe_id = int(org_id)  # Raises ValueError/TypeError if not numeric
    await session.execute(
        text("SELECT set_config('app.current_org_id', :val, true)"),
        {"val": str(safe_id)},
    )
