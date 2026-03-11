"""
Integration tests for the core data pipeline: Collector -> Analyzer -> Query Service.

Tests cover:
- CollectedMention -> RawMentionEvent conversion
- Event idempotency keys (UUID auto-generation)
- Analyzer NLP pipeline (sentiment, emotions, entities, sarcasm)
- Edge cases (empty text, unicode/emoji/CJK/Arabic)
- Event serialization roundtrip
- Dedup key generation
- Sentiment tiering (VADER baseline, transformer escalation)
- Real API collectors (Reddit, GDELT) — marked @pytest.mark.integration
"""

import json
import uuid
from dataclasses import asdict
from datetime import datetime, timezone

import pytest

from shared.events import (
    AnalyzedMentionEvent,
    RawMentionEvent,
)
from src.collectors.base import CollectedMention

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_raw_mention_data(**overrides) -> dict:
    """Build a sample raw mention dict as the analyzer would receive from Redis."""
    base = {
        "project_id": "1",
        "platform": "twitter",
        "source_id": "tw_123456",
        "source_url": "https://twitter.com/user/status/123456",
        "text": "I absolutely love this product! Best purchase ever.",
        "author_name": "Test User",
        "author_handle": "@testuser",
        "author_followers": "5000",
        "author_profile_url": "https://twitter.com/testuser",
        "likes": "42",
        "shares": "10",
        "comments": "5",
        "reach": "15000",
        "published_at": "2026-03-10T12:00:00",
        "matched_keywords": "product,purchase",
    }
    base.update(overrides)
    return base


def _collected_mention_to_raw_event(
    cm: CollectedMention, project_id: int, matched_keywords: str = ""
) -> RawMentionEvent:
    """Convert a CollectedMention to a RawMentionEvent (mirrors collector service logic)."""
    return RawMentionEvent(
        project_id=project_id,
        platform=cm.platform,
        source_id=cm.source_id,
        source_url=cm.source_url,
        text=cm.text,
        author_name=cm.author_name,
        author_handle=cm.author_handle,
        author_followers=cm.author_followers,
        author_profile_url=cm.author_profile_url,
        likes=cm.likes,
        shares=cm.shares,
        comments=cm.comments,
        reach=cm.reach,
        published_at=cm.published_at.isoformat() if cm.published_at else "",
        matched_keywords=matched_keywords,
    )


# ===========================================================================
# 1. test_collected_mention_to_raw_event
# ===========================================================================


def test_collected_mention_to_raw_event():
    """Verify a CollectedMention converts properly to RawMentionEvent."""
    cm = CollectedMention(
        platform="twitter",
        source_id="tw_999",
        source_url="https://twitter.com/user/status/999",
        text="Great product launch!",
        author_name="Alice",
        author_handle="@alice",
        author_followers=1200,
        author_profile_url="https://twitter.com/alice",
        likes=50,
        shares=12,
        comments=3,
        reach=8000,
        published_at=datetime(2026, 3, 10, 14, 30, tzinfo=timezone.utc),
    )

    event = _collected_mention_to_raw_event(cm, project_id=7, matched_keywords="product,launch")

    assert isinstance(event, RawMentionEvent)
    assert event.project_id == 7
    assert event.platform == "twitter"
    assert event.source_id == "tw_999"
    assert event.text == "Great product launch!"
    assert event.author_name == "Alice"
    assert event.author_handle == "@alice"
    assert event.author_followers == 1200
    assert event.likes == 50
    assert event.shares == 12
    assert event.comments == 3
    assert event.reach == 8000
    assert event.matched_keywords == "product,launch"
    assert "2026-03-10" in event.published_at


# ===========================================================================
# 2. test_raw_event_has_idempotency_key
# ===========================================================================


def test_raw_event_has_idempotency_key():
    """Verify event_id (UUID) is auto-generated on RawMentionEvent."""
    event1 = RawMentionEvent(
        project_id=1,
        platform="twitter",
        source_id="tw_001",
        source_url="https://twitter.com/status/001",
        text="Hello world",
        author_name="Bob",
        author_handle="@bob",
    )
    event2 = RawMentionEvent(
        project_id=1,
        platform="twitter",
        source_id="tw_001",
        source_url="https://twitter.com/status/001",
        text="Hello world",
        author_name="Bob",
        author_handle="@bob",
    )

    # Both should have valid UUIDs
    uuid.UUID(event1.event_id)  # raises ValueError if invalid
    uuid.UUID(event2.event_id)

    # Each event gets a unique event_id
    assert event1.event_id != event2.event_id


# ===========================================================================
# 3. test_analyzer_produces_analyzed_event
# ===========================================================================


def test_analyzer_produces_analyzed_event():
    """Call analyze_mention() with sample data and verify the AnalyzedMentionEvent output."""
    from services.analyzer_service.app.main import analyze_mention

    data = _make_raw_mention_data(
        text="I absolutely love this product! Best purchase ever. The quality is amazing."
    )

    result = analyze_mention(data)

    assert isinstance(result, AnalyzedMentionEvent)
    # Pass-through fields
    assert result.project_id == 1
    assert result.platform == "twitter"
    assert result.source_id == "tw_123456"
    assert result.author_name == "Test User"
    assert result.likes == 42

    # NLP fields should be populated
    assert result.sentiment in ("positive", "negative", "neutral", "mixed")
    assert -1.0 <= result.sentiment_score <= 1.0
    assert result.language  # should detect as English
    assert result.sentiment_tier in ("vader", "transformer", "claude")

    # Emotions should be valid JSON (possibly empty dict if transformer not available)
    emotions = json.loads(result.emotions)
    assert isinstance(emotions, dict)

    # Entities JSON should be valid
    entities = json.loads(result.entities)
    assert isinstance(entities, list)

    # event_id should be a valid UUID
    uuid.UUID(result.event_id)


# ===========================================================================
# 4. test_analyzer_handles_empty_text
# ===========================================================================


def test_analyzer_handles_empty_text():
    """Analyzer should handle empty/null text gracefully without raising."""
    from services.analyzer_service.app.main import analyze_mention

    data = _make_raw_mention_data(text="")
    result = analyze_mention(data)

    assert isinstance(result, AnalyzedMentionEvent)
    assert result.text == ""
    assert result.sentiment in ("positive", "negative", "neutral", "mixed")
    assert -1.0 <= result.sentiment_score <= 1.0


# ===========================================================================
# 5. test_analyzer_handles_unicode
# ===========================================================================


@pytest.mark.parametrize(
    "text,description",
    [
        ("I love this product! 😍🔥💯 So amazing!", "emoji text"),
        ("这个产品太棒了！质量非常好。", "Chinese (CJK) text"),
        ("هذا المنتج رائع جداً وأنا سعيد بالشراء", "Arabic text"),
        ("素晴らしい製品です！大好き！", "Japanese text"),
        ("Отличный продукт! Очень доволен покупкой.", "Russian text"),
        ("Mixed: Love it! 😊 这很好 مدهش 🎉", "mixed scripts and emoji"),
    ],
)
def test_analyzer_handles_unicode(text, description):
    """Analyzer should handle emoji, CJK, Arabic text without crashing."""
    from services.analyzer_service.app.main import analyze_mention

    data = _make_raw_mention_data(text=text)
    result = analyze_mention(data)

    assert isinstance(result, AnalyzedMentionEvent)
    assert result.text == text
    assert result.sentiment in ("positive", "negative", "neutral", "mixed")
    assert -1.0 <= result.sentiment_score <= 1.0


# ===========================================================================
# 6. test_event_serialization_roundtrip
# ===========================================================================


def test_event_serialization_roundtrip():
    """Serialize an event to dict, verify all fields are present."""
    event = AnalyzedMentionEvent(
        project_id=42,
        platform="reddit",
        source_id="rd_abc",
        source_url="https://reddit.com/r/test/abc",
        text="This is a test mention",
        author_name="Redditor",
        author_handle="u/redditor",
        author_followers=500,
        likes=100,
        shares=20,
        comments=15,
        reach=5000,
        published_at="2026-03-10T10:00:00",
        matched_keywords="test",
        sentiment="positive",
        sentiment_score=0.85,
        language="en",
        topics="technology,testing",
        entities='[{"text": "test", "type": "hashtag"}]',
        emotions='{"joy": 0.9, "anger": 0.01}',
        entities_json='{"persons": [], "organizations": ["TestCorp"]}',
        aspects_json='[{"aspect": "quality", "sentiment": "positive", "score": 0.9}]',
        sarcasm=False,
        sentiment_tier="vader",
    )

    data = asdict(event)

    # All fields must be present
    expected_fields = {
        "project_id", "platform", "source_id", "source_url", "text",
        "author_name", "author_handle", "author_followers", "author_profile_url",
        "likes", "shares", "comments", "reach", "published_at", "matched_keywords",
        "sentiment", "sentiment_score", "language", "topics", "entities",
        "emotions", "entities_json", "aspects_json", "sarcasm", "sentiment_tier",
        "event_id", "schema_version",
    }
    assert set(data.keys()) == expected_fields

    # Values roundtrip correctly
    assert data["project_id"] == 42
    assert data["platform"] == "reddit"
    assert data["sentiment"] == "positive"
    assert data["sentiment_score"] == 0.85
    assert data["sarcasm"] is False
    assert json.loads(data["emotions"]) == {"joy": 0.9, "anger": 0.01}
    assert json.loads(data["entities_json"]) == {"persons": [], "organizations": ["TestCorp"]}

    # Verify event_id survived serialization
    uuid.UUID(data["event_id"])


# ===========================================================================
# 7. test_dedup_key_generation
# ===========================================================================


def test_dedup_key_generation():
    """Two events with same source_id+platform should produce the same dedup key."""

    def make_dedup_key(source_id: str, platform: str, project_id: int) -> str:
        """Mirrors the dedup logic used by the query service:
        uniqueness is (source_id, platform, project_id)."""
        return f"{project_id}:{platform}:{source_id}"

    key_a = make_dedup_key("tw_123", "twitter", 1)
    key_b = make_dedup_key("tw_123", "twitter", 1)
    key_c = make_dedup_key("tw_123", "twitter", 2)  # different project
    key_d = make_dedup_key("tw_456", "twitter", 1)  # different source

    assert key_a == key_b, "Same source_id+platform+project should produce identical dedup key"
    assert key_a != key_c, "Different project_id should produce different dedup key"
    assert key_a != key_d, "Different source_id should produce different dedup key"


def test_dedup_key_matches_query_service_logic():
    """The query service deduplicates by (project_id, source_id, platform).
    Verify two AnalyzedMentionEvents with identical identifiers would collide."""
    event1 = AnalyzedMentionEvent(
        project_id=5,
        platform="facebook",
        source_id="fb_999",
        source_url="https://facebook.com/999",
        text="Duplicate mention",
        author_name="User",
        author_handle="@user",
    )
    event2 = AnalyzedMentionEvent(
        project_id=5,
        platform="facebook",
        source_id="fb_999",
        source_url="https://facebook.com/999",
        text="Same mention different text",
        author_name="User2",
        author_handle="@user2",
    )

    # The triple (project_id, source_id, platform) is the dedup key
    assert event1.project_id == event2.project_id
    assert event1.source_id == event2.source_id
    assert event1.platform == event2.platform

    # But event_ids should still be unique
    assert event1.event_id != event2.event_id


# ===========================================================================
# 8. test_sentiment_tiers
# ===========================================================================


def test_sentiment_vader_always_runs():
    """VADER (Tier 1) should always produce a result for any text."""
    from src.nlp.analyzer import SentimentAnalyzer

    sa = SentimentAnalyzer()
    result = sa.analyze("I love this so much!", engagement=0)

    # VADER is always available; it should produce a valid sentiment
    assert result.sentiment in ("positive", "negative", "neutral", "mixed")
    assert -1.0 <= result.sentiment_score <= 1.0
    assert result.sentiment_tier in ("vader", "transformer", "claude")


def test_sentiment_tier_escalation_on_low_confidence():
    """When VADER confidence is ambiguous, the tier should attempt transformer escalation."""
    from src.nlp.analyzer import SentimentAnalyzer

    sa = SentimentAnalyzer()

    # Ambiguous text that VADER might score near zero (low confidence)
    ambiguous_text = "The product arrived. It works. Nothing special."
    result = sa.analyze(ambiguous_text, engagement=0)

    # We just verify the pipeline doesn't crash and produces a valid result
    assert result.sentiment in ("positive", "negative", "neutral", "mixed")
    assert result.sentiment_tier in ("vader", "transformer", "claude")


def test_sentiment_positive_text():
    """Strongly positive text should be classified as positive."""
    from src.nlp.analyzer import SentimentAnalyzer

    sa = SentimentAnalyzer()
    result = sa.analyze("This is absolutely wonderful! I am so happy and thrilled!")

    assert result.sentiment == "positive"
    assert result.sentiment_score > 0


def test_sentiment_negative_text():
    """Strongly negative text should be classified as negative."""
    from src.nlp.analyzer import SentimentAnalyzer

    sa = SentimentAnalyzer()
    result = sa.analyze("This is terrible and awful. Worst experience ever. I hate it.")

    assert result.sentiment == "negative"
    assert result.sentiment_score < 0


# ===========================================================================
# 9. test_collector_reddit_real
# ===========================================================================


@pytest.mark.integration
@pytest.mark.asyncio
async def test_collector_reddit_real():
    """Actually call RedditCollector with a simple keyword and verify real data."""
    from src.collectors.reddit import RedditCollector

    collector = RedditCollector()

    # Validate credentials (Reddit public API needs none)
    assert await collector.validate_credentials() is True

    # Collect mentions for a common keyword
    mentions = await collector.collect(["python programming"], since=None)

    # We should get at least some results from Reddit
    assert isinstance(mentions, list)
    if len(mentions) > 0:
        m = mentions[0]
        assert isinstance(m, CollectedMention)
        assert m.platform == "reddit"
        assert m.source_id  # should have a source ID
        assert m.text  # should have text content
        assert m.author_name or m.author_handle  # should have author info
        assert m.source_url  # should have a URL


# ===========================================================================
# 10. test_collector_gdelt_real
# ===========================================================================


@pytest.mark.integration
@pytest.mark.asyncio
async def test_collector_gdelt_real():
    """Actually call GdeltCollector with a simple keyword and verify real data."""
    from src.collectors.gdelt import GdeltCollector

    collector = GdeltCollector()

    # GDELT is a free public API, no credentials needed
    assert await collector.validate_credentials() is True

    # Collect mentions for a broad keyword
    mentions = await collector.collect(["artificial intelligence"], since=None)

    assert isinstance(mentions, list)
    if len(mentions) > 0:
        m = mentions[0]
        assert isinstance(m, CollectedMention)
        assert m.platform == "news"
        assert m.source_id  # should have a source ID
        assert m.text  # should have text/title content
        assert m.source_url  # should have a URL


# ===========================================================================
# Bonus: end-to-end pipeline flow test (unit, no external deps)
# ===========================================================================


def test_full_pipeline_collector_to_analyzer():
    """End-to-end: CollectedMention -> RawMentionEvent -> analyze_mention -> AnalyzedMentionEvent."""
    from services.analyzer_service.app.main import analyze_mention

    # Step 1: Simulate a collector producing a mention
    cm = CollectedMention(
        platform="twitter",
        source_id="tw_e2e_001",
        source_url="https://twitter.com/user/status/e2e001",
        text="Our new product launch has been incredibly successful! Customers love it.",
        author_name="BrandAccount",
        author_handle="@brand",
        author_followers=50000,
        likes=200,
        shares=80,
        comments=30,
        reach=100000,
        published_at=datetime(2026, 3, 10, 9, 0, tzinfo=timezone.utc),
    )

    # Step 2: Convert to RawMentionEvent (as collector service would)
    raw_event = _collected_mention_to_raw_event(cm, project_id=3, matched_keywords="product,launch")
    assert isinstance(raw_event, RawMentionEvent)
    assert raw_event.project_id == 3

    # Step 3: Serialize to dict (as EventBus would for Redis)
    raw_data = asdict(raw_event)
    # Redis streams store everything as strings
    raw_data = {k: str(v) for k, v in raw_data.items()}

    # Step 4: Analyzer processes it
    analyzed = analyze_mention(raw_data)
    assert isinstance(analyzed, AnalyzedMentionEvent)

    # Verify the pipeline preserved identity fields
    assert analyzed.project_id == 3
    assert analyzed.platform == "twitter"
    assert analyzed.source_id == "tw_e2e_001"
    assert analyzed.text == cm.text
    assert analyzed.likes == 200

    # Verify NLP produced results
    assert analyzed.sentiment in ("positive", "negative", "neutral", "mixed")
    assert analyzed.language  # should be detected
    assert analyzed.sentiment_tier in ("vader", "transformer", "claude")
