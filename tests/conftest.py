"""Shared test fixtures for KhushFus test suite."""

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from shared.events import EventBus
from shared.models import Base

# Use test database
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "sqlite+aiosqlite:///test.db",  # SQLite for unit tests, Postgres for integration
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    """Create test database engine."""
    eng = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    """Create a fresh database session for each test.

    Uses a nested transaction (savepoint) so that fixture commits
    don't persist between tests — the outer transaction is always
    rolled back, giving each test a clean slate.
    """
    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)

        # Start a SAVEPOINT; session.commit() will release the savepoint
        # but the outer transaction keeps everything isolated.
        await conn.begin_nested()

        @event.listens_for(session.sync_session, "after_transaction_end")
        def restart_savepoint(sess, transaction):
            if transaction.nested and not transaction._parent.nested:
                sess.begin_nested()

        yield session

        await session.close()
        await trans.rollback()


@pytest_asyncio.fixture
async def sample_org(db_session):
    """Create a sample organization."""
    from shared.models import Organization

    org = Organization(name="Test Corp", slug="test-corp", plan="professional")
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)
    return org


@pytest_asyncio.fixture
async def sample_user(db_session):
    """Create a sample user."""
    from shared.models import User

    user = User(email="test@example.com", full_name="Test User", hashed_password="hashed_fake")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def sample_project(db_session, sample_org):
    """Create a sample project with keywords."""
    from shared.models import Keyword, Project

    project = Project(
        organization_id=sample_org.id,
        name="Test Project",
        client_name="Test Client",
        platforms="twitter,facebook,instagram",
    )
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    kw1 = Keyword(project_id=project.id, term="test brand", keyword_type="brand")
    kw2 = Keyword(project_id=project.id, term="competitor", keyword_type="competitor")
    db_session.add_all([kw1, kw2])
    await db_session.commit()
    return project


@pytest_asyncio.fixture
async def sample_mentions(db_session, sample_project):
    """Create sample mentions for testing."""
    from datetime import datetime, timedelta

    from shared.models import Mention

    mentions = []
    sentiments = ["positive", "negative", "neutral"]
    platforms = ["twitter", "facebook", "instagram"]
    for i in range(20):
        m = Mention(
            project_id=sample_project.id,
            platform=platforms[i % 3],
            source_id=f"src_{i}",
            text=(f"Sample mention {i} about test brand {'great' if i % 3 == 0 else 'bad' if i % 3 == 1 else 'okay'}"),
            author_name=f"Author {i}",
            author_handle=f"@author{i}",
            author_followers=100 * (i + 1),
            likes=i * 10,
            shares=i * 5,
            comments=i * 2,
            reach=i * 1000,
            sentiment=sentiments[i % 3],
            sentiment_score=0.8 if i % 3 == 0 else -0.6 if i % 3 == 1 else 0.1,
            language="en",
            matched_keywords="test brand",
            published_at=datetime.utcnow() - timedelta(hours=i),
        )
        mentions.append(m)
    db_session.add_all(mentions)
    await db_session.commit()
    return mentions


# ---------------------------------------------------------------------------
# Mock EventBus fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_event_bus():
    """A fully mocked EventBus that records published events.

    Usage:
        def test_something(mock_event_bus):
            bus = mock_event_bus
            await bus.publish("stream", some_event)
            assert bus.published_events["stream"][0] == some_event
    """
    bus = MagicMock(spec=EventBus)
    bus.redis_url = "redis://mock:6379/0"
    bus._redis = None
    bus.published_events = {}  # stream -> list of events

    async def _mock_publish(stream, event):
        bus.published_events.setdefault(stream, []).append(event)
        return f"mock-{len(bus.published_events[stream])}-0"

    async def _mock_publish_batch(stream, events):
        ids = []
        for ev in events:
            msg_id = await _mock_publish(stream, ev)
            ids.append(msg_id)
        return ids

    bus.connect = AsyncMock()
    bus.close = AsyncMock()
    bus.publish = AsyncMock(side_effect=_mock_publish)
    bus.publish_batch = AsyncMock(side_effect=_mock_publish_batch)
    bus.publish_raw = AsyncMock(return_value="mock-raw-0")
    bus.ensure_group = AsyncMock()
    bus.consume = AsyncMock(return_value=[])
    bus.ack = AsyncMock()
    return bus


# ---------------------------------------------------------------------------
# Mock Redis fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_redis():
    """A mock Redis client with commonly used async methods.

    Provides mocked versions of xadd, xreadgroup, xack, xgroup_create,
    get, set, delete, pipeline, and other common operations.
    """
    redis = AsyncMock()
    redis.xadd = AsyncMock(return_value="1-0")
    redis.xreadgroup = AsyncMock(return_value=[])
    redis.xack = AsyncMock(return_value=1)
    redis.xgroup_create = AsyncMock()
    redis.xrange = AsyncMock(return_value=[])
    redis.xdel = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=1)
    redis.exists = AsyncMock(return_value=0)
    redis.expire = AsyncMock(return_value=True)
    redis.incr = AsyncMock(return_value=1)

    # Pipeline support
    mock_pipeline = MagicMock()
    mock_pipeline.xadd = MagicMock()
    mock_pipeline.execute = AsyncMock(return_value=[])
    redis.pipeline = MagicMock(return_value=mock_pipeline)

    redis.aclose = AsyncMock()
    return redis


# ---------------------------------------------------------------------------
# Mock Elasticsearch / OpenSearch fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_elasticsearch():
    """A mock AsyncOpenSearch client with commonly used methods.

    Mocks index, search, delete, bulk, and indices operations.
    """
    es = AsyncMock()

    # Document operations
    es.index = AsyncMock(return_value={"result": "created", "_id": "1"})
    es.get = AsyncMock(return_value={"_source": {}, "_id": "1", "found": True})
    es.delete = AsyncMock(return_value={"result": "deleted"})
    es.bulk = AsyncMock(return_value={"errors": False, "items": []})
    es.search = AsyncMock(return_value={
        "hits": {
            "total": {"value": 0, "relation": "eq"},
            "hits": [],
        },
    })
    es.count = AsyncMock(return_value={"count": 0})

    # Index management
    es.indices = AsyncMock()
    es.indices.exists = AsyncMock(return_value=True)
    es.indices.create = AsyncMock(return_value={"acknowledged": True})
    es.indices.delete = AsyncMock(return_value={"acknowledged": True})
    es.indices.refresh = AsyncMock()

    es.close = AsyncMock()
    return es
