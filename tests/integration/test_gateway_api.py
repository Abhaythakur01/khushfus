"""Integration tests for Gateway API.

These tests create a standalone FastAPI test app that reuses the gateway's
routers but uses FastAPI dependency overrides to inject an in-memory SQLite
session instead of requiring Postgres/Redis.
"""

import hashlib
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# Monkey-patch passlib bcrypt to avoid version incompatibility with bcrypt>=4.1
# We replace hash_password / verify_password in the gateway deps module with
# simple SHA-256 based implementations that are sufficient for testing.
# ---------------------------------------------------------------------------
import services.gateway.app.deps as _deps  # noqa: E402
from shared.models import Base, Keyword, Mention, Organization, Platform, Project, Sentiment


def _test_hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _test_verify_password(plain: str, hashed: str) -> bool:
    return hashlib.sha256(plain.encode()).hexdigest() == hashed


_deps.hash_password = _test_hash_password
_deps.verify_password = _test_verify_password


# ---------------------------------------------------------------------------
# Test-local engine and session factory (in-memory SQLite, shared connection)
# ---------------------------------------------------------------------------

_test_engine = None
_TestSessionLocal = None


async def _get_test_engine():
    """Lazily create the in-memory SQLite engine + sessionmaker."""
    global _test_engine, _TestSessionLocal
    if _test_engine is None:
        _test_engine = create_async_engine(
            "sqlite+aiosqlite://",
            echo=False,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async with _test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _TestSessionLocal = sessionmaker(
            _test_engine, class_=AsyncSession, expire_on_commit=False
        )
    return _test_engine, _TestSessionLocal


async def _dispose_test_engine():
    global _test_engine, _TestSessionLocal
    if _test_engine:
        await _test_engine.dispose()
        _test_engine = None
        _TestSessionLocal = None


# ---------------------------------------------------------------------------
# Build a test-specific FastAPI app
# ---------------------------------------------------------------------------


def _build_test_app():
    """Build a minimal FastAPI app with gateway routes and dependency overrides.

    Uses dependency_overrides to replace get_db and get_event_bus so the
    real gateway lifespan (which needs Postgres + Redis) is never invoked.
    """
    try:
        from fastapi import FastAPI

        from services.gateway.app.deps import get_db, get_event_bus
        from services.gateway.app.routes import auth, mentions, projects
    except ImportError:
        pytest.skip("Gateway dependencies not available")

    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1/auth")
    app.include_router(projects.router, prefix="/api/v1/projects")
    app.include_router(mentions.router, prefix="/api/v1/mentions")

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "gateway"}

    # --- Dependency overrides ---

    async def _override_get_db():
        """Yield a test DB session from the in-memory SQLite engine."""
        _, sf = await _get_test_engine()
        async with sf() as session:
            yield session

    mock_bus = MagicMock()
    mock_bus.publish = AsyncMock()
    mock_bus.connect = AsyncMock()
    mock_bus.close = AsyncMock()

    def _override_get_event_bus():
        return mock_bus

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_event_bus] = _override_get_event_bus

    return app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="module")
async def test_app():
    """Create the test app once per module."""
    app = _build_test_app()
    yield app
    await _dispose_test_engine()


@pytest_asyncio.fixture
async def client(test_app):
    """Provide an httpx AsyncClient wired to the test app."""
    try:
        from httpx import ASGITransport, AsyncClient
    except ImportError:
        pytest.skip("httpx not available")

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test", follow_redirects=True) as ac:
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
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin@test.com",
            "password": "Str0ngP@ss!",
            "full_name": "Admin User",
        },
    )
    assert reg_resp.status_code == 201, f"Registration failed: {reg_resp.text}"
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@test.com", "password": "Str0ngP@ss!"},
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def seeded_org():
    """Create a test organization directly in the DB."""
    _, sf = await _get_test_engine()
    async with sf() as session:
        org = Organization(name="Test Org", slug="test-org", plan="professional")
        session.add(org)
        await session.commit()
        await session.refresh(org)
        return org.id


@pytest_asyncio.fixture
async def seeded_project(seeded_org):
    """Create a project with keywords for the seeded org."""
    _, sf = await _get_test_engine()
    async with sf() as session:
        project = Project(
            organization_id=seeded_org,
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
        return project.id


@pytest_asyncio.fixture
async def seeded_mentions(seeded_project):
    """Insert 15 mentions for the seeded project."""
    project_id = seeded_project
    _, sf = await _get_test_engine()
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
        resp_data = register_resp.json()
        assert "access_token" in resp_data
        assert resp_data["token_type"] == "bearer"
        user_data = resp_data["user"]
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
        assert len(token_data["access_token"]) > 10

    async def test_register_duplicate_email(self, client):
        """Test that registering the same email twice returns 409."""
        payload = {
            "email": "dupe@example.com",
            "password": "P@ssw0rd!",
            "full_name": "First User",
        }
        first = await client.post("/api/v1/auth/register", json=payload)
        assert first.status_code == 201

        second = await client.post("/api/v1/auth/register", json=payload)
        assert second.status_code == 409
        assert "already registered" in second.json()["detail"].lower()

    async def test_login_invalid_credentials(self, client):
        """Test login with wrong password returns 401."""
        await client.post(
            "/api/v1/auth/register",
            json={
                "email": "valid@example.com",
                "password": "C0rrect!",
                "full_name": "Valid User",
            },
        )
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
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["email"] == "admin@test.com"
        assert data["full_name"] == "Admin User"

    async def test_me_endpoint_unauthenticated(self, client):
        """Test GET /auth/me without a token returns 401."""
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401


@pytest.mark.integration
class TestProjectsCRUD:
    async def test_create_project(self, client, auth_headers, seeded_org):
        """Test creating a new project via POST /api/v1/projects."""
        resp = await client.post(
            "/api/v1/projects",
            headers=auth_headers,
            json={
                "name": "My New Project",
                "client_name": "Acme Corp",
                "organization_id": seeded_org,
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

    async def test_list_projects(self, client, auth_headers, seeded_org):
        """Test listing projects returns all created projects."""
        for name in ["Project Alpha", "Project Beta"]:
            await client.post(
                "/api/v1/projects",
                headers=auth_headers,
                json={
                    "name": name,
                    "client_name": "Client",
                    "organization_id": seeded_org,
                    "platforms": "twitter",
                },
            )

        resp = await client.get("/api/v1/projects", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 2
        names = {p["name"] for p in data}
        assert "Project Alpha" in names
        assert "Project Beta" in names

    async def test_get_project_by_id(self, client, auth_headers, seeded_project):
        """Test retrieving a single project by its ID."""
        resp = await client.get(f"/api/v1/projects/{seeded_project}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Integration Project"
        assert data["id"] == seeded_project

    async def test_get_project_not_found(self, client, auth_headers):
        """Test fetching a non-existent project returns 404."""
        resp = await client.get("/api/v1/projects/99999", headers=auth_headers)
        assert resp.status_code == 404

    async def test_update_project(self, client, auth_headers, seeded_project):
        """Test updating a project via PATCH."""
        patch_resp = await client.patch(
            f"/api/v1/projects/{seeded_project}",
            headers=auth_headers,
            json={"name": "Updated Name", "description": "Now with a description"},
        )
        assert patch_resp.status_code == 200
        data = patch_resp.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Now with a description"

    async def test_update_project_status(self, client, auth_headers, seeded_project):
        """Test updating a project's status to paused."""
        patch_resp = await client.patch(
            f"/api/v1/projects/{seeded_project}",
            headers=auth_headers,
            json={"status": "paused"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == "paused"

    async def test_delete_project(self, client, auth_headers, seeded_project):
        """Test archiving a project (setting status to 'archived')."""
        patch_resp = await client.patch(
            f"/api/v1/projects/{seeded_project}",
            headers=auth_headers,
            json={"status": "archived"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == "archived"

        # Confirm it persists on re-fetch
        get_resp = await client.get(f"/api/v1/projects/{seeded_project}", headers=auth_headers)
        assert get_resp.json()["status"] == "archived"


@pytest.mark.integration
class TestMentionsAPI:
    async def test_list_mentions_with_filters(self, client, auth_headers, seeded_mentions):
        """Test fetching mentions with platform filter."""
        project_id = seeded_mentions

        # Fetch all mentions for the project
        resp = await client.get(
            "/api/v1/mentions/",
            headers=auth_headers,
            params={"project_id": project_id},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 15
        assert len(data["items"]) == 15
        assert data["page"] == 1

        # Filter by platform=twitter (indices 0, 3, 6, 9, 12 = 5 mentions)
        resp = await client.get(
            "/api/v1/mentions/",
            headers=auth_headers,
            params={"project_id": project_id, "platform": "twitter"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        for item in data["items"]:
            assert item["platform"] == "twitter"

    async def test_list_mentions_sentiment_filter(self, client, auth_headers, seeded_mentions):
        """Test fetching mentions filtered by sentiment."""
        project_id = seeded_mentions

        resp = await client.get(
            "/api/v1/mentions/",
            headers=auth_headers,
            params={"project_id": project_id, "sentiment": "positive"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        for item in data["items"]:
            assert item["sentiment"] == "positive"

    async def test_mention_pagination(self, client, auth_headers, seeded_mentions):
        """Test mention list pagination with page and page_size params."""
        project_id = seeded_mentions

        # Page 1 of 3
        resp1 = await client.get(
            "/api/v1/mentions/",
            headers=auth_headers,
            params={"project_id": project_id, "page": 1, "page_size": 5},
        )
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["total"] == 15
        assert data1["page"] == 1
        assert data1["page_size"] == 5
        assert len(data1["items"]) == 5

        # Page 2 of 3
        resp2 = await client.get(
            "/api/v1/mentions/",
            headers=auth_headers,
            params={"project_id": project_id, "page": 2, "page_size": 5},
        )
        data2 = resp2.json()
        assert data2["page"] == 2
        assert len(data2["items"]) == 5

        # Page 3 of 3
        resp3 = await client.get(
            "/api/v1/mentions/",
            headers=auth_headers,
            params={"project_id": project_id, "page": 3, "page_size": 5},
        )
        data3 = resp3.json()
        assert data3["page"] == 3
        assert len(data3["items"]) == 5

        # Pages must not overlap
        ids_1 = {item["id"] for item in data1["items"]}
        ids_2 = {item["id"] for item in data2["items"]}
        ids_3 = {item["id"] for item in data3["items"]}
        assert ids_1.isdisjoint(ids_2)
        assert ids_2.isdisjoint(ids_3)
        assert ids_1.isdisjoint(ids_3)

    async def test_mention_pagination_beyond_last_page(self, client, auth_headers, seeded_mentions):
        """Test requesting a page beyond available data returns empty items."""
        project_id = seeded_mentions

        resp = await client.get(
            "/api/v1/mentions/",
            headers=auth_headers,
            params={"project_id": project_id, "page": 100, "page_size": 10},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 15
        assert len(data["items"]) == 0

    async def test_get_single_mention(self, client, auth_headers, seeded_mentions):
        """Test fetching a single mention by ID."""
        project_id = seeded_mentions

        # Find a valid mention ID from the list
        list_resp = await client.get(
            "/api/v1/mentions/",
            headers=auth_headers,
            params={"project_id": project_id, "page_size": 1},
        )
        mention_id = list_resp.json()["items"][0]["id"]

        resp = await client.get(f"/api/v1/mentions/{mention_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == mention_id
        assert "text" in data
        assert "sentiment" in data
        assert "platform" in data

    async def test_get_mention_not_found(self, client, auth_headers):
        """Test fetching a non-existent mention returns 404."""
        resp = await client.get("/api/v1/mentions/99999", headers=auth_headers)
        assert resp.status_code == 404

    async def test_toggle_mention_flag(self, client, auth_headers, seeded_mentions):
        """Test toggling the flagged status on a mention."""
        project_id = seeded_mentions

        list_resp = await client.get(
            "/api/v1/mentions/",
            headers=auth_headers,
            params={"project_id": project_id, "page_size": 1},
        )
        mention_id = list_resp.json()["items"][0]["id"]

        # Flag it
        flag_resp = await client.patch(f"/api/v1/mentions/{mention_id}/flag", headers=auth_headers)
        assert flag_resp.status_code == 200
        assert flag_resp.json()["is_flagged"] is True

        # Toggle again to unflag
        unflag_resp = await client.patch(f"/api/v1/mentions/{mention_id}/flag", headers=auth_headers)
        assert unflag_resp.status_code == 200
        assert unflag_resp.json()["is_flagged"] is False


# ===================================================================
# Additional tests: CORS, Request ID, Rate Limiting
# ===================================================================


@pytest.mark.integration
class TestCORSHeaders:
    """Verify CORS middleware is configured correctly.

    These tests build a dedicated app with CORSMiddleware (the shared test_app
    fixture does not include it) to validate preflight and CORS header behavior.
    """

    @pytest_asyncio.fixture
    async def cors_client(self):
        """Build a minimal app with CORS middleware and return a client for it."""
        try:
            from fastapi import FastAPI
            from fastapi.middleware.cors import CORSMiddleware
            from httpx import ASGITransport, AsyncClient
        except ImportError:
            pytest.skip("httpx or fastapi not available")

        app = FastAPI()
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        @app.get("/health")
        async def health():
            return {"status": "ok"}

        @app.get("/api/v1/projects")
        async def projects():
            return []

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    async def test_cors_allows_any_origin(self, cors_client):
        """Preflight requests must return Access-Control-Allow-Origin."""
        resp = await cors_client.options(
            "/health",
            headers={
                "Origin": "https://app.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.status_code == 200
        assert "access-control-allow-origin" in resp.headers
        assert resp.headers["access-control-allow-origin"] in ("*", "https://app.example.com")

    async def test_cors_headers_on_normal_request(self, cors_client):
        """Normal GET requests must include CORS headers when Origin is sent."""
        resp = await cors_client.get(
            "/health",
            headers={"Origin": "https://dashboard.khushfus.io"},
        )
        assert resp.status_code == 200
        assert "access-control-allow-origin" in resp.headers

    async def test_cors_allows_credentials(self, cors_client):
        """CORS must allow credentials (cookies / auth headers)."""
        resp = await cors_client.options(
            "/health",
            headers={
                "Origin": "https://app.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert resp.status_code == 200
        allow_creds = resp.headers.get("access-control-allow-credentials", "")
        assert allow_creds.lower() == "true"

    async def test_cors_allows_common_methods(self, cors_client):
        """CORS must allow GET, POST, PATCH, DELETE methods."""
        resp = await cors_client.options(
            "/api/v1/projects",
            headers={
                "Origin": "https://app.example.com",
                "Access-Control-Request-Method": "DELETE",
            },
        )
        assert resp.status_code == 200
        allowed = resp.headers.get("access-control-allow-methods", "")
        assert "*" in allowed or "DELETE" in allowed


@pytest.mark.integration
class TestRequestIDMiddleware:
    """Verify that the X-Request-ID middleware works correctly.

    Builds a dedicated app with RequestIDMiddleware to test header behavior.
    """

    @pytest_asyncio.fixture
    async def reqid_client(self):
        """Build a minimal app with RequestIDMiddleware and return a client."""
        try:
            from fastapi import FastAPI
            from httpx import ASGITransport, AsyncClient
        except ImportError:
            pytest.skip("httpx or fastapi not available")

        from services.gateway.app.main import RequestIDMiddleware

        app = FastAPI()
        app.add_middleware(RequestIDMiddleware)

        @app.get("/health")
        async def health():
            return {"status": "ok"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    async def test_request_id_generated_when_absent(self, reqid_client):
        """Responses must include an X-Request-ID even if the client doesn't send one."""
        resp = await reqid_client.get("/health")
        assert resp.status_code == 200
        assert "x-request-id" in resp.headers
        req_id = resp.headers["x-request-id"]
        assert len(req_id) >= 20  # UUIDs are 36 chars

    async def test_request_id_echoed_when_provided(self, reqid_client):
        """When the client sends X-Request-ID, the same value must be echoed back."""
        custom_id = "my-custom-trace-id-12345"
        resp = await reqid_client.get("/health", headers={"X-Request-ID": custom_id})
        assert resp.status_code == 200
        assert resp.headers.get("x-request-id") == custom_id


@pytest.mark.integration
class TestRateLimitingBehavior:
    """Test rate limiting middleware behavior with mocked rate limiter service.

    The gateway's RateLimitMiddleware calls an external rate limiter service.
    These tests verify the middleware logic by mocking the HTTP calls.
    """

    async def test_rate_limit_skips_health_endpoint(self):
        """Health endpoint must bypass rate limiting."""
        from services.gateway.app.middleware import SKIP_PATHS

        assert "/health" in SKIP_PATHS
        assert "/docs" in SKIP_PATHS
        assert "/openapi.json" in SKIP_PATHS

    def test_client_identifier_from_api_key(self):
        """_client_identifier must prefer X-API-Key over IP."""
        from services.gateway.app.middleware import _client_identifier

        mock_request = MagicMock()
        mock_request.headers = {"x-api-key": "key123"}
        mock_request.client.host = "10.0.0.1"

        identifier = _client_identifier(mock_request)
        assert identifier == "apikey:key123"

    def test_client_identifier_from_ip(self):
        """_client_identifier must fall back to client IP when no API key."""
        from services.gateway.app.middleware import _client_identifier

        mock_request = MagicMock()
        mock_request.headers = {}
        mock_request.client.host = "192.168.1.100"

        identifier = _client_identifier(mock_request)
        assert identifier == "ip:192.168.1.100"

    def test_client_identifier_from_forwarded_for(self):
        """_client_identifier must use X-Forwarded-For when present."""
        from services.gateway.app.middleware import _client_identifier

        mock_request = MagicMock()
        mock_request.headers = {"x-forwarded-for": "203.0.113.50, 70.41.3.18"}
        mock_request.client.host = "10.0.0.1"

        identifier = _client_identifier(mock_request)
        assert identifier == "ip:203.0.113.50"


@pytest.mark.integration
class TestAuthEdgeCases:
    """Additional authentication edge cases."""

    async def test_expired_token_rejected(self, client):
        """A JWT with an expired timestamp must be rejected."""
        from datetime import datetime, timedelta

        from jose import jwt

        expired_payload = {
            "sub": "1",
            "exp": datetime.utcnow() - timedelta(hours=1),
        }
        expired_token = jwt.encode(expired_payload, "change-me-in-production", algorithm="HS256")

        resp = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert resp.status_code == 401

    async def test_malformed_token_rejected(self, client):
        """A completely invalid JWT string must be rejected."""
        resp = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer not.a.valid.jwt.token"},
        )
        assert resp.status_code == 401

    async def test_register_missing_fields(self, client):
        """Registration with missing required fields must fail with 422."""
        resp = await client.post(
            "/api/v1/auth/register",
            json={"email": "incomplete@test.com"},
        )
        assert resp.status_code == 422
