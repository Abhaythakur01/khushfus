"""Integration tests for Gateway API.

These tests create a standalone FastAPI test app that reuses the gateway's
routers but swaps the database dependency for an in-memory SQLite session.
This avoids needing Postgres/Redis while still exercising the real route logic.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from shared.models import Base, Keyword, Mention, Organization, Platform, Project, Sentiment

# ---------------------------------------------------------------------------
# Test-local engine and session factory (in-memory SQLite)
# ---------------------------------------------------------------------------

_test_engine = None
_TestSessionLocal = None


async def _get_test_engine():
    global _test_engine, _TestSessionLocal
    if _test_engine is None:
        _test_engine = create_async_engine("sqlite+aiosqlite://", echo=False)
        async with _test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _TestSessionLocal = sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)
    return _test_engine, _TestSessionLocal


async def _dispose_test_engine():
    global _test_engine, _TestSessionLocal
    if _test_engine:
        await _test_engine.dispose()
        _test_engine = None
        _TestSessionLocal = None


# ---------------------------------------------------------------------------
# Build a test-specific FastAPI app that mirrors the gateway but uses SQLite
# ---------------------------------------------------------------------------

def _build_test_app():
    """Build a minimal FastAPI app with gateway routes but test-friendly deps."""
    from fastapi import FastAPI

    from services.gateway.app.routes import auth, mentions, projects

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine, sf = await _get_test_engine()
        app.state.db_session = sf
        # Provide a mock event bus so routes that use it don't crash
        mock_bus = MagicMock()
        mock_bus.publish = AsyncMock()
        mock_bus.connect = AsyncMock()
        mock_bus.close = AsyncMock()
        app.state.event_bus = mock_bus
        yield
        await _dispose_test_engine()

    app = FastAPI(lifespan=lifespan)
    app.include_router(auth.router, prefix="/api/v1/auth")
    app.include_router(projects.router, prefix="/api/v1/projects")
    app.include_router(mentions.router, prefix="/api/v1/mentions")

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "gateway"}

    return app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="module")
async def test_app():
    """Create the test app once per module."""
    try:
        app = _build_test_app()
        yield app
    except ImportError:
        pytest.skip("Gateway dependencies not available")


@pytest_asyncio.fixture
async def client(test_app):
    """Provide an httpx AsyncClient wired to the test app."""
    try:
        from httpx import ASGITransport, AsyncClient
    except ImportError:
        pytest.skip("httpx not available")

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Drop and recreate all tables between tests for isolation."""
    engine, _ = await _get_test_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest_asyncio.fixture
async def auth_headers(client):
    """Register a user and return Authorization headers with a valid JWT."""
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin@test.com",
            "password": "Str0ngP@ss!",
            "full_name": "Admin User",
        },
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@test.com", "password": "Str0ngP@ss!"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seeded_project(client, auth_headers):
    """Create an org and project directly in the DB, return the project id."""
    engine, sf = await _get_test_engine()
    async with sf() as session:
        org = Organization(name="Test Org", slug="test-org", plan="professional")
        session.add(org)
        await session.commit()
        await session.refresh(org)

        project = Project(
            organization_id=org.id,
            name="Integration Project",
            client_name="Test Client",
            platforms="twitter,facebook",
        )
        session.add(project)
        await session.commit()
        await session.refresh(project)

        kw = Keyword(project_id=project.id, term="test brand", keyword_type="brand")
        session.add(kw)
        await session.commit()

        return project.id, org.id


@pytest_asyncio.fixture
async def seeded_mentions(seeded_project):
    """Insert 15 mentions for the seeded project."""
    project_id, org_id = seeded_project
    engine, sf = await _get_test_engine()
    async with sf() as session:
        sentiments = [Sentiment.POSITIVE, Sentiment.NEGATIVE, Sentiment.NEUTRAL]
        platforms = [Platform.TWITTER, Platform.FACEBOOK, Platform.INSTAGRAM]
        for i in range(15):
            m = Mention(
                project_id=project_id,
                platform=platforms[i % 3],
                source_id=f"src_{i}",
                text=f"Test mention number {i} about the brand",
                author_name=f"Author {i}",
                author_handle=f"@author{i}",
                author_followers=100 * (i + 1),
                likes=i * 10,
                shares=i * 5,
                comments=i * 2,
                reach=i * 1000,
                sentiment=sentiments[i % 3],
                sentiment_score=0.8 if i % 3 == 0 else (-0.6 if i % 3 == 1 else 0.1),
                language="en",
                matched_keywords="test brand",
                published_at=datetime.utcnow() - timedelta(hours=i),
            )
            session.add(m)
        await session.commit()
    return project_id


# ===================================================================
# Tests
# ===================================================================


@pytest.mark.integration
class TestHealthEndpoint:
    async def test_health_check(self, client):
        """Test that /health returns ok."""
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "gateway"


@pytest.mark.integration
class TestAuthFlow:
    async def test_register_and_login(self, client):
        """Test full registration and login flow."""
        # Register a new user
        register_resp = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "S3cur3P@ss!",
                "full_name": "New User",
            },
        )
        assert register_resp.status_code == 201
        user_data = register_resp.json()
        assert user_data["email"] == "newuser@example.com"
        assert user_data["full_name"] == "New User"
        assert "id" in user_data

        # Login with the same credentials
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "newuser@example.com", "password": "S3cur3P@ss!"},
        )
        assert login_resp.status_code == 200
        token_data = login_resp.json()
        assert "access_token" in token_data
        assert token_data["token_type"] == "bearer"
        assert len(token_data["access_token"]) > 10  # JWT is a non-trivial string

    async def test_register_duplicate_email(self, client):
        """Test that registering the same email twice returns 400."""
        payload = {
            "email": "dupe@example.com",
            "password": "P@ssw0rd!",
            "full_name": "First User",
        }
        first = await client.post("/api/v1/auth/register", json=payload)
        assert first.status_code == 201

        second = await client.post("/api/v1/auth/register", json=payload)
        assert second.status_code == 400
        assert "already registered" in second.json()["detail"].lower()

    async def test_login_invalid_credentials(self, client):
        """Test login with wrong password returns 401."""
        # Register a user first
        await client.post(
            "/api/v1/auth/register",
            json={
                "email": "valid@example.com",
                "password": "C0rrect!",
                "full_name": "Valid User",
            },
        )

        # Attempt login with wrong password
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "valid@example.com", "password": "wr0ngpassword"},
        )
        assert resp.status_code == 401
        assert "invalid" in resp.json()["detail"].lower()

    async def test_login_nonexistent_user(self, client):
        """Test login with an email that was never registered returns 401."""
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "ghost@example.com", "password": "anything"},
        )
        assert resp.status_code == 401

    async def test_me_endpoint_authenticated(self, client, auth_headers):
        """Test GET /auth/me returns current user profile when authenticated."""
        resp = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "admin@test.com"
        assert data["full_name"] == "Admin User"

    async def test_me_endpoint_unauthenticated(self, client):
        """Test GET /auth/me without a token returns 401."""
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401


@pytest.mark.integration
class TestProjectsCRUD:
    async def test_create_project(self, client):
        """Test creating a new project via POST /api/v1/projects."""
        resp = await client.post(
            "/api/v1/projects",
            json={
                "name": "My New Project",
                "client_name": "Acme Corp",
                "platforms": "twitter,reddit",
                "keywords": [
                    {"term": "acme", "keyword_type": "brand"},
                    {"term": "competitor-x", "keyword_type": "competitor"},
                ],
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "My New Project"
        assert data["client_name"] == "Acme Corp"
        assert data["platforms"] == "twitter,reddit"
        assert data["status"] == "active"
        assert len(data["keywords"]) == 2
        kw_terms = {kw["term"] for kw in data["keywords"]}
        assert "acme" in kw_terms
        assert "competitor-x" in kw_terms

    async def test_list_projects(self, client):
        """Test listing projects returns all created projects."""
        # Create two projects
        for name in ["Project Alpha", "Project Beta"]:
            await client.post(
                "/api/v1/projects",
                json={"name": name, "client_name": "Client", "platforms": "twitter"},
            )

        resp = await client.get("/api/v1/projects")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 2
        names = {p["name"] for p in data}
        assert "Project Alpha" in names
        assert "Project Beta" in names

    async def test_get_project_by_id(self, client):
        """Test retrieving a single project by its ID."""
        create_resp = await client.post(
            "/api/v1/projects",
            json={"name": "Fetch Me", "client_name": "Client", "platforms": "twitter"},
        )
        project_id = create_resp.json()["id"]

        resp = await client.get(f"/api/v1/projects/{project_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Fetch Me"

    async def test_get_project_not_found(self, client):
        """Test fetching a non-existent project returns 404."""
        resp = await client.get("/api/v1/projects/99999")
        assert resp.status_code == 404

    async def test_update_project(self, client):
        """Test updating a project via PATCH."""
        create_resp = await client.post(
            "/api/v1/projects",
            json={"name": "Original Name", "client_name": "Client", "platforms": "twitter"},
        )
        project_id = create_resp.json()["id"]

        patch_resp = await client.patch(
            f"/api/v1/projects/{project_id}",
            json={"name": "Updated Name", "description": "Now with a description"},
        )
        assert patch_resp.status_code == 200
        data = patch_resp.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Now with a description"

    async def test_update_project_status(self, client):
        """Test updating a project's status to paused."""
        create_resp = await client.post(
            "/api/v1/projects",
            json={"name": "Status Test", "client_name": "Client", "platforms": "twitter"},
        )
        project_id = create_resp.json()["id"]
        assert create_resp.json()["status"] == "active"

        patch_resp = await client.patch(
            f"/api/v1/projects/{project_id}",
            json={"status": "paused"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == "paused"

    async def test_delete_project(self, client):
        """Test archiving a project (setting status to 'archived')."""
        create_resp = await client.post(
            "/api/v1/projects",
            json={"name": "To Archive", "client_name": "Client", "platforms": "twitter"},
        )
        project_id = create_resp.json()["id"]

        # Archive the project by setting status
        patch_resp = await client.patch(
            f"/api/v1/projects/{project_id}",
            json={"status": "archived"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == "archived"

        # Confirm it persists
        get_resp = await client.get(f"/api/v1/projects/{project_id}")
        assert get_resp.json()["status"] == "archived"


@pytest.mark.integration
class TestMentionsAPI:
    async def test_list_mentions_with_filters(self, client, seeded_mentions):
        """Test fetching mentions with platform filter."""
        project_id = seeded_mentions

        # Fetch all mentions for the project
        resp = await client.get(
            "/api/v1/mentions/",
            params={"project_id": project_id},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 15
        assert len(data["items"]) == 15
        assert data["page"] == 1

        # Filter by platform=twitter — every 3rd mention (indices 0, 3, 6, 9, 12)
        resp = await client.get(
            "/api/v1/mentions/",
            params={"project_id": project_id, "platform": "twitter"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        for item in data["items"]:
            assert item["platform"] == "twitter"

    async def test_list_mentions_sentiment_filter(self, client, seeded_mentions):
        """Test fetching mentions filtered by sentiment."""
        project_id = seeded_mentions

        resp = await client.get(
            "/api/v1/mentions/",
            params={"project_id": project_id, "sentiment": "positive"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5  # indices 0, 3, 6, 9, 12
        for item in data["items"]:
            assert item["sentiment"] == "positive"

    async def test_mention_pagination(self, client, seeded_mentions):
        """Test mention list pagination with page and page_size params."""
        project_id = seeded_mentions

        # Request page 1 with page_size=5
        resp1 = await client.get(
            "/api/v1/mentions/",
            params={"project_id": project_id, "page": 1, "page_size": 5},
        )
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["total"] == 15
        assert data1["page"] == 1
        assert data1["page_size"] == 5
        assert len(data1["items"]) == 5

        # Request page 2
        resp2 = await client.get(
            "/api/v1/mentions/",
            params={"project_id": project_id, "page": 2, "page_size": 5},
        )
        data2 = resp2.json()
        assert data2["page"] == 2
        assert len(data2["items"]) == 5

        # Request page 3 (last page)
        resp3 = await client.get(
            "/api/v1/mentions/",
            params={"project_id": project_id, "page": 3, "page_size": 5},
        )
        data3 = resp3.json()
        assert data3["page"] == 3
        assert len(data3["items"]) == 5

        # Ensure no overlap between pages
        ids_1 = {item["id"] for item in data1["items"]}
        ids_2 = {item["id"] for item in data2["items"]}
        ids_3 = {item["id"] for item in data3["items"]}
        assert ids_1.isdisjoint(ids_2)
        assert ids_2.isdisjoint(ids_3)
        assert ids_1.isdisjoint(ids_3)

    async def test_mention_pagination_beyond_last_page(self, client, seeded_mentions):
        """Test requesting a page beyond available data returns empty items."""
        project_id = seeded_mentions

        resp = await client.get(
            "/api/v1/mentions/",
            params={"project_id": project_id, "page": 100, "page_size": 10},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 15
        assert len(data["items"]) == 0

    async def test_get_single_mention(self, client, seeded_mentions):
        """Test fetching a single mention by ID."""
        project_id = seeded_mentions

        # Get the list first to find a valid mention ID
        list_resp = await client.get(
            "/api/v1/mentions/",
            params={"project_id": project_id, "page_size": 1},
        )
        mention_id = list_resp.json()["items"][0]["id"]

        resp = await client.get(f"/api/v1/mentions/{mention_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == mention_id
        assert "text" in data
        assert "sentiment" in data

    async def test_get_mention_not_found(self, client):
        """Test fetching a non-existent mention returns 404."""
        resp = await client.get("/api/v1/mentions/99999")
        assert resp.status_code == 404

    async def test_toggle_mention_flag(self, client, seeded_mentions):
        """Test toggling the flagged status on a mention."""
        project_id = seeded_mentions

        list_resp = await client.get(
            "/api/v1/mentions/",
            params={"project_id": project_id, "page_size": 1},
        )
        mention_id = list_resp.json()["items"][0]["id"]

        # Flag it
        flag_resp = await client.patch(f"/api/v1/mentions/{mention_id}/flag")
        assert flag_resp.status_code == 200
        assert flag_resp.json()["is_flagged"] is True

        # Toggle again — unflag
        unflag_resp = await client.patch(f"/api/v1/mentions/{mention_id}/flag")
        assert unflag_resp.status_code == 200
        assert unflag_resp.json()["is_flagged"] is False
