"""Integration tests for the mention processing pipeline.

Tests EventBus creation, event publishing/consuming contracts, and
stream name constants.
"""

import json
from dataclasses import asdict
from unittest.mock import AsyncMock

import pytest

from shared.events import (
    STREAM_ALERTS,
    STREAM_ANALYZED_MENTIONS,
    STREAM_AUDIT,
    STREAM_COLLECTION_REQUEST,
    STREAM_ENRICHMENT,
    STREAM_ENRICHMENT_RESULTS,
    STREAM_EXPORT,
    STREAM_MEDIA_ANALYSIS,
    STREAM_MEDIA_RESULTS,
    STREAM_PUBLISH,
    STREAM_RAW_MENTIONS,
    STREAM_REPORT_READY,
    STREAM_REPORT_REQUESTS,
    STREAM_WORKFLOW,
    AlertEvent,
    AnalyzedMentionEvent,
    AuditEvent,
    EnrichmentEvent,
    EnrichmentResultEvent,
    EventBus,
    ExportRequestEvent,
    MediaAnalysisEvent,
    MediaResultEvent,
    PublishRequestEvent,
    RawMentionEvent,
    ReportRequestEvent,
    WorkflowTriggerEvent,
)


@pytest.mark.integration
class TestEventBusCreation:
    """Test EventBus instantiation and connection lifecycle."""

    def test_event_bus_creation(self):
        """EventBus can be created with a URL."""
        bus = EventBus("redis://localhost:6379/0")
        assert bus.redis_url == "redis://localhost:6379/0"
        assert bus._redis is None

    def test_event_bus_different_urls(self):
        """EventBus stores the configured URL."""
        bus1 = EventBus("redis://host1:6379/0")
        bus2 = EventBus("redis://host2:6380/1")
        assert bus1.redis_url != bus2.redis_url

    async def test_close_without_connect(self):
        """Closing an EventBus that was never connected must not raise."""
        bus = EventBus("redis://localhost:6379/0")
        await bus.close()  # Should not raise


@pytest.mark.integration
class TestStreamNameConstants:
    """Verify all stream name constants are properly defined."""

    def test_all_stream_names_are_strings(self):
        """All STREAM_* constants must be non-empty strings."""
        streams = [
            STREAM_RAW_MENTIONS, STREAM_ANALYZED_MENTIONS, STREAM_ALERTS,
            STREAM_REPORT_REQUESTS, STREAM_REPORT_READY,
            STREAM_MEDIA_ANALYSIS, STREAM_MEDIA_RESULTS,
            STREAM_ENRICHMENT, STREAM_ENRICHMENT_RESULTS,
            STREAM_EXPORT, STREAM_PUBLISH, STREAM_WORKFLOW,
            STREAM_AUDIT, STREAM_COLLECTION_REQUEST,
        ]
        for stream in streams:
            assert isinstance(stream, str)
            assert len(stream) > 0
            assert ":" in stream, f"Stream names should follow 'category:action' format: {stream}"

    def test_stream_names_are_unique(self):
        """No two streams share the same name."""
        streams = [
            STREAM_RAW_MENTIONS, STREAM_ANALYZED_MENTIONS, STREAM_ALERTS,
            STREAM_REPORT_REQUESTS, STREAM_REPORT_READY,
            STREAM_MEDIA_ANALYSIS, STREAM_MEDIA_RESULTS,
            STREAM_ENRICHMENT, STREAM_ENRICHMENT_RESULTS,
            STREAM_EXPORT, STREAM_PUBLISH, STREAM_WORKFLOW,
            STREAM_AUDIT, STREAM_COLLECTION_REQUEST,
        ]
        assert len(streams) == len(set(streams)), "Duplicate stream names found"


@pytest.mark.integration
class TestEventDataclasses:
    """Verify all event dataclasses can be instantiated and serialized."""

    def test_raw_mention_event_defaults(self):
        """RawMentionEvent must have sensible defaults for optional fields."""
        raw = RawMentionEvent(
            project_id=1, platform="twitter", source_id="x",
            source_url="", text="hello",
            author_name="User", author_handle="@user",
        )
        assert raw.author_followers == 0
        assert raw.likes == 0
        assert raw.shares == 0
        assert raw.comments == 0
        assert raw.reach == 0
        assert raw.published_at == ""
        assert raw.matched_keywords == ""

    def test_analyzed_mention_event_defaults(self):
        """AnalyzedMentionEvent must default NLP fields sensibly."""
        analyzed = AnalyzedMentionEvent(
            project_id=1, platform="twitter", source_id="x",
            source_url="", text="hello",
            author_name="User", author_handle="@user",
        )
        assert analyzed.sentiment == "neutral"
        assert analyzed.sentiment_score == 0.0
        assert analyzed.language == "en"
        assert analyzed.topics == ""
        assert analyzed.sarcasm is False
        assert analyzed.sentiment_tier == "vader"

    def test_alert_event_serialization(self):
        """AlertEvent must serialize to a flat dict."""
        alert = AlertEvent(
            project_id=1,
            alert_type="spike",
            severity="high",
            title="Volume spike detected",
            description="Mentions increased 300% in the last hour",
            data=json.dumps({"current": 300, "baseline": 100}),
        )
        data = asdict(alert)
        assert data["alert_type"] == "spike"
        assert data["severity"] == "high"
        assert json.loads(data["data"])["current"] == 300

    def test_report_request_event(self):
        """ReportRequestEvent fields."""
        event = ReportRequestEvent(project_id=5, report_type="weekly", requested_by="admin@co.com")
        data = asdict(event)
        assert data["project_id"] == 5
        assert data["report_type"] == "weekly"

    def test_media_analysis_event(self):
        """MediaAnalysisEvent fields."""
        event = MediaAnalysisEvent(
            mention_id=10, project_id=1,
            media_url="https://example.com/img.jpg",
            media_type="image",
        )
        assert event.media_type == "image"

    def test_media_result_event(self):
        """MediaResultEvent fields."""
        event = MediaResultEvent(mention_id=10, ocr_text="SALE 50% OFF", logo_detected="Nike")
        data = asdict(event)
        assert data["ocr_text"] == "SALE 50% OFF"

    def test_enrichment_events(self):
        """EnrichmentEvent and EnrichmentResultEvent roundtrip."""
        req = EnrichmentEvent(
            mention_id=1, project_id=1,
            author_handle="@influencer", author_platform="twitter",
            author_followers=100000,
        )
        result = EnrichmentResultEvent(
            mention_id=1, influence_score=0.95,
            is_bot=False, org_name="Corp Inc",
        )
        assert asdict(req)["author_followers"] == 100000
        assert asdict(result)["influence_score"] == 0.95

    def test_export_request_event(self):
        """ExportRequestEvent fields."""
        event = ExportRequestEvent(
            export_job_id=1, project_id=1, export_format="csv",
            filters_json=json.dumps({"platform": "twitter"}),
        )
        assert json.loads(asdict(event)["filters_json"])["platform"] == "twitter"

    def test_publish_request_event(self):
        """PublishRequestEvent fields."""
        event = PublishRequestEvent(
            post_id=1, project_id=1, platform="twitter",
            content="Hello world!", reply_to_mention_id=42,
        )
        assert event.reply_to_mention_id == 42

    def test_workflow_trigger_event(self):
        """WorkflowTriggerEvent fields."""
        event = WorkflowTriggerEvent(
            workflow_id=1, project_id=1, mention_id=5,
            trigger_data=json.dumps({"condition": "negative_spike"}),
        )
        assert json.loads(event.trigger_data)["condition"] == "negative_spike"

    def test_audit_event(self):
        """AuditEvent fields."""
        event = AuditEvent(
            organization_id=1, user_id=10, action="delete",
            resource_type="mention", resource_id=100,
            ip_address="192.168.1.1",
        )
        assert event.action == "delete"
        assert event.ip_address == "192.168.1.1"


@pytest.mark.integration
class TestEventBusPublish:
    """Test EventBus publish/consume with mocked Redis."""

    async def test_publish_calls_xadd(self):
        """publish must call Redis XADD with the correct stream."""
        bus = EventBus("redis://localhost:6379/0")
        mock_redis = AsyncMock()
        mock_redis.xadd = AsyncMock(return_value="1-0")
        bus._redis = mock_redis

        raw = RawMentionEvent(
            project_id=1, platform="twitter", source_id="tw_1",
            source_url="", text="test", author_name="A", author_handle="@a",
        )
        msg_id = await bus.publish(STREAM_RAW_MENTIONS, raw)
        assert msg_id == "1-0"
        mock_redis.xadd.assert_awaited_once()

    async def test_publish_flattens_to_strings(self):
        """All values published to Redis must be strings."""
        bus = EventBus("redis://localhost:6379/0")
        mock_redis = AsyncMock()
        mock_redis.xadd = AsyncMock(return_value="1-0")
        bus._redis = mock_redis

        raw = RawMentionEvent(
            project_id=99, platform="facebook", source_id="fb_1",
            source_url="https://fb.com/1", text="Test mention",
            author_name="Bob", author_handle="@bob",
            author_followers=5000, likes=42,
        )
        await bus.publish(STREAM_RAW_MENTIONS, raw)

        published = mock_redis.xadd.call_args[0][1]
        for k, v in published.items():
            assert isinstance(v, str), f"{k} value is {type(v)}, expected str"

    async def test_ensure_group_creates_consumer_group(self):
        """ensure_group must call XGROUP CREATE."""
        bus = EventBus("redis://localhost:6379/0")
        mock_redis = AsyncMock()
        mock_redis.xgroup_create = AsyncMock()
        bus._redis = mock_redis

        await bus.ensure_group(STREAM_RAW_MENTIONS, "test-group")
        mock_redis.xgroup_create.assert_awaited_once_with(
            STREAM_RAW_MENTIONS, "test-group", id="0", mkstream=True,
        )

    async def test_ensure_group_ignores_busygroup(self):
        """ensure_group must not raise if the group already exists."""
        import redis.asyncio as aioredis

        bus = EventBus("redis://localhost:6379/0")
        mock_redis = AsyncMock()
        mock_redis.xgroup_create = AsyncMock(
            side_effect=aioredis.ResponseError("BUSYGROUP Consumer Group name already exists"),
        )
        bus._redis = mock_redis

        # Should not raise
        await bus.ensure_group(STREAM_RAW_MENTIONS, "existing-group")

    async def test_ack_calls_xack(self):
        """ack must call Redis XACK with correct arguments."""
        bus = EventBus("redis://localhost:6379/0")
        mock_redis = AsyncMock()
        mock_redis.xack = AsyncMock()
        bus._redis = mock_redis

        await bus.ack(STREAM_RAW_MENTIONS, "group-1", "msg-123")
        mock_redis.xack.assert_awaited_once_with(STREAM_RAW_MENTIONS, "group-1", "msg-123")

    async def test_consume_returns_messages(self):
        """consume must return a list of (msg_id, data) tuples."""
        bus = EventBus("redis://localhost:6379/0")
        mock_redis = AsyncMock()
        mock_redis.xreadgroup = AsyncMock(return_value=[
            (STREAM_RAW_MENTIONS, [
                ("1-0", {"project_id": "1", "text": "hello"}),
                ("2-0", {"project_id": "2", "text": "world"}),
            ]),
        ])
        bus._redis = mock_redis

        messages = await bus.consume(
            STREAM_RAW_MENTIONS, "group", "consumer", count=10, block_ms=0,
        )
        assert len(messages) == 2
        assert messages[0][0] == "1-0"
        assert messages[1][1]["text"] == "world"
