"""
Unit tests for individual microservice endpoints.

Tests use httpx.AsyncClient with FastAPI's dependency_overrides to inject
mocked database sessions, Redis/EventBus, and external API dependencies.
Each service's app is imported directly and tested without starting the
full lifespan (which would require real Postgres/Redis connections).
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Helpers: mock factories
# ---------------------------------------------------------------------------


def _make_mock_user(
    user_id=1,
    email="test@example.com",
    full_name="Test User",
    is_active=True,
    is_superadmin=False,
    hashed_password="$2b$12$fakehash",
    last_login_at=None,
    avatar_url=None,
    sso_subject=None,
):
    user = MagicMock()
    user.id = user_id
    user.email = email
    user.full_name = full_name
    user.is_active = is_active
    user.is_superadmin = is_superadmin
    user.hashed_password = hashed_password
    user.last_login_at = last_login_at
    user.avatar_url = avatar_url
    user.sso_subject = sso_subject
    user.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return user


def _make_mock_db_session():
    """Return an AsyncMock that behaves like an AsyncSession."""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.flush = AsyncMock()
    session.add = MagicMock()
    session.delete = AsyncMock()
    session.execute = AsyncMock()
    session.get = AsyncMock(return_value=None)
    return session


def _make_mock_event_bus():
    bus = AsyncMock()
    bus.publish = AsyncMock()
    bus.connect = AsyncMock()
    bus.close = AsyncMock()
    bus.ensure_group = AsyncMock()
    return bus


def _mock_session_factory(session):
    """Create a callable that returns an async context manager yielding session."""

    class _CtxMgr:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *args):
            pass

    return _CtxMgr


# ---------------------------------------------------------------------------
# 1. Identity Service Tests
# ---------------------------------------------------------------------------


class TestIdentityService:
    """Tests for the Identity Service endpoints."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self):
        # Patch tracing before import
        with patch("shared.tracing.setup_tracing"):
            from services.identity_service.app.main import (
                app,
                get_current_user,
                get_db,
                get_event_bus,
                require_auth,
            )

        self.app = app
        self.mock_db = _make_mock_db_session()
        self.mock_bus = _make_mock_event_bus()
        self.mock_user = _make_mock_user()

        async def override_get_db():
            yield self.mock_db

        def override_get_event_bus(request=None):
            return self.mock_bus

        async def override_require_auth():
            return self.mock_user

        async def override_get_current_user():
            return self.mock_user

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_event_bus] = override_get_event_bus
        app.dependency_overrides[require_auth] = override_require_auth
        app.dependency_overrides[get_current_user] = override_get_current_user

        yield

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_register_success(self):
        """Test successful user registration."""
        # Mock: no existing user found
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        self.mock_db.execute.return_value = mock_result

        # After commit, refresh populates user fields
        async def fake_refresh(obj):
            obj.id = 1
            obj.email = "new@example.com"
            obj.full_name = "New User"
            obj.avatar_url = None
            obj.is_active = True
            obj.is_superadmin = False
            obj.last_login_at = None
            obj.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

        self.mock_db.refresh = AsyncMock(side_effect=fake_refresh)

        with patch(
            "services.identity_service.app.main._hash_password",
            return_value="$2b$12$fakehashedpassword",
        ):
            transport = ASGITransport(app=self.app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/auth/register",
                    json={
                        "email": "new@example.com",
                        "password": "securePassword123",
                        "full_name": "New User",
                    },
                )

        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "new@example.com"
        assert data["full_name"] == "New User"

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self):
        """Test registration fails when email already exists."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = _make_mock_user()
        self.mock_db.execute.return_value = mock_result

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/register",
                json={
                    "email": "existing@example.com",
                    "password": "securePassword123",
                    "full_name": "Existing User",
                },
            )

        assert resp.status_code == 400
        assert "already registered" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_login_success(self):
        """Test successful login returns JWT tokens."""
        mock_user = _make_mock_user()

        # First execute: find user by email
        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_user

        # Second execute: find org membership
        mock_mem_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.first.return_value = None
        mock_mem_result.scalars.return_value = mock_scalars

        self.mock_db.execute = AsyncMock(
            side_effect=[mock_user_result, mock_mem_result]
        )

        with (
            patch(
                "services.identity_service.app.main._verify_password",
                return_value=True,
            ),
            patch(
                "services.identity_service.app.main._create_access_token",
                return_value="fake.access.token",
            ),
            patch(
                "services.identity_service.app.main._create_refresh_token",
                return_value="fake.refresh.token",
            ),
            patch(
                "services.identity_service.app.main._decode_token",
                return_value={"jti": "fakejti"},
            ),
            patch(
                "services.identity_service.app.main._create_session",
                new_callable=AsyncMock,
                return_value="1:fakejti",
            ),
        ):
            transport = ASGITransport(app=self.app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/auth/login",
                    json={
                        "email": "test@example.com",
                        "password": "correctPassword",
                    },
                )

        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self):
        """Test login fails with invalid credentials."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        self.mock_db.execute.return_value = mock_result

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "email": "wrong@example.com",
                    "password": "wrongPassword",
                },
            )

        assert resp.status_code == 401
        assert "Invalid credentials" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_validate_token_no_credentials(self):
        """Test token validation returns invalid when no token provided."""
        # Override to return None (no auth)
        from services.identity_service.app.main import get_current_user, get_db

        async def override_get_db():
            yield self.mock_db

        self.app.dependency_overrides[get_db] = override_get_db

        # Remove the get_current_user override for this test since validate
        # uses its own auth logic via the security dependency
        if get_current_user in self.app.dependency_overrides:
            del self.app.dependency_overrides[get_current_user]

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/validate")

        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False


# ---------------------------------------------------------------------------
# 2. Tenant Service Tests
# ---------------------------------------------------------------------------


class TestTenantService:
    """Tests for the Tenant Service endpoints."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self):
        with patch("shared.tracing.setup_tracing"):
            from services.tenant_service.app.main import (
                app,
                get_current_user,
                get_db,
                get_event_bus,
                require_auth,
            )

        self.app = app
        self.mock_db = _make_mock_db_session()
        self.mock_bus = _make_mock_event_bus()
        self.mock_user = _make_mock_user(is_superadmin=True)

        async def override_get_db():
            yield self.mock_db

        def override_get_event_bus(request=None):
            return self.mock_bus

        async def override_require_auth():
            return self.mock_user

        async def override_get_current_user():
            return self.mock_user

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_event_bus] = override_get_event_bus
        app.dependency_overrides[require_auth] = override_require_auth
        app.dependency_overrides[get_current_user] = override_get_current_user

        yield

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_create_org_success(self):
        """Test creating an organization."""
        # No existing org with the slug
        mock_existing = MagicMock()
        mock_existing.scalar_one_or_none.return_value = None
        self.mock_db.execute.return_value = mock_existing

        async def fake_refresh(obj):
            obj.id = 1
            obj.name = "Test Org"
            obj.slug = "test-org"
            obj.plan = "free"
            obj.mention_quota = 10000
            obj.mentions_used = 0
            obj.max_projects = 3
            obj.max_users = 5
            obj.sso_enabled = False
            obj.sso_provider = None
            obj.logo_url = None
            obj.primary_color = None
            obj.is_active = True
            obj.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

        self.mock_db.refresh = AsyncMock(side_effect=fake_refresh)

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/orgs",
                json={
                    "name": "Test Org",
                    "slug": "test-org",
                    "plan": "free",
                },
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Org"
        assert data["slug"] == "test-org"

    @pytest.mark.asyncio
    async def test_create_org_duplicate_slug(self):
        """Test creating org with duplicate slug returns 409."""
        mock_existing = MagicMock()
        mock_existing.scalar_one_or_none.return_value = MagicMock()
        self.mock_db.execute.return_value = mock_existing

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/orgs",
                json={
                    "name": "Duplicate Org",
                    "slug": "duplicate-org",
                    "plan": "free",
                },
            )

        assert resp.status_code == 409
        assert "already taken" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_members_org_not_found(self):
        """Test listing members of nonexistent org returns 404."""
        self.mock_db.get.return_value = None

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/orgs/999/members")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_members_success(self):
        """Test listing members of an organization."""
        from shared.models import OrgRole

        mock_org = MagicMock()
        mock_org.is_active = True
        self.mock_db.get.return_value = mock_org

        # First execute: _require_org_role check
        mock_role_result = MagicMock()
        mock_member = MagicMock()
        mock_member.role = OrgRole.OWNER
        mock_role_result.scalar_one_or_none.return_value = mock_member

        # Second execute: list members query
        mock_list_result = MagicMock()
        mock_list_result.all.return_value = []

        self.mock_db.execute = AsyncMock(
            side_effect=[mock_role_result, mock_list_result]
        )

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/orgs/1/members")

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_create_api_key_org_not_found(self):
        """Test creating API key for nonexistent org returns 404."""
        self.mock_db.get.return_value = None

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/orgs/999/api-keys",
                json={"name": "test-key", "scopes": "read"},
            )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_api_key_success(self):
        """Test successfully creating an API key."""
        from shared.models import OrgRole

        mock_org = MagicMock()
        mock_org.id = 1
        mock_org.is_active = True
        self.mock_db.get.return_value = mock_org

        # _require_org_role check
        mock_role_result = MagicMock()
        mock_member = MagicMock()
        mock_member.role = OrgRole.OWNER
        mock_role_result.scalar_one_or_none.return_value = mock_member
        self.mock_db.execute.return_value = mock_role_result

        async def fake_refresh(obj):
            obj.id = 1
            obj.organization_id = 1
            obj.name = "test-key"
            obj.prefix = "kf_abc123"
            obj.scopes = "read"
            obj.rate_limit = 1000
            obj.is_active = True
            obj.last_used_at = None
            obj.expires_at = None
            obj.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

        self.mock_db.refresh = AsyncMock(side_effect=fake_refresh)

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/orgs/1/api-keys",
                json={"name": "test-key", "scopes": "read"},
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "test-key"
        assert "raw_key" in data
        assert data["raw_key"].startswith("kf_")


# ---------------------------------------------------------------------------
# 3. Search Service Tests
# ---------------------------------------------------------------------------


class TestSearchService:
    """Tests for the Search Service endpoints."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self):
        with patch("shared.tracing.setup_tracing"):
            from services.search_service.app.main import app, require_auth

        self.app = app

        # Override auth to skip JWT validation in tests
        app.dependency_overrides[require_auth] = lambda: {"sub": "1", "email": "test@example.com"}

        # Mock Elasticsearch client on app.state
        self.mock_es = AsyncMock()
        app.state.es = self.mock_es

        # Mock DB session factory
        self.mock_db = _make_mock_db_session()
        app.state.db_session = _mock_session_factory(self.mock_db)

        yield

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_search_success(self):
        """Test full-text search returns results."""
        self.mock_es.search.return_value = {
            "hits": {
                "total": {"value": 1},
                "hits": [
                    {
                        "_id": "123",
                        "_score": 1.5,
                        "_source": {
                            "text": "Test mention about brand",
                            "platform": "twitter",
                            "sentiment": "positive",
                        },
                    }
                ],
            }
        }

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/search",
                json={"query": "brand", "page": 1, "page_size": 20},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["hits"]) == 1
        assert data["hits"][0]["id"] == "123"

    @pytest.mark.asyncio
    async def test_search_empty_query(self):
        """Test search with empty query still works (match_all)."""
        self.mock_es.search.return_value = {
            "hits": {
                "total": {"value": 0},
                "hits": [],
            }
        }

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/search",
                json={"query": "", "page": 1, "page_size": 20},
            )

        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_search_es_unavailable(self):
        """Test search returns 502 when ES is down."""
        self.mock_es.search.side_effect = Exception("Connection refused")

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/search",
                json={"query": "test", "page": 1, "page_size": 20},
            )

        assert resp.status_code == 502

    @pytest.mark.asyncio
    async def test_trending_topics(self):
        """Test trending topics aggregation."""
        self.mock_es.search.return_value = {
            "aggregations": {
                "trending_topics": {
                    "buckets": [
                        {"key": "ai", "doc_count": 50},
                        {"key": "python", "doc_count": 30},
                    ]
                },
                "trending_keywords": {
                    "buckets": [
                        {"key": "machine-learning", "doc_count": 20},
                    ]
                },
            }
        }

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/search/trending",
                params={"hours": 24, "size": 10},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["window_hours"] == 24
        assert len(data["items"]) == 3

    @pytest.mark.asyncio
    async def test_create_saved_search(self):
        """Test creating a saved search."""
        async def fake_refresh(obj):
            obj.id = 1
            obj.project_id = 1
            obj.user_id = 0
            obj.name = "My Search"
            obj.query_json = '{"query": "test"}'
            obj.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

        self.mock_db.refresh = AsyncMock(side_effect=fake_refresh)

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/saved-searches",
                json={
                    "project_id": 1,
                    "name": "My Search",
                    "query_json": {"query": "test"},
                },
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "My Search"
        assert data["project_id"] == 1

    @pytest.mark.asyncio
    async def test_delete_saved_search_not_found(self):
        """Test deleting a nonexistent saved search returns 404."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        self.mock_db.execute.return_value = mock_result

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete("/api/v1/saved-searches/999")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 4. Export Service Tests
# ---------------------------------------------------------------------------


class TestExportService:
    """Tests for the Export Service endpoints."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self):
        with patch("shared.tracing.setup_tracing"):
            from services.export_service.app.main import app, require_auth

        self.app = app

        app.dependency_overrides[require_auth] = lambda: {"sub": "1", "email": "test@example.com"}

        self.mock_db = _make_mock_db_session()
        self.mock_bus = _make_mock_event_bus()

        app.state.db_session = _mock_session_factory(self.mock_db)
        app.state.event_bus = self.mock_bus

        yield

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_create_export_success(self):
        """Test creating a CSV export job."""
        async def fake_refresh(obj):
            obj.id = 1
            obj.project_id = 1
            obj.user_id = 1
            obj.export_format = MagicMock(value="csv")
            obj.status = MagicMock(value="pending")
            obj.filters_json = "{}"
            obj.file_path = None
            obj.row_count = None
            obj.error_message = None
            obj.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
            obj.completed_at = None

        self.mock_db.refresh = AsyncMock(side_effect=fake_refresh)

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/exports",
                json={
                    "project_id": 1,
                    "user_id": 1,
                    "format": "csv",
                },
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["project_id"] == 1
        assert data["export_format"] == "csv"
        assert data["status"] == "pending"

    @pytest.mark.asyncio
    async def test_create_export_invalid_format(self):
        """Test creating export with invalid format returns 400."""
        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/exports",
                json={
                    "project_id": 1,
                    "format": "invalid",
                },
            )

        assert resp.status_code == 400
        assert "Invalid format" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_exports_success(self):
        """Test listing export jobs for a project."""
        mock_job = MagicMock()
        mock_job.id = 1
        mock_job.project_id = 1
        mock_job.export_format = MagicMock(value="csv")
        mock_job.status = MagicMock(value="completed")
        mock_job.file_path = "/exports/file.csv"
        mock_job.row_count = 100
        mock_job.error_message = None
        mock_job.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
        mock_job.completed_at = datetime(2025, 1, 1, 0, 5, tzinfo=timezone.utc)

        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_job]
        mock_result.scalars.return_value = mock_scalars
        self.mock_db.execute.return_value = mock_result

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/exports",
                params={"project_id": 1},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["export_format"] == "csv"
        assert data[0]["status"] == "completed"

    @pytest.mark.asyncio
    async def test_export_status_not_found(self):
        """Test checking status of nonexistent export returns 404."""
        self.mock_db.get.return_value = None

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/exports/999/status")

        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 5. Competitive Service Tests
# ---------------------------------------------------------------------------


class TestCompetitiveService:
    """Tests for the Competitive Intelligence Service endpoints."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self):
        with patch("shared.tracing.setup_tracing"):
            from services.competitive_service.app.main import app, get_db, require_auth

        self.app = app
        self.mock_db = _make_mock_db_session()

        async def override_get_db():
            yield self.mock_db

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[require_auth] = lambda: {"sub": "1", "email": "test@example.com"}

        yield

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_benchmark_project_not_found(self):
        """Test benchmark returns 404 when project does not exist."""
        self.mock_db.get.return_value = None

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/benchmark/999",
                params={"days": 30},
            )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_benchmark_success(self):
        """Test benchmark returns metrics for project with no competitors."""
        mock_project = MagicMock()
        mock_project.id = 1
        mock_project.name = "My Brand"
        mock_project.competitor_ids = ""
        self.mock_db.get.return_value = mock_project

        # Mock all the aggregation queries to return 0/empty
        mock_scalar_result = MagicMock()
        mock_scalar_result.scalar.return_value = 0

        mock_one_result = MagicMock()
        mock_one_result.one.return_value = (0, 0, 0, 0)

        mock_kw_result = MagicMock()
        mock_kw_result.scalars.return_value = []

        # The function makes many queries; provide enough return values
        self.mock_db.execute = AsyncMock(
            side_effect=[
                mock_scalar_result,   # mention count
                mock_scalar_result,   # positive
                mock_scalar_result,   # negative
                mock_scalar_result,   # neutral
                mock_scalar_result,   # mixed
                mock_scalar_result,   # avg score
                mock_one_result,      # engagement totals
                mock_kw_result,       # keywords
                mock_kw_result,       # topics
            ]
        )

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/benchmark/1",
                params={"days": 30},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["project_id"] == 1
        assert len(data["brands"]) == 1
        assert data["brands"][0]["project_name"] == "My Brand"

    @pytest.mark.asyncio
    async def test_share_of_voice_project_not_found(self):
        """Test share of voice returns 404 for missing project."""
        self.mock_db.get.return_value = None

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/benchmark/999/share-of-voice",
                params={"days": 30},
            )

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_share_of_voice_success(self):
        """Test share of voice calculation."""
        mock_project = MagicMock()
        mock_project.id = 1
        mock_project.name = "My Brand"
        mock_project.competitor_ids = ""
        self.mock_db.get.return_value = mock_project

        # mention count query
        mock_count = MagicMock()
        mock_count.scalar.return_value = 100
        self.mock_db.execute.return_value = mock_count

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/benchmark/1/share-of-voice",
                params={"days": 30},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["project_id"] == 1
        assert len(data["breakdown"]) == 1
        assert data["breakdown"][0]["share_of_voice"] == 100.0


# ---------------------------------------------------------------------------
# 6. Publishing Service Tests
# ---------------------------------------------------------------------------


class TestPublishingService:
    """Tests for the Publishing Service endpoints."""

    @pytest_asyncio.fixture(autouse=True)
    async def setup(self):
        with patch("shared.tracing.setup_tracing"):
            from services.publishing_service.app.main import app, require_auth

        self.app = app

        app.dependency_overrides[require_auth] = lambda: {"sub": "1", "email": "test@example.com"}

        self.mock_db = _make_mock_db_session()
        self.mock_bus = _make_mock_event_bus()

        app.state.db_session = _mock_session_factory(self.mock_db)
        app.state.event_bus = self.mock_bus

        yield

        app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_create_post_success(self):
        """Test creating a scheduled post."""
        async def fake_refresh(obj):
            obj.id = 1
            obj.project_id = 1
            obj.created_by = 1
            obj.platform = "twitter"
            obj.content = "Hello world!"
            obj.media_urls = None
            obj.scheduled_at = datetime(2025, 6, 1, tzinfo=timezone.utc)
            obj.published_at = None
            obj.status = "draft"
            obj.platform_post_id = None
            obj.approved_by = None
            obj.error_message = None
            obj.reply_to_mention_id = None
            obj.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

        self.mock_db.refresh = AsyncMock(side_effect=fake_refresh)

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/posts",
                json={
                    "project_id": 1,
                    "created_by": 1,
                    "platform": "twitter",
                    "content": "Hello world!",
                    "scheduled_at": "2025-06-01T00:00:00Z",
                },
            )

        assert resp.status_code == 201
        data = resp.json()
        assert data["content"] == "Hello world!"
        assert data["status"] == "draft"
        assert data["platform"] == "twitter"

    @pytest.mark.asyncio
    async def test_list_posts_success(self):
        """Test listing scheduled posts for a project."""
        mock_post = MagicMock()
        mock_post.id = 1
        mock_post.project_id = 1
        mock_post.created_by = 1
        mock_post.platform = "twitter"
        mock_post.content = "Test post"
        mock_post.media_urls = None
        mock_post.scheduled_at = datetime(2025, 6, 1, tzinfo=timezone.utc)
        mock_post.published_at = None
        mock_post.status = "draft"
        mock_post.platform_post_id = None
        mock_post.approved_by = None
        mock_post.error_message = None
        mock_post.reply_to_mention_id = None
        mock_post.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)

        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_post]
        mock_result.scalars.return_value = mock_scalars
        self.mock_db.execute.return_value = mock_result

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/posts",
                params={"project_id": 1},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["content"] == "Test post"

    @pytest.mark.asyncio
    async def test_delete_post_not_found(self):
        """Test deleting a nonexistent post returns 404."""
        self.mock_db.get.return_value = None

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete("/api/v1/posts/999")

        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_published_post_fails(self):
        """Test cannot delete an already-published post."""
        mock_post = MagicMock()
        mock_post.id = 1

        with patch("shared.tracing.setup_tracing"):
            from services.publishing_service.app.main import PublishStatus

        mock_post.status = PublishStatus.PUBLISHED
        self.mock_db.get.return_value = mock_post

        transport = ASGITransport(app=self.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete("/api/v1/posts/1")

        assert resp.status_code == 400
        assert "already-published" in resp.json()["detail"]
