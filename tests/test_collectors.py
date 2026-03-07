"""Tests for platform collectors."""
import pytest
from datetime import datetime, timedelta

from src.collectors.base import BaseCollector, CollectedMention


class TestCollectedMention:
    def test_dataclass_creation(self):
        m = CollectedMention(
            platform="twitter",
            source_id="123",
            source_url="https://twitter.com/...",
            text="Hello world",
            author_name="John",
            author_handle="@john",
        )
        assert m.platform == "twitter"
        assert m.likes == 0  # default
        assert m.shares == 0  # default
        assert m.comments == 0
        assert m.reach == 0
        assert m.author_followers == 0
        assert m.author_profile_url == ""
        assert m.published_at is None
        assert m.raw_data == {}

    def test_dataclass_with_all_fields(self):
        now = datetime.utcnow()
        m = CollectedMention(
            platform="instagram",
            source_id="456",
            source_url="https://instagram.com/p/456",
            text="Great post",
            author_name="Jane",
            author_handle="@jane",
            author_followers=5000,
            author_profile_url="https://instagram.com/jane",
            likes=200,
            shares=50,
            comments=30,
            reach=10000,
            published_at=now,
            raw_data={"extra": "data"},
        )
        assert m.likes == 200
        assert m.author_followers == 5000
        assert m.published_at == now
        assert m.raw_data == {"extra": "data"}


class TestBaseCollectorMatchesKeywords:
    """Test the keyword matching utility on BaseCollector."""

    def test_matches_keywords_case_insensitive(self):
        # Create a concrete subclass for testing
        class DummyCollector(BaseCollector):
            platform = "dummy"

            async def collect(self, keywords, since=None):
                return []

            async def validate_credentials(self):
                return True

        collector = DummyCollector()
        matched = collector._matches_keywords("I love the Test Brand product", ["test brand"])
        assert "test brand" in matched

    def test_no_match(self):
        class DummyCollector(BaseCollector):
            platform = "dummy"

            async def collect(self, keywords, since=None):
                return []

            async def validate_credentials(self):
                return True

        collector = DummyCollector()
        matched = collector._matches_keywords("Nothing related here", ["test brand"])
        assert matched == []

    def test_multiple_matches(self):
        class DummyCollector(BaseCollector):
            platform = "dummy"

            async def collect(self, keywords, since=None):
                return []

            async def validate_credentials(self):
                return True

        collector = DummyCollector()
        matched = collector._matches_keywords(
            "I like brand and competitor stuff",
            ["brand", "competitor", "missing"],
        )
        assert "brand" in matched
        assert "competitor" in matched
        assert "missing" not in matched


class TestCollectorValidation:
    """Test that collectors handle missing credentials gracefully."""

    async def test_twitter_no_token(self):
        import os

        os.environ.pop("TWITTER_BEARER_TOKEN", None)
        # Force settings to have empty token by reimporting
        from src.collectors.twitter import TwitterCollector

        collector = TwitterCollector()
        # The collector reads from settings, which defaults to ""
        if not collector.bearer_token:
            valid = await collector.validate_credentials()
            assert valid is False

    async def test_tiktok_no_token(self):
        import os

        os.environ.pop("TIKTOK_ACCESS_TOKEN", None)
        from src.collectors.tiktok import TikTokCollector

        collector = TikTokCollector()
        valid = await collector.validate_credentials()
        assert valid is False

    async def test_bluesky_no_auth_needed(self):
        from src.collectors.bluesky import BlueskyCollector

        collector = BlueskyCollector()
        valid = await collector.validate_credentials()
        assert valid is True


class TestBlueskyCollector:
    """Test Bluesky collector platform value."""

    def test_platform_name(self):
        from src.collectors.bluesky import BlueskyCollector

        collector = BlueskyCollector()
        assert collector.platform == "bluesky"


class TestTwitterCollector:
    """Test Twitter collector without making API calls."""

    def test_platform_name(self):
        from src.collectors.twitter import TwitterCollector

        collector = TwitterCollector()
        assert collector.platform == "twitter"

    async def test_collect_returns_empty_without_token(self):
        from src.collectors.twitter import TwitterCollector

        collector = TwitterCollector()
        if not collector.bearer_token:
            results = await collector.collect(["test"], datetime.utcnow() - timedelta(hours=1))
            assert results == []
