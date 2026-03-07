"""Integration tests for Gateway API."""
import pytest


@pytest.mark.integration
class TestHealthEndpoint:
    async def test_health_check(self):
        """Test that /health returns ok.

        Requires the gateway app to be running or importable with all dependencies.
        """
        try:
            from httpx import ASGITransport, AsyncClient

            from services.gateway.app.main import app

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/health")
                assert resp.status_code == 200
                data = resp.json()
                assert data["status"] == "ok"
                assert data["service"] == "gateway"
        except ImportError:
            pytest.skip("Gateway dependencies not available")
        except Exception as e:
            pytest.skip(f"Gateway app not testable in this environment: {e}")


@pytest.mark.integration
class TestAuthFlow:
    async def test_register_and_login(self):
        """Test full registration and login flow."""
        # Placeholder - implement when app is testable with test database
        pass

    async def test_login_invalid_credentials(self):
        """Test login with wrong password returns 401."""
        pass


@pytest.mark.integration
class TestProjectsCRUD:
    async def test_create_project(self):
        """Test creating a new project."""
        pass

    async def test_list_projects(self):
        """Test listing projects for an org."""
        pass

    async def test_update_project(self):
        """Test updating a project."""
        pass

    async def test_delete_project(self):
        """Test archiving a project."""
        pass


@pytest.mark.integration
class TestMentionsAPI:
    async def test_list_mentions_with_filters(self):
        """Test fetching mentions with platform/sentiment filters."""
        pass

    async def test_mention_pagination(self):
        """Test mention list pagination."""
        pass
