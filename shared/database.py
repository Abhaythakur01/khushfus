"""Shared database connection factory for all services."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from shared.models import Base


def create_db(database_url: str, echo: bool = False):
    engine = create_async_engine(database_url, echo=echo)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, session_factory


async def init_tables(engine):
    """Create all tables. Use Alembic in production instead."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db(session_factory: async_sessionmaker) -> AsyncSession:
    async with session_factory() as session:
        yield session


async def set_tenant_context(session: AsyncSession, org_id: int):
    """Set the current tenant for RLS policies.

    Uses SET LOCAL so the setting is scoped to the current transaction
    and automatically reset when the transaction ends.
    """
    await session.execute(text(f"SET LOCAL app.current_org_id = '{org_id}'"))
