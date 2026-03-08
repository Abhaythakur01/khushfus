"""Unit tests for KhushFus service logic.

Tests cover:
- Gateway middleware (RateLimitMiddleware, RequestIDMiddleware)
- Health check utility (shared/health.py — build_health_response)
- Circuit breaker (shared/circuit_breaker.py — state transitions)
- DLQ logic (shared/events.py — consume_with_retry, reprocess_dlq)

All external dependencies (Redis, Postgres, HTTP) are mocked so tests
run without any infrastructure.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from shared.circuit_breaker import CircuitBreaker, CircuitBreakerError, CircuitState
from shared.health import (
    build_health_response,
    check_elasticsearch,
    check_postgres,
    check_redis,
)

# ============================================================================
# Health Check Tests
# ============================================================================


class TestBuildHealthResponse:
    """Tests for build_health_response in shared/health.py."""

    @pytest.mark.asyncio
    async def test_all_checks_up(self):
        checks = {
            "postgres": {"status": "up"},
            "redis": {"status": "up"},
        }
        result = await build_health_response("gateway", version="1.0.0", checks=checks)
        assert result["status"] == "ok"
        assert result["service"] == "gateway"
        assert result["version"] == "1.0.0"
        assert result["dependencies"] == checks

    @pytest.mark.asyncio
    async def test_degraded_when_dependency_down(self):
        checks = {
            "postgres": {"status": "up"},
            "redis": {"status": "down", "error": "Connection refused"},
        }
        result = await build_health_response("gateway", checks=checks)
        assert result["status"] == "degraded"

    @pytest.mark.asyncio
    async def test_no_checks_returns_ok(self):
        result = await build_health_response("gateway")
        assert result["status"] == "ok"
        assert result["dependencies"] == {}

    @pytest.mark.asyncio
    async def test_default_version(self):
        result = await build_health_response("test-service")
        assert result["version"] == "0.1.0"

    @pytest.mark.asyncio
    async def test_all_down_is_degraded(self):
        checks = {
            "postgres": {"status": "down"},
            "redis": {"status": "down"},
        }
        result = await build_health_response("gateway", checks=checks)
        assert result["status"] == "degraded"

    @pytest.mark.asyncio
    async def test_unknown_status_is_degraded(self):
        """A check with status 'unknown' should yield degraded overall."""
        checks = {"postgres": {"status": "unknown", "error": "No connection info provided"}}
        result = await build_health_response("gateway", checks=checks)
        assert result["status"] == "degraded"


class TestCheckPostgres:
    """Tests for check_postgres — mock the DB session/engine."""

    @pytest.mark.asyncio
    async def test_up_with_session_factory(self):
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        # session_factory() is called synchronously and must return an async context manager
        def session_factory():
            return mock_session

        result = await check_postgres(session_factory=session_factory)
        assert result["status"] == "up"

    @pytest.mark.asyncio
    async def test_down_on_exception(self):
        async def bad_factory():
            raise ConnectionError("pg down")

        # The factory itself raises, but check_postgres wraps as context manager
        # so we need a factory that returns an async context manager that fails
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(side_effect=ConnectionError("pg down"))
        mock_session.__aexit__ = AsyncMock(return_value=False)

        result = await check_postgres(session_factory=lambda: mock_session)
        assert result["status"] == "down"
        assert "pg down" in result["error"]

    @pytest.mark.asyncio
    async def test_no_connection_info(self):
        result = await check_postgres()
        assert result["status"] == "unknown"


class TestCheckRedis:
    """Tests for check_redis — mock the aioredis client."""

    @pytest.mark.asyncio
    async def test_up(self):
        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock(return_value=True)
        mock_redis.aclose = AsyncMock()

        with patch("redis.asyncio.from_url", return_value=mock_redis):
            result = await check_redis("redis://localhost:6379")
        assert result["status"] == "up"

    @pytest.mark.asyncio
    async def test_down_on_exception(self):
        with patch("redis.asyncio.from_url", side_effect=ConnectionError("no redis")):
            result = await check_redis("redis://localhost:6379")
        assert result["status"] == "down"
        assert "no redis" in result["error"]


class TestCheckElasticsearch:
    """Tests for check_elasticsearch (OpenSearch) — mock httpx."""

    @pytest.mark.asyncio
    async def test_up(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {"status": "green"}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await check_elasticsearch("http://localhost:9200")
        assert result["status"] == "up"
        assert result["cluster_status"] == "green"

    @pytest.mark.asyncio
    async def test_down_on_exception(self):
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=ConnectionError("es down"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await check_elasticsearch("http://localhost:9200")
        assert result["status"] == "down"


# ============================================================================
# Circuit Breaker Tests
# ============================================================================


class TestCircuitBreaker:
    """Tests for CircuitBreaker state transitions in shared/circuit_breaker.py."""

    @pytest.mark.asyncio
    async def test_initial_state_is_closed(self):
        cb = CircuitBreaker("test-svc")
        assert cb.state == CircuitState.CLOSED
        assert cb.failure_count == 0
        assert cb.is_open is False

    @pytest.mark.asyncio
    async def test_successful_call(self):
        cb = CircuitBreaker("test-svc")
        mock_fn = AsyncMock(return_value="ok")
        result = await cb.call(mock_fn, "arg1", key="val")
        assert result == "ok"
        mock_fn.assert_awaited_once_with("arg1", key="val")
        assert cb.state == CircuitState.CLOSED
        assert cb.failure_count == 0

    @pytest.mark.asyncio
    async def test_failure_increments_count(self):
        cb = CircuitBreaker("test-svc", failure_threshold=3)
        mock_fn = AsyncMock(side_effect=ConnectionError("fail"))

        with pytest.raises(ConnectionError):
            await cb.call(mock_fn)

        assert cb.failure_count == 1
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_opens_after_threshold(self):
        cb = CircuitBreaker("test-svc", failure_threshold=3)
        mock_fn = AsyncMock(side_effect=ConnectionError("fail"))

        for _ in range(3):
            with pytest.raises(ConnectionError):
                await cb.call(mock_fn)

        assert cb.state == CircuitState.OPEN
        assert cb.is_open is True
        assert cb.failure_count == 3

    @pytest.mark.asyncio
    async def test_open_circuit_rejects_calls(self):
        cb = CircuitBreaker("test-svc", failure_threshold=2, recovery_timeout=60.0)
        mock_fn = AsyncMock(side_effect=ConnectionError("fail"))

        # Trip the circuit
        for _ in range(2):
            with pytest.raises(ConnectionError):
                await cb.call(mock_fn)

        assert cb.state == CircuitState.OPEN

        # Next call should raise CircuitBreakerError
        with pytest.raises(CircuitBreakerError, match="is OPEN"):
            await cb.call(mock_fn)

    @pytest.mark.asyncio
    async def test_half_open_after_recovery_timeout(self):
        cb = CircuitBreaker("test-svc", failure_threshold=2, recovery_timeout=0.1)
        mock_fn = AsyncMock(side_effect=ConnectionError("fail"))

        # Trip the circuit
        for _ in range(2):
            with pytest.raises(ConnectionError):
                await cb.call(mock_fn)

        assert cb.state == CircuitState.OPEN

        # Wait for recovery timeout
        await asyncio.sleep(0.15)

        # Next call should transition to HALF_OPEN then try the call
        # Make the call succeed now
        mock_fn_ok = AsyncMock(return_value="recovered")
        result = await cb.call(mock_fn_ok)
        assert result == "recovered"
        assert cb.state == CircuitState.CLOSED
        assert cb.failure_count == 0

    @pytest.mark.asyncio
    async def test_half_open_failure_reopens(self):
        cb = CircuitBreaker("test-svc", failure_threshold=2, recovery_timeout=0.1)
        fail_fn = AsyncMock(side_effect=ConnectionError("fail"))

        # Trip the circuit
        for _ in range(2):
            with pytest.raises(ConnectionError):
                await cb.call(fail_fn)

        assert cb.state == CircuitState.OPEN

        # Wait for recovery timeout
        await asyncio.sleep(0.15)

        # Call fails again in HALF_OPEN — should go back to OPEN
        with pytest.raises(ConnectionError):
            await cb.call(fail_fn)

        # failure_count incremented again, threshold met so re-opens
        assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_success_resets_failure_count(self):
        cb = CircuitBreaker("test-svc", failure_threshold=5)
        fail_fn = AsyncMock(side_effect=ConnectionError("fail"))
        ok_fn = AsyncMock(return_value="ok")

        # Accumulate some failures
        for _ in range(3):
            with pytest.raises(ConnectionError):
                await cb.call(fail_fn)
        assert cb.failure_count == 3

        # A success resets the count
        await cb.call(ok_fn)
        assert cb.failure_count == 0
        assert cb.state == CircuitState.CLOSED


# ============================================================================
# DLQ / consume_with_retry Tests
# ============================================================================


class TestConsumeWithRetry:
    """Tests for EventBus.consume_with_retry and DLQ logic."""

    def _make_event_bus(self):
        """Create an EventBus with mocked Redis."""
        from shared.events import EventBus

        bus = EventBus("redis://fake:6379")
        bus._redis = AsyncMock()
        return bus

    @pytest.mark.asyncio
    async def test_successful_processing(self):
        bus = self._make_event_bus()
        handler = AsyncMock()

        # Mock consume to return one message
        bus.consume = AsyncMock(return_value=[("msg-1", {"text": "hello", "_retry_count": "0"})])
        bus.ack = AsyncMock()

        await bus.consume_with_retry("stream", "group", "consumer", handler)

        handler.assert_awaited_once_with({"text": "hello", "_retry_count": "0"})
        bus.ack.assert_awaited_once_with("stream", "group", "msg-1")

    @pytest.mark.asyncio
    async def test_retry_on_failure(self):
        bus = self._make_event_bus()
        handler = AsyncMock(side_effect=ValueError("processing error"))

        msg_data = {"text": "hello", "_retry_count": "0"}
        bus.consume = AsyncMock(return_value=[("msg-1", msg_data)])
        bus.ack = AsyncMock()
        bus.publish_raw = AsyncMock(return_value="new-msg-id")

        with patch("asyncio.sleep", new_callable=AsyncMock):
            await bus.consume_with_retry("stream", "group", "consumer", handler, max_retries=3)

        # Should republish with incremented retry count
        bus.publish_raw.assert_awaited_once()
        call_args = bus.publish_raw.call_args
        assert call_args[0][0] == "stream"  # republished to same stream
        assert call_args[0][1]["_retry_count"] == "1"

        # Should ack the original message
        bus.ack.assert_awaited_once_with("stream", "group", "msg-1")

    @pytest.mark.asyncio
    async def test_moves_to_dlq_after_max_retries(self):
        bus = self._make_event_bus()
        handler = AsyncMock(side_effect=ValueError("permanent error"))

        msg_data = {"text": "bad", "_retry_count": "3"}
        bus.consume = AsyncMock(return_value=[("msg-1", msg_data)])
        bus.ack = AsyncMock()
        bus.publish_raw = AsyncMock(return_value="dlq-msg-id")

        await bus.consume_with_retry("mystream", "group", "consumer", handler, max_retries=3)

        # Should publish to DLQ
        bus.publish_raw.assert_awaited_once()
        call_args = bus.publish_raw.call_args
        assert call_args[0][0] == "mystream:dlq"
        assert call_args[0][1]["_original_stream"] == "mystream"
        assert call_args[0][1]["_error"] == "permanent error"
        assert call_args[0][1]["_retry_count"] == "4"

        # Should ack the original
        bus.ack.assert_awaited_once_with("mystream", "group", "msg-1")

    @pytest.mark.asyncio
    async def test_no_messages(self):
        bus = self._make_event_bus()
        handler = AsyncMock()
        bus.consume = AsyncMock(return_value=[])
        bus.ack = AsyncMock()

        await bus.consume_with_retry("stream", "group", "consumer", handler)

        handler.assert_not_awaited()
        bus.ack.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_multiple_messages_mixed(self):
        """One succeeds, one fails — both handled correctly."""
        bus = self._make_event_bus()
        call_count = 0

        async def handler(data):
            nonlocal call_count
            call_count += 1
            if data.get("fail"):
                raise ValueError("fail this one")

        msg_ok = ("msg-1", {"text": "good", "_retry_count": "0"})
        msg_bad = ("msg-2", {"text": "bad", "fail": "true", "_retry_count": "0"})

        bus.consume = AsyncMock(return_value=[msg_ok, msg_bad])
        bus.ack = AsyncMock()
        bus.publish_raw = AsyncMock(return_value="new-id")

        with patch("asyncio.sleep", new_callable=AsyncMock):
            await bus.consume_with_retry("stream", "group", "consumer", handler, max_retries=3)

        assert call_count == 2
        # msg-1 acked, msg-2 acked (after republish for retry)
        assert bus.ack.await_count == 2


class TestGetDlqMessages:
    """Tests for EventBus.get_dlq_messages."""

    @pytest.mark.asyncio
    async def test_returns_dlq_messages(self):
        from shared.events import EventBus

        bus = EventBus("redis://fake:6379")
        mock_redis = AsyncMock()
        mock_redis.xrange = AsyncMock(return_value=[
            ("dlq-1", {"text": "failed1", "_error": "boom"}),
            ("dlq-2", {"text": "failed2", "_error": "crash"}),
        ])
        bus._redis = mock_redis

        messages = await bus.get_dlq_messages("mystream", count=50)

        mock_redis.xrange.assert_awaited_once_with("mystream:dlq", count=50)
        assert len(messages) == 2
        assert messages[0] == ("dlq-1", {"text": "failed1", "_error": "boom"})


class TestReprocessDlq:
    """Tests for EventBus.reprocess_dlq."""

    @pytest.mark.asyncio
    async def test_moves_messages_back(self):
        from shared.events import EventBus

        bus = EventBus("redis://fake:6379")
        mock_redis = AsyncMock()
        mock_redis.xrange = AsyncMock(return_value=[
            ("dlq-1", {"text": "retry-me", "_error": "old-err", "_original_stream": "mystream", "_retry_count": "4"}),
        ])
        mock_redis.xdel = AsyncMock()
        bus._redis = mock_redis
        bus.publish_raw = AsyncMock(return_value="new-msg-id")

        moved = await bus.reprocess_dlq("mystream")

        assert moved == 1
        # Should republish with reset retry count and no DLQ metadata
        call_args = bus.publish_raw.call_args
        assert call_args[0][0] == "mystream"
        data = call_args[0][1]
        assert "_error" not in data
        assert "_original_stream" not in data
        assert data["_retry_count"] == "0"

        # Should delete from DLQ
        mock_redis.xdel.assert_awaited_once_with("mystream:dlq", "dlq-1")

    @pytest.mark.asyncio
    async def test_empty_dlq(self):
        from shared.events import EventBus

        bus = EventBus("redis://fake:6379")
        mock_redis = AsyncMock()
        mock_redis.xrange = AsyncMock(return_value=[])
        bus._redis = mock_redis

        moved = await bus.reprocess_dlq("mystream")
        assert moved == 0


# ============================================================================
# Gateway Middleware Tests
# ============================================================================


class TestRequestIDMiddleware:
    """Tests for RequestIDMiddleware in services/gateway/app/main.py."""

    @pytest.mark.asyncio
    async def test_generates_request_id(self):
        from starlette.requests import Request
        from starlette.responses import Response

        from services.gateway.app.main import RequestIDMiddleware

        middleware = RequestIDMiddleware(app=MagicMock())

        # Build a minimal ASGI request scope
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/test",
            "headers": [],
            "query_string": b"",
        }
        request = Request(scope)

        response = Response(content="ok", status_code=200)

        async def call_next(req):
            return response

        result = await middleware.dispatch(request, call_next)

        # Should have set X-Request-ID on the response
        assert "x-request-id" in result.headers
        # Should be a valid UUID
        import uuid

        uuid.UUID(result.headers["x-request-id"])  # raises if invalid

    @pytest.mark.asyncio
    async def test_preserves_existing_request_id(self):
        from starlette.requests import Request
        from starlette.responses import Response

        from services.gateway.app.main import RequestIDMiddleware

        middleware = RequestIDMiddleware(app=MagicMock())

        existing_id = "my-custom-request-id-123"
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/test",
            "headers": [(b"x-request-id", existing_id.encode())],
            "query_string": b"",
        }
        request = Request(scope)
        response = Response(content="ok", status_code=200)

        async def call_next(req):
            return response

        result = await middleware.dispatch(request, call_next)
        assert result.headers["x-request-id"] == existing_id


class TestRateLimitMiddlewareHelpers:
    """Tests for RateLimitMiddleware helper functions and dispatch logic."""

    def test_client_identifier_with_api_key(self):
        from services.gateway.app.middleware import _client_identifier

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/mentions",
            "headers": [(b"x-api-key", b"my-secret-key")],
            "query_string": b"",
        }
        from starlette.requests import Request

        request = Request(scope)
        result = _client_identifier(request)
        assert result == "apikey:my-secret-key"

    def test_client_identifier_with_ip(self):
        from services.gateway.app.middleware import _client_identifier

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/mentions",
            "headers": [],
            "query_string": b"",
            "client": ("192.168.1.1", 12345),
        }
        from starlette.requests import Request

        request = Request(scope)
        result = _client_identifier(request)
        assert result == "ip:192.168.1.1"

    def test_client_identifier_with_forwarded_for(self):
        from services.gateway.app.middleware import _client_identifier

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(b"x-forwarded-for", b"10.0.0.1, 10.0.0.2")],
            "query_string": b"",
        }
        from starlette.requests import Request

        request = Request(scope)
        result = _client_identifier(request)
        assert result == "ip:10.0.0.1"

    @pytest.mark.asyncio
    async def test_skip_paths(self):
        """Health and docs paths should bypass rate limiting entirely."""
        from services.gateway.app.middleware import RateLimitMiddleware

        middleware = RateLimitMiddleware(app=MagicMock())

        for path in ["/health", "/docs", "/openapi.json"]:
            scope = {
                "type": "http",
                "method": "GET",
                "path": path,
                "headers": [],
                "query_string": b"",
            }
            from starlette.requests import Request
            from starlette.responses import Response

            request = Request(scope)
            response = Response(content="ok", status_code=200)

            async def call_next(req):
                return response

            result = await middleware.dispatch(request, call_next)
            assert result.status_code == 200

    @pytest.mark.asyncio
    async def test_fail_open_on_connection_error(self):
        """When rate limiter is unreachable, request should pass through (fail-open)."""
        import httpx

        from services.gateway.app.middleware import RateLimitMiddleware

        middleware = RateLimitMiddleware(app=MagicMock())

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/mentions",
            "headers": [(b"x-api-key", b"test-key")],
            "query_string": b"",
            "client": ("127.0.0.1", 9999),
        }
        from starlette.requests import Request
        from starlette.responses import Response

        request = Request(scope)
        response = Response(content="ok", status_code=200)

        async def call_next(req):
            return response

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("unreachable"))

        with patch("services.gateway.app.middleware.get_http_client", return_value=mock_client):
            result = await middleware.dispatch(request, call_next)

        assert result.status_code == 200  # fail-open

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self):
        """When rate limiter says not allowed, return 429."""
        from services.gateway.app.middleware import RateLimitMiddleware

        middleware = RateLimitMiddleware(app=MagicMock())

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/mentions",
            "headers": [(b"x-api-key", b"test-key")],
            "query_string": b"",
            "client": ("127.0.0.1", 9999),
        }
        from starlette.requests import Request
        from starlette.responses import Response

        request = Request(scope)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"allowed": False, "wait_seconds": 5.5}

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("services.gateway.app.middleware.get_http_client", return_value=mock_client):
            result = await middleware.dispatch(request, lambda req: Response("ok", 200))

        assert result.status_code == 429
        assert result.headers["retry-after"] == "6"  # ceil(5.5)

    @pytest.mark.asyncio
    async def test_allowed_request_passes_through(self):
        """When rate limiter allows, request passes through."""
        from services.gateway.app.middleware import RateLimitMiddleware

        middleware = RateLimitMiddleware(app=MagicMock())

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/mentions",
            "headers": [(b"x-api-key", b"test-key")],
            "query_string": b"",
            "client": ("127.0.0.1", 9999),
        }
        from starlette.requests import Request
        from starlette.responses import Response

        request = Request(scope)
        response = Response(content="ok", status_code=200)

        async def call_next(req):
            return response

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"allowed": True}

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("services.gateway.app.middleware.get_http_client", return_value=mock_client):
            result = await middleware.dispatch(request, call_next)

        assert result.status_code == 200

    @pytest.mark.asyncio
    async def test_404_from_rate_limiter_allows_through(self):
        """When rate limiter returns 404 (no quota configured), allow through."""
        from services.gateway.app.middleware import RateLimitMiddleware

        middleware = RateLimitMiddleware(app=MagicMock())

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/data",
            "headers": [],
            "query_string": b"",
            "client": ("10.0.0.1", 8080),
        }
        from starlette.requests import Request
        from starlette.responses import Response

        request = Request(scope)
        response = Response(content="ok", status_code=200)

        async def call_next(req):
            return response

        mock_resp = MagicMock()
        mock_resp.status_code = 404

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("services.gateway.app.middleware.get_http_client", return_value=mock_client):
            result = await middleware.dispatch(request, call_next)

        assert result.status_code == 200
