"""End-to-end pipeline tests for the mention processing flow.

Tests the complete event contract chain:
  Collector -> mentions:raw -> Analyzer -> mentions:analyzed -> Query Service

All external dependencies (Redis, NLP models, DB, Elasticsearch) are mocked.
The tests verify that event dataclass contracts are compatible across services.
"""

import json
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from shared.events import (
    STREAM_ANALYZED_MENTIONS,
    STREAM_RAW_MENTIONS,
    AnalyzedMentionEvent,
    EventBus,
    RawMentionEvent,
)

# ---------------------------------------------------------------------------
# Pre-import mocking for the analyzer module
# ---------------------------------------------------------------------------
# The analyzer service module imports src.nlp.analyzer which has heavy NLP
# dependencies (VADER, spaCy, langdetect, etc.). We mock it before importing
# so the module can load without those dependencies.
# ---------------------------------------------------------------------------

_mock_sentiment_analyzer_cls = MagicMock()
_mock_nlp_module = MagicMock()
_mock_nlp_module.SentimentAnalyzer = _mock_sentiment_analyzer_cls

# Also mock the settings import that src.nlp.analyzer uses
_mock_settings_module = MagicMock()
_mock_settings_module.settings = MagicMock()

# Patch sys.modules before importing the analyzer service
sys.modules.setdefault("vaderSentiment", MagicMock())
sys.modules.setdefault("vaderSentiment.vaderSentiment", MagicMock())
sys.modules.setdefault("langdetect", MagicMock())
sys.modules.setdefault("src.config", MagicMock())
sys.modules.setdefault("src.config.settings", _mock_settings_module)
sys.modules.setdefault("src.nlp", MagicMock())
sys.modules.setdefault("src.nlp.analyzer", _mock_nlp_module)

from services.analyzer_service.app.main import analyze_mention  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_raw_mention(**overrides) -> RawMentionEvent:
    """Build a RawMentionEvent with sensible defaults."""
    defaults = {
        "project_id": 1,
        "platform": "twitter",
        "source_id": "tw_12345",
        "source_url": "https://twitter.com/user/status/12345",
        "text": "I absolutely love this brand! Great product.",
        "author_name": "Jane Doe",
        "author_handle": "@janedoe",
        "author_followers": 5000,
        "author_profile_url": "https://twitter.com/janedoe",
        "likes": 42,
        "shares": 10,
        "comments": 5,
        "reach": 15000,
        "published_at": datetime.now(timezone.utc).isoformat(),
        "matched_keywords": "brand,product",
    }
    defaults.update(overrides)
    return RawMentionEvent(**defaults)


def _flatten_event(event) -> dict:
    """Flatten a dataclass event the same way EventBus.publish does."""
    data = asdict(event)
    return {
        k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
        for k, v in data.items()
    }


def _make_analysis_result():
    """Build a mock AnalysisResult matching the NLP analyzer output."""
    mock = MagicMock()
    mock.sentiment = "positive"
    mock.sentiment_score = 0.85
    mock.language = "en"
    mock.topics = ["brand", "product"]
    mock.entities = [{"text": "brand", "label": "ORG"}]
    mock.emotions = {"joy": 0.9, "anger": 0.01, "surprise": 0.05}
    mock.ner_entities = {"persons": ["Jane Doe"], "organizations": ["Brand Corp"]}
    mock.aspects = [{"aspect": "product", "sentiment": "positive", "score": 0.9}]
    mock.sarcasm = False
    mock.sentiment_tier = "vader"
    return mock


def _setup_analyzer_mock():
    """Configure the module-level analyzer mock to return a valid result."""
    import services.analyzer_service.app.main as analyzer_mod

    analyzer_mod.analyzer.analyze.return_value = _make_analysis_result()
    return analyzer_mod.analyzer


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestEventContracts:
    """Verify that event dataclass fields are compatible across services."""

    def test_raw_mention_event_fields(self):
        """RawMentionEvent must have all fields the collector publishes."""
        raw = _make_raw_mention()
        data = asdict(raw)

        required_fields = [
            "project_id", "platform", "source_id", "source_url", "text",
            "author_name", "author_handle", "author_followers",
            "likes", "shares", "comments", "reach",
            "published_at", "matched_keywords",
        ]
        for field_name in required_fields:
            assert field_name in data, f"Missing field: {field_name}"

    def test_analyzed_mention_event_extends_raw(self):
        """AnalyzedMentionEvent must carry all raw fields plus NLP outputs."""
        raw_fields = set(asdict(_make_raw_mention()).keys())
        analyzed = AnalyzedMentionEvent(
            project_id=1, platform="twitter", source_id="x",
            source_url="", text="test",
            author_name="", author_handle="",
        )
        analyzed_fields = set(asdict(analyzed).keys())

        missing = raw_fields - analyzed_fields
        assert not missing, f"AnalyzedMentionEvent missing raw fields: {missing}"

        nlp_fields = {"sentiment", "sentiment_score", "language", "topics",
                       "entities", "emotions", "entities_json", "aspects_json",
                       "sarcasm", "sentiment_tier"}
        missing_nlp = nlp_fields - analyzed_fields
        assert not missing_nlp, f"AnalyzedMentionEvent missing NLP fields: {missing_nlp}"

    def test_raw_event_flattening_roundtrip(self):
        """Verify that flattening a raw event preserves all data."""
        raw = _make_raw_mention()
        flat = _flatten_event(raw)

        for k, v in flat.items():
            assert isinstance(v, str), f"Field {k} is not a string: {type(v)}"

        assert flat["project_id"] == str(raw.project_id)
        assert flat["platform"] == raw.platform
        assert flat["text"] == raw.text

    def test_analyzed_event_flattening_roundtrip(self):
        """Verify that flattening an analyzed event preserves all data."""
        analyzed = AnalyzedMentionEvent(
            project_id=1, platform="twitter", source_id="x",
            source_url="https://example.com", text="Great product!",
            author_name="Jane", author_handle="@jane",
            sentiment="positive", sentiment_score=0.85,
            topics="brand,product",
            entities=json.dumps([{"text": "brand", "label": "ORG"}]),
            emotions=json.dumps({"joy": 0.9}),
            entities_json=json.dumps({"persons": ["Jane"]}),
            aspects_json=json.dumps([{"aspect": "product", "sentiment": "positive"}]),
            sarcasm=True,
            sentiment_tier="transformer",
        )
        flat = _flatten_event(analyzed)
        for v in flat.values():
            assert isinstance(v, str)

        assert flat["sentiment"] == "positive"
        assert flat["sarcasm"] == "True"


@pytest.mark.integration
class TestAnalyzerProcessing:
    """Test the analyzer's analyze_mention function with mocked NLP."""

    def test_analyze_mention_produces_valid_event(self):
        """analyze_mention must return a valid AnalyzedMentionEvent."""
        _setup_analyzer_mock()

        raw = _make_raw_mention()
        raw_data = _flatten_event(raw)
        result = analyze_mention(raw_data)

        assert isinstance(result, AnalyzedMentionEvent)
        assert result.project_id == raw.project_id
        assert result.platform == raw.platform
        assert result.source_id == raw.source_id
        assert result.text == raw.text
        assert result.sentiment == "positive"
        assert result.sentiment_score == 0.85
        assert result.language == "en"
        assert "brand" in result.topics
        assert result.sarcasm is False
        assert result.sentiment_tier == "vader"

    def test_analyze_mention_preserves_engagement_metrics(self):
        """Engagement metrics from raw mention must pass through to analyzed event."""
        _setup_analyzer_mock()

        raw = _make_raw_mention(likes=100, shares=50, comments=25)
        raw_data = _flatten_event(raw)
        result = analyze_mention(raw_data)

        assert result.likes == 100
        assert result.shares == 50
        assert result.comments == 25

    def test_analyze_mention_calculates_engagement_for_tiering(self):
        """The analyzer must calculate total engagement and pass it to NLP."""
        mock_analyzer = _setup_analyzer_mock()

        raw = _make_raw_mention(likes=50, shares=30, comments=20)
        raw_data = _flatten_event(raw)
        analyze_mention(raw_data)

        call_args = mock_analyzer.analyze.call_args
        assert call_args.kwargs.get("engagement") == 100  # 50+30+20

    def test_analyze_mention_handles_empty_text(self):
        """The analyzer must handle mentions with empty text gracefully."""
        mock_analyzer = _setup_analyzer_mock()
        mock_result = _make_analysis_result()
        mock_result.sentiment = "neutral"
        mock_result.sentiment_score = 0.0
        mock_result.topics = []
        mock_result.entities = []
        mock_analyzer.analyze.return_value = mock_result

        raw = _make_raw_mention(text="")
        raw_data = _flatten_event(raw)
        result = analyze_mention(raw_data)

        assert isinstance(result, AnalyzedMentionEvent)
        assert result.text == ""
        assert result.sentiment == "neutral"

    def test_analyze_mention_serializes_nlp_fields_as_json(self):
        """NLP fields (entities, emotions, aspects) must be JSON-serialized strings."""
        _setup_analyzer_mock()

        raw = _make_raw_mention()
        raw_data = _flatten_event(raw)
        result = analyze_mention(raw_data)

        entities = json.loads(result.entities)
        assert isinstance(entities, list)

        emotions = json.loads(result.emotions)
        assert isinstance(emotions, dict)
        assert "joy" in emotions

        ner = json.loads(result.entities_json)
        assert isinstance(ner, dict)

        aspects = json.loads(result.aspects_json)
        assert isinstance(aspects, list)


@pytest.mark.integration
class TestFullPipelineFlow:
    """Test the complete Collector -> Analyzer -> Query flow with mocks."""

    async def test_collector_to_analyzer_event_compatibility(self):
        """Events published by collector must be consumable by analyzer."""
        _setup_analyzer_mock()

        raw = _make_raw_mention(
            project_id=42,
            platform="reddit",
            text="This product changed my life!",
            author_handle="u/redditor123",
            likes=500,
            shares=100,
            comments=75,
        )
        flat_data = _flatten_event(raw)
        analyzed = analyze_mention(flat_data)

        assert analyzed.project_id == 42
        assert analyzed.platform == "reddit"
        assert analyzed.text == "This product changed my life!"
        assert analyzed.author_handle == "u/redditor123"
        assert analyzed.likes == 500
        assert analyzed.shares == 100
        assert analyzed.comments == 75

        assert analyzed.sentiment in ("positive", "negative", "neutral", "mixed")
        assert -1.0 <= analyzed.sentiment_score <= 1.0
        assert analyzed.language == "en"

    async def test_analyzer_to_query_event_compatibility(self):
        """Events published by analyzer must have fields the query service expects."""
        _setup_analyzer_mock()

        raw = _make_raw_mention()
        flat_data = _flatten_event(raw)
        analyzed = analyze_mention(flat_data)
        analyzed_flat = _flatten_event(analyzed)

        query_required_fields = [
            "project_id", "source_id", "platform", "source_url", "text",
            "author_name", "author_handle", "author_followers",
            "likes", "shares", "comments", "reach",
            "sentiment", "sentiment_score", "language",
            "matched_keywords", "topics", "entities",
            "published_at",
        ]
        for field_name in query_required_fields:
            assert field_name in analyzed_flat, (
                f"Query service needs '{field_name}' but it's missing from analyzed event"
            )

    async def test_query_service_store_mention_with_analyzed_data(self):
        """Verify the query service's store_mention can parse analyzed event data."""
        _setup_analyzer_mock()

        raw = _make_raw_mention(published_at="2025-06-15T10:30:00")
        flat_data = _flatten_event(raw)
        analyzed = analyze_mention(flat_data)
        analyzed_flat = _flatten_event(analyzed)

        project_id = int(analyzed_flat.get("project_id", 0))
        assert project_id == raw.project_id

        source_id = analyzed_flat.get("source_id", "")
        assert source_id == raw.source_id

        sentiment_score = float(analyzed_flat.get("sentiment_score", 0.0))
        assert isinstance(sentiment_score, float)

        likes = int(analyzed_flat.get("likes", 0))
        assert likes == raw.likes

        pub_str = analyzed_flat.get("published_at", "")
        if pub_str:
            parsed = datetime.fromisoformat(pub_str)
            assert isinstance(parsed, datetime)

    async def test_multiple_platforms_pipeline(self):
        """Pipeline must handle mentions from various platforms consistently."""
        _setup_analyzer_mock()

        platforms = ["twitter", "facebook", "instagram", "reddit", "youtube", "tiktok"]
        for platform in platforms:
            raw = _make_raw_mention(
                platform=platform,
                source_id=f"{platform}_001",
            )
            flat = _flatten_event(raw)
            analyzed = analyze_mention(flat)

            assert analyzed.platform == platform
            assert analyzed.source_id == f"{platform}_001"
            assert isinstance(analyzed, AnalyzedMentionEvent)


@pytest.mark.integration
class TestEventBusPublishContract:
    """Test that EventBus.publish correctly handles event dataclasses."""

    async def test_publish_raw_mention_event(self):
        """EventBus.publish must accept a RawMentionEvent dataclass."""
        bus = EventBus("redis://localhost:6379/0")

        mock_redis = AsyncMock()
        mock_redis.xadd = AsyncMock(return_value="1234-0")
        bus._redis = mock_redis

        raw = _make_raw_mention()
        msg_id = await bus.publish(STREAM_RAW_MENTIONS, raw)

        assert msg_id == "1234-0"
        mock_redis.xadd.assert_called_once()

        call_args = mock_redis.xadd.call_args
        assert call_args[0][0] == STREAM_RAW_MENTIONS

        published_data = call_args[0][1]
        for k, v in published_data.items():
            assert isinstance(v, str), f"Field {k} is {type(v)}, expected str"

    async def test_publish_analyzed_mention_event(self):
        """EventBus.publish must accept an AnalyzedMentionEvent dataclass."""
        bus = EventBus("redis://localhost:6379/0")

        mock_redis = AsyncMock()
        mock_redis.xadd = AsyncMock(return_value="5678-0")
        bus._redis = mock_redis

        analyzed = AnalyzedMentionEvent(
            project_id=1, platform="twitter", source_id="tw_1",
            source_url="https://twitter.com/x/1", text="Great!",
            author_name="Test", author_handle="@test",
            sentiment="positive", sentiment_score=0.9,
        )
        msg_id = await bus.publish(STREAM_ANALYZED_MENTIONS, analyzed)

        assert msg_id == "5678-0"
        mock_redis.xadd.assert_called_once()

    async def test_publish_batch_raw_events(self):
        """EventBus.publish_batch must handle multiple RawMentionEvent instances."""
        bus = EventBus("redis://localhost:6379/0")

        mock_redis = AsyncMock()
        mock_pipeline = MagicMock()
        mock_pipeline.xadd = MagicMock()
        mock_pipeline.execute = AsyncMock(return_value=["1-0", "2-0", "3-0"])
        mock_redis.pipeline = MagicMock(return_value=mock_pipeline)
        bus._redis = mock_redis

        events = [_make_raw_mention(source_id=f"src_{i}") for i in range(3)]
        result = await bus.publish_batch(STREAM_RAW_MENTIONS, events)

        assert len(result) == 3
        assert mock_pipeline.xadd.call_count == 3


@pytest.mark.integration
class TestDLQFlow:
    """Test dead-letter queue behavior for failed message processing."""

    async def test_consume_with_retry_moves_to_dlq_after_max_retries(self):
        """Messages that fail max_retries times must be moved to DLQ."""
        bus = EventBus("redis://localhost:6379/0")

        mock_redis = AsyncMock()
        mock_redis.xreadgroup = AsyncMock(return_value=[
            ("mentions:raw", [
                ("msg-1", {
                    "project_id": "1",
                    "text": "failing message",
                    "_retry_count": "3",
                }),
            ]),
        ])
        mock_redis.xack = AsyncMock()
        mock_redis.xadd = AsyncMock(return_value="dlq-1")
        bus._redis = mock_redis

        handler = AsyncMock(side_effect=ValueError("Processing failed"))

        await bus.consume_with_retry(
            "mentions:raw", "test-group", "consumer-1",
            handler=handler, max_retries=3, count=1, block_ms=0,
        )

        mock_redis.xack.assert_called_once_with("mentions:raw", "test-group", "msg-1")

        dlq_call = mock_redis.xadd.call_args
        assert dlq_call[0][0] == "mentions:raw:dlq"
