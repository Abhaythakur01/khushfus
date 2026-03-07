"""Tests for the Redis Streams event bus event dataclasses."""
import pytest
from dataclasses import asdict

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
    ExportRequestEvent,
    MediaAnalysisEvent,
    MediaResultEvent,
    PublishRequestEvent,
    RawMentionEvent,
    ReportRequestEvent,
    WorkflowTriggerEvent,
)


class TestRawMentionEvent:
    def test_creation(self):
        event = RawMentionEvent(
            project_id=1,
            platform="twitter",
            source_id="123",
            source_url="https://twitter.com/...",
            text="Hello world",
            author_name="John",
            author_handle="@john",
        )
        d = asdict(event)
        assert d["project_id"] == 1
        assert d["likes"] == 0  # default
        assert d["shares"] == 0
        assert d["comments"] == 0
        assert d["reach"] == 0

    def test_with_engagement_metrics(self):
        event = RawMentionEvent(
            project_id=1,
            platform="twitter",
            source_id="456",
            source_url="https://twitter.com/...",
            text="Popular tweet",
            author_name="Jane",
            author_handle="@jane",
            likes=100,
            shares=50,
            comments=20,
            reach=5000,
            author_followers=10000,
        )
        assert event.likes == 100
        assert event.author_followers == 10000


class TestAnalyzedMentionEvent:
    def test_defaults(self):
        event = AnalyzedMentionEvent(
            project_id=1,
            platform="twitter",
            source_id="123",
            source_url="",
            text="Test",
            author_name="A",
            author_handle="@a",
        )
        assert event.sentiment == "neutral"
        assert event.sentiment_score == 0.0
        assert event.language == "en"
        assert event.sarcasm is False
        assert event.sentiment_tier == "vader"

    def test_with_nlp_results(self):
        event = AnalyzedMentionEvent(
            project_id=1,
            platform="facebook",
            source_id="789",
            source_url="https://facebook.com/...",
            text="I love this product!",
            author_name="Bob",
            author_handle="bob",
            sentiment="positive",
            sentiment_score=0.85,
            emotions='{"joy": 0.9, "anger": 0.01}',
            sarcasm=False,
            sentiment_tier="transformer",
        )
        assert event.sentiment == "positive"
        assert event.sentiment_tier == "transformer"


class TestAlertEvent:
    def test_creation(self):
        event = AlertEvent(
            project_id=1,
            alert_type="spike",
            severity="high",
            title="Volume Spike",
            description="2x normal volume",
        )
        assert event.severity == "high"
        assert event.data == ""  # default
        assert event.timestamp == ""

    def test_with_data(self):
        event = AlertEvent(
            project_id=2,
            alert_type="negative_surge",
            severity="critical",
            title="Negative Surge",
            description="Negative mentions increased 5x",
            data='{"count": 500, "baseline": 100}',
        )
        assert event.alert_type == "negative_surge"


class TestAuditEvent:
    def test_creation(self):
        event = AuditEvent(
            organization_id=1,
            user_id=1,
            action="create",
            resource_type="project",
            resource_id=5,
        )
        assert event.action == "create"
        assert event.resource_id == 5
        assert event.details == ""
        assert event.ip_address == ""


class TestMediaEvents:
    def test_media_analysis_event(self):
        event = MediaAnalysisEvent(
            mention_id=1,
            project_id=1,
            media_url="https://example.com/image.jpg",
            media_type="image",
        )
        assert event.media_type == "image"
        assert event.source_platform == ""

    def test_media_result_event(self):
        event = MediaResultEvent(
            mention_id=1,
            ocr_text="Brand Logo Text",
            labels='["logo", "product"]',
        )
        assert event.mention_id == 1
        assert event.transcript == ""


class TestEnrichmentEvents:
    def test_enrichment_event(self):
        event = EnrichmentEvent(
            mention_id=1,
            project_id=1,
            author_handle="@influencer",
            author_platform="twitter",
            author_followers=50000,
        )
        assert event.author_followers == 50000

    def test_enrichment_result_event(self):
        event = EnrichmentResultEvent(
            mention_id=1,
            influence_score=0.85,
            is_bot=False,
            org_name="Acme Corp",
            virality_score=0.7,
        )
        assert event.is_bot is False


class TestOtherEvents:
    def test_report_request_event(self):
        event = ReportRequestEvent(project_id=1, report_type="weekly")
        assert event.requested_by == ""

    def test_export_request_event(self):
        event = ExportRequestEvent(
            export_job_id=1,
            project_id=1,
            export_format="csv",
        )
        assert event.filters_json == ""

    def test_publish_request_event(self):
        event = PublishRequestEvent(
            post_id=1,
            project_id=1,
            platform="twitter",
            content="Hello world",
        )
        assert event.reply_to_mention_id == 0

    def test_workflow_trigger_event(self):
        event = WorkflowTriggerEvent(
            workflow_id=1,
            project_id=1,
            mention_id=42,
        )
        assert event.trigger_data == ""


class TestStreamNames:
    def test_stream_names_defined(self):
        assert STREAM_RAW_MENTIONS == "mentions:raw"
        assert STREAM_ANALYZED_MENTIONS == "mentions:analyzed"
        assert STREAM_ALERTS == "alerts:trigger"
        assert STREAM_REPORT_REQUESTS == "reports:request"
        assert STREAM_REPORT_READY == "reports:ready"
        assert STREAM_MEDIA_ANALYSIS == "media:analyze"
        assert STREAM_MEDIA_RESULTS == "media:results"
        assert STREAM_ENRICHMENT == "enrichment:request"
        assert STREAM_ENRICHMENT_RESULTS == "enrichment:results"
        assert STREAM_EXPORT == "export:request"
        assert STREAM_PUBLISH == "publish:request"
        assert STREAM_WORKFLOW == "workflow:trigger"
        assert STREAM_AUDIT == "audit:log"
        assert STREAM_COLLECTION_REQUEST == "collection:request"
