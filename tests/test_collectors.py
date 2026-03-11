"""Tests for platform collectors."""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.collectors.base import BaseCollector, CollectedMention

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_response(status_code=200, json_data=None, headers=None, text=""):
    """Create a mock httpx.Response."""
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.json.return_value = json_data or {}
    resp.text = text
    resp.headers = headers or {}
    resp.raise_for_status = MagicMock()
    if status_code >= 400:
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            message=f"HTTP {status_code}",
            request=MagicMock(),
            response=resp,
        )
    return resp


def _async_client_mock(response):
    """Return an AsyncMock that acts as httpx.AsyncClient context manager."""
    client = AsyncMock()
    client.get = AsyncMock(return_value=response)
    client.post = AsyncMock(return_value=response)
    client.request = AsyncMock(return_value=response)
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm, client


def _validate_mention(mention, platform):
    """Assert that a mention has the right structure."""
    assert isinstance(mention, CollectedMention)
    assert mention.platform == platform
    assert isinstance(mention.source_id, str)
    assert isinstance(mention.text, str)
    assert isinstance(mention.likes, int)
    assert isinstance(mention.shares, int)
    assert isinstance(mention.comments, int)


# ---------------------------------------------------------------------------
# CollectedMention dataclass
# ---------------------------------------------------------------------------


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
        assert m.likes == 0
        assert m.shares == 0
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


# ---------------------------------------------------------------------------
# BaseCollector keyword matching
# ---------------------------------------------------------------------------


class TestBaseCollectorMatchesKeywords:
    """Test the keyword matching utility on BaseCollector."""

    def _make_collector(self):
        class DummyCollector(BaseCollector):
            platform = "dummy"

            async def collect(self, keywords, since=None):
                return []

            async def validate_credentials(self):
                return True

        return DummyCollector()

    def test_matches_keywords_case_insensitive(self):
        collector = self._make_collector()
        matched = collector._matches_keywords("I love the Test Brand product", ["test brand"])
        assert "test brand" in matched

    def test_no_match(self):
        collector = self._make_collector()
        matched = collector._matches_keywords("Nothing related here", ["test brand"])
        assert matched == []

    def test_multiple_matches(self):
        collector = self._make_collector()
        matched = collector._matches_keywords(
            "I like brand and competitor stuff",
            ["brand", "competitor", "missing"],
        )
        assert "brand" in matched
        assert "competitor" in matched
        assert "missing" not in matched

    def test_empty_keywords(self):
        collector = self._make_collector()
        matched = collector._matches_keywords("some text", [])
        assert matched == []

    def test_empty_text(self):
        collector = self._make_collector()
        matched = collector._matches_keywords("", ["brand"])
        assert matched == []


# ---------------------------------------------------------------------------
# Twitter Collector
# ---------------------------------------------------------------------------


class TestTwitterCollector:
    """Test Twitter collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.twitter import TwitterCollector

        collector = TwitterCollector()
        assert collector.platform == "twitter"

    @pytest.mark.asyncio
    async def test_collect_returns_empty_without_token(self):
        from src.collectors.twitter import TwitterCollector

        collector = TwitterCollector()
        collector.bearer_token = ""
        results = await collector.collect(["test"], datetime.utcnow() - timedelta(hours=1))
        assert results == []

    @pytest.mark.asyncio
    async def test_collect_parses_tweets(self):
        from src.collectors.twitter import TwitterCollector

        api_response = {
            "data": [
                {
                    "id": "tweet_1",
                    "text": "Great product by test brand!",
                    "author_id": "user_1",
                    "created_at": "2025-01-15T10:00:00Z",
                    "public_metrics": {
                        "like_count": 42,
                        "retweet_count": 10,
                        "reply_count": 5,
                        "impression_count": 1000,
                    },
                }
            ],
            "includes": {
                "users": [
                    {
                        "id": "user_1",
                        "name": "Test User",
                        "username": "testuser",
                        "public_metrics": {"followers_count": 500},
                    }
                ]
            },
        }

        resp = _mock_response(200, api_response)
        cm, client = _async_client_mock(resp)

        collector = TwitterCollector()
        collector.bearer_token = "fake-token"

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test brand"])

        assert len(results) == 1
        _validate_mention(results[0], "twitter")
        assert results[0].source_id == "tweet_1"
        assert results[0].likes == 42
        assert results[0].shares == 10
        assert results[0].author_name == "Test User"
        assert results[0].author_followers == 500
        assert results[0].reach == 1000

    @pytest.mark.asyncio
    async def test_collect_handles_api_error(self):
        from src.collectors.twitter import TwitterCollector

        resp = _mock_response(429, headers={"Retry-After": "30"})
        cm, client = _async_client_mock(resp)

        collector = TwitterCollector()
        collector.bearer_token = "fake-token"

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"])

        assert results == []

    @pytest.mark.asyncio
    async def test_collect_handles_empty_response(self):
        from src.collectors.twitter import TwitterCollector

        resp = _mock_response(200, {"data": [], "includes": {"users": []}})
        cm, client = _async_client_mock(resp)

        collector = TwitterCollector()
        collector.bearer_token = "fake-token"

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test brand"])

        assert results == []

    @pytest.mark.asyncio
    async def test_validate_credentials_no_token(self):
        from src.collectors.twitter import TwitterCollector

        collector = TwitterCollector()
        collector.bearer_token = ""
        assert await collector.validate_credentials() is False

    @pytest.mark.asyncio
    async def test_validate_credentials_valid_token(self):
        from src.collectors.twitter import TwitterCollector

        resp = _mock_response(200)
        cm, client = _async_client_mock(resp)

        collector = TwitterCollector()
        collector.bearer_token = "valid-token"

        with patch("httpx.AsyncClient", return_value=cm):
            assert await collector.validate_credentials() is True

    @pytest.mark.asyncio
    async def test_validate_credentials_invalid_token(self):
        from src.collectors.twitter import TwitterCollector

        resp = _mock_response(401)
        cm, client = _async_client_mock(resp)

        collector = TwitterCollector()
        collector.bearer_token = "bad-token"

        with patch("httpx.AsyncClient", return_value=cm):
            assert await collector.validate_credentials() is False


# ---------------------------------------------------------------------------
# Reddit Collector
# ---------------------------------------------------------------------------


class TestRedditCollector:
    """Test Reddit collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.reddit import RedditCollector

        assert RedditCollector().platform == "reddit"

    @pytest.mark.asyncio
    async def test_validate_credentials_always_true(self):
        from src.collectors.reddit import RedditCollector

        assert await RedditCollector().validate_credentials() is True

    @pytest.mark.asyncio
    async def test_collect_parses_posts(self):
        from src.collectors.reddit import RedditCollector

        api_response = {
            "data": {
                "children": [
                    {
                        "data": {
                            "id": "post_1",
                            "title": "Test brand review",
                            "selftext": "This is great",
                            "author": "redditor123",
                            "ups": 150,
                            "num_comments": 42,
                            "permalink": "/r/test/comments/abc/test_brand_review/",
                            "created_utc": 1705312000,
                        }
                    },
                    {
                        "data": {
                            "id": "post_2",
                            "title": "Another post",
                            "selftext": "",
                            "author": "user456",
                            "ups": 5,
                            "num_comments": 1,
                            "permalink": "/r/test/comments/def/another_post/",
                            "created_utc": 1705311000,
                        }
                    },
                ]
            }
        }

        resp = _mock_response(200, api_response)
        cm, client = _async_client_mock(resp)

        collector = RedditCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test brand"])

        assert len(results) == 2
        _validate_mention(results[0], "reddit")
        assert results[0].source_id == "post_1"
        assert results[0].likes == 150
        assert results[0].comments == 42
        assert "test_brand_review" in results[0].source_url

    @pytest.mark.asyncio
    async def test_collect_filters_by_since(self):
        from src.collectors.reddit import RedditCollector

        # Post from way in the past
        api_response = {
            "data": {
                "children": [
                    {
                        "data": {
                            "id": "old",
                            "title": "Old post",
                            "selftext": "",
                            "author": "user",
                            "ups": 1,
                            "num_comments": 0,
                            "permalink": "/r/test/old/",
                            "created_utc": 946684800,  # year 2000
                        }
                    }
                ]
            }
        }

        resp = _mock_response(200, api_response)
        cm, client = _async_client_mock(resp)

        collector = RedditCollector()
        since = datetime(2025, 1, 1)

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"], since=since)

        assert results == []

    @pytest.mark.asyncio
    async def test_collect_handles_api_error(self):
        from src.collectors.reddit import RedditCollector

        resp = _mock_response(500)
        cm, client = _async_client_mock(resp)

        collector = RedditCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"])

        assert results == []

    @pytest.mark.asyncio
    async def test_collect_handles_empty_response(self):
        from src.collectors.reddit import RedditCollector

        resp = _mock_response(200, {"data": {"children": []}})
        cm, client = _async_client_mock(resp)

        collector = RedditCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"])

        assert results == []


# ---------------------------------------------------------------------------
# YouTube Collector
# ---------------------------------------------------------------------------


class TestYouTubeCollector:
    """Test YouTube collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.youtube import YouTubeCollector

        assert YouTubeCollector().platform == "youtube"

    @pytest.mark.asyncio
    async def test_collect_returns_empty_without_key(self):
        from src.collectors.youtube import YouTubeCollector

        collector = YouTubeCollector()
        collector.api_key = ""
        results = await collector.collect(["test"])
        assert results == []

    @pytest.mark.asyncio
    async def test_validate_credentials_no_key(self):
        from src.collectors.youtube import YouTubeCollector

        collector = YouTubeCollector()
        collector.api_key = ""
        assert await collector.validate_credentials() is False

    @pytest.mark.asyncio
    async def test_collect_parses_videos(self):
        from src.collectors.youtube import YouTubeCollector

        search_response = {
            "items": [
                {
                    "id": {"videoId": "vid_abc"},
                    "snippet": {
                        "title": "Test Brand Review",
                        "description": "In-depth review of test brand",
                        "channelTitle": "TechReviewer",
                        "channelId": "UC123",
                        "publishedAt": "2025-01-15T10:00:00Z",
                    },
                }
            ]
        }
        comments_response = {"items": []}

        resp_search = _mock_response(200, search_response)
        resp_comments = _mock_response(200, comments_response)

        client = AsyncMock()
        # First call is search, second is comments
        client.get = AsyncMock(side_effect=[resp_search, resp_comments])
        cm = AsyncMock()
        cm.__aenter__ = AsyncMock(return_value=client)
        cm.__aexit__ = AsyncMock(return_value=False)

        collector = YouTubeCollector()
        collector.api_key = "fake-key"

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test brand"])

        assert len(results) == 1
        _validate_mention(results[0], "youtube")
        assert results[0].source_id == "vid_abc"
        assert "youtube.com" in results[0].source_url
        assert results[0].author_name == "TechReviewer"

    @pytest.mark.asyncio
    async def test_collect_handles_api_error(self):
        from src.collectors.youtube import YouTubeCollector

        resp = _mock_response(403)
        cm, client = _async_client_mock(resp)

        collector = YouTubeCollector()
        collector.api_key = "fake-key"

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"])

        assert results == []


# ---------------------------------------------------------------------------
# Bluesky Collector
# ---------------------------------------------------------------------------


class TestBlueskyCollector:
    """Test Bluesky collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.bluesky import BlueskyCollector

        assert BlueskyCollector().platform == "bluesky"

    @pytest.mark.asyncio
    async def test_validate_credentials(self):
        from src.collectors.bluesky import BlueskyCollector

        assert await BlueskyCollector().validate_credentials() is True

    @pytest.mark.asyncio
    async def test_collect_parses_posts(self):
        from src.collectors.bluesky import BlueskyCollector

        api_response = {
            "posts": [
                {
                    "uri": "at://did:plc:abc/app.bsky.feed.post/rkey123",
                    "record": {
                        "text": "Loving this test brand!",
                        "createdAt": "2025-01-15T10:00:00Z",
                    },
                    "author": {
                        "handle": "alice.bsky.social",
                        "displayName": "Alice",
                        "followersCount": 1200,
                    },
                    "likeCount": 30,
                    "repostCount": 5,
                    "replyCount": 3,
                    "indexedAt": "2025-01-15T10:01:00Z",
                }
            ]
        }

        resp = _mock_response(200, api_response)
        cm, client = _async_client_mock(resp)

        collector = BlueskyCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test brand"])

        assert len(results) == 1
        _validate_mention(results[0], "bluesky")
        assert results[0].likes == 30
        assert results[0].shares == 5
        assert results[0].author_handle == "alice.bsky.social"
        assert "bsky.app" in results[0].source_url

    @pytest.mark.asyncio
    async def test_collect_handles_rate_limit(self):
        from src.collectors.bluesky import BlueskyCollector

        resp = _mock_response(429, headers={"Retry-After": "60"})
        # Override raise_for_status to not raise for 429 (handled before raise_for_status)
        resp.raise_for_status = MagicMock()
        cm, client = _async_client_mock(resp)

        collector = BlueskyCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"])

        assert results == []

    @pytest.mark.asyncio
    async def test_collect_handles_empty_response(self):
        from src.collectors.bluesky import BlueskyCollector

        resp = _mock_response(200, {"posts": []})
        cm, client = _async_client_mock(resp)

        collector = BlueskyCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"])

        assert results == []

    @pytest.mark.asyncio
    async def test_collect_filters_by_since(self):
        from src.collectors.bluesky import BlueskyCollector

        api_response = {
            "posts": [
                {
                    "uri": "at://did:plc:old/app.bsky.feed.post/old",
                    "record": {
                        "text": "Old post about test",
                        "createdAt": "2020-01-01T00:00:00Z",
                    },
                    "author": {"handle": "old.bsky.social", "displayName": "Old"},
                    "likeCount": 1,
                    "repostCount": 0,
                    "replyCount": 0,
                }
            ]
        }

        resp = _mock_response(200, api_response)
        cm, client = _async_client_mock(resp)

        collector = BlueskyCollector()
        since = datetime(2025, 1, 1)

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"], since=since)

        assert results == []


# ---------------------------------------------------------------------------
# TikTok Collector
# ---------------------------------------------------------------------------


class TestTikTokCollector:
    """Test TikTok collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.tiktok import TikTokCollector

        assert TikTokCollector().platform == "tiktok"

    @pytest.mark.asyncio
    async def test_collect_returns_empty_without_token(self):
        from src.collectors.tiktok import TikTokCollector

        collector = TikTokCollector()
        collector.access_token = ""
        results = await collector.collect(["test"])
        assert results == []

    @pytest.mark.asyncio
    async def test_validate_no_token(self):
        from src.collectors.tiktok import TikTokCollector

        collector = TikTokCollector()
        collector.access_token = ""
        assert await collector.validate_credentials() is False

    @pytest.mark.asyncio
    async def test_validate_with_token(self):
        from src.collectors.tiktok import TikTokCollector

        collector = TikTokCollector()
        collector.access_token = "tok_123"
        assert await collector.validate_credentials() is True

    @pytest.mark.asyncio
    async def test_collect_parses_videos(self):
        from src.collectors.tiktok import TikTokCollector

        api_response = {
            "data": {
                "videos": [
                    {
                        "id": 12345678,
                        "video_description": "Check out this test brand product!",
                        "create_time": 1705312000,
                        "username": "creator1",
                        "like_count": 5000,
                        "comment_count": 200,
                        "share_count": 100,
                        "view_count": 50000,
                    }
                ]
            }
        }

        resp = _mock_response(200, api_response)
        cm, client = _async_client_mock(resp)

        collector = TikTokCollector()
        collector.access_token = "fake-token"

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test brand"])

        assert len(results) == 1
        _validate_mention(results[0], "tiktok")
        assert results[0].likes == 5000
        assert results[0].shares == 100
        assert results[0].reach == 50000

    @pytest.mark.asyncio
    async def test_collect_handles_rate_limit(self):
        from src.collectors.tiktok import TikTokCollector

        resp = _mock_response(429, headers={"Retry-After": "60"})
        resp.raise_for_status = MagicMock()  # 429 is handled before raise_for_status
        cm, client = _async_client_mock(resp)

        collector = TikTokCollector()
        collector.access_token = "fake-token"

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"])

        assert results == []


# ---------------------------------------------------------------------------
# Mastodon Collector
# ---------------------------------------------------------------------------


class TestMastodonCollector:
    """Test Mastodon collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.mastodon import MastodonCollector

        assert MastodonCollector().platform == "mastodon"

    def test_strip_html(self):
        from shared.sanitize import strip_html

        html = "<p>Hello <a href='#'>world</a></p><br/>Next line"
        text = strip_html(html)
        assert "<" not in text
        assert "Hello" in text
        assert "world" in text

    @pytest.mark.asyncio
    async def test_validate_credentials_success(self):
        from src.collectors.mastodon import MastodonCollector

        resp = _mock_response(200)
        cm, client = _async_client_mock(resp)

        collector = MastodonCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            assert await collector.validate_credentials() is True

    @pytest.mark.asyncio
    async def test_validate_credentials_failure(self):
        from src.collectors.mastodon import MastodonCollector

        resp = _mock_response(500)
        cm, client = _async_client_mock(resp)

        collector = MastodonCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            assert await collector.validate_credentials() is False

    @pytest.mark.asyncio
    async def test_collect_parses_statuses(self):
        from src.collectors.mastodon import MastodonCollector

        # Hashtag timeline returns a flat list of statuses (no access_token → uses hashtag endpoint)
        api_response = [
            {
                "id": "status_1",
                "content": "<p>This test brand is amazing</p>",
                "url": "https://mastodon.social/@alice/status_1",
                "created_at": "2025-01-15T10:00:00Z",
                "account": {
                    "display_name": "Alice",
                    "acct": "alice",
                    "followers_count": 300,
                    "url": "https://mastodon.social/@alice",
                },
                "favourites_count": 20,
                "reblogs_count": 5,
                "replies_count": 3,
            }
        ]

        resp = _mock_response(200, api_response)
        cm, client = _async_client_mock(resp)

        collector = MastodonCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test brand"])

        assert len(results) == 1
        _validate_mention(results[0], "mastodon")
        assert results[0].likes == 20
        assert results[0].shares == 5
        assert results[0].author_followers == 300
        assert "<" not in results[0].text  # HTML stripped

    @pytest.mark.asyncio
    async def test_collect_handles_rate_limit(self):
        from src.collectors.mastodon import MastodonCollector

        resp = _mock_response(429, headers={"Retry-After": "60"})
        resp.raise_for_status = MagicMock()
        cm, client = _async_client_mock(resp)

        collector = MastodonCollector()

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"])

        assert results == []


# ---------------------------------------------------------------------------
# Discord Collector
# ---------------------------------------------------------------------------


class TestDiscordCollector:
    """Test Discord collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.discord import DiscordCollector

        assert DiscordCollector().platform == "discord"

    @pytest.mark.asyncio
    async def test_collect_returns_empty_without_token(self):
        from src.collectors.discord import DiscordCollector

        collector = DiscordCollector()
        collector.bot_token = ""
        results = await collector.collect(["test"])
        assert results == []

    @pytest.mark.asyncio
    async def test_collect_returns_empty_without_channels(self):
        from src.collectors.discord import DiscordCollector

        collector = DiscordCollector()
        collector.bot_token = "fake-token"
        collector.channel_ids = []
        results = await collector.collect(["test"])
        assert results == []

    @pytest.mark.asyncio
    async def test_validate_credentials_no_token(self):
        from src.collectors.discord import DiscordCollector

        collector = DiscordCollector()
        collector.bot_token = ""
        assert await collector.validate_credentials() is False

    @pytest.mark.asyncio
    async def test_collect_parses_messages(self):
        from src.collectors.discord import DiscordCollector

        messages = [
            {
                "id": "msg_1",
                "content": "This test brand product is awesome",
                "timestamp": "2025-01-15T10:00:00Z",
                "guild_id": "guild_1",
                "author": {
                    "username": "bob",
                    "global_name": "Bob Smith",
                    "discriminator": "1234",
                },
                "reactions": [{"count": 5}, {"count": 3}],
                "thread": {"message_count": 12},
            },
            {
                "id": "msg_2",
                "content": "Unrelated message",
                "timestamp": "2025-01-15T11:00:00Z",
                "guild_id": "guild_1",
                "author": {"username": "other", "discriminator": "0"},
                "reactions": [],
            },
        ]

        resp = _mock_response(200, json_data=messages)
        # Override: Discord returns a list, not a dict
        resp.json.return_value = messages
        cm, client = _async_client_mock(resp)

        collector = DiscordCollector()
        collector.bot_token = "fake-token"
        collector.channel_ids = ["chan_1"]

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test brand"])

        assert len(results) == 1
        _validate_mention(results[0], "discord")
        assert results[0].likes == 8  # 5+3 reactions
        assert results[0].comments == 12  # thread messages
        assert results[0].author_name == "Bob Smith"

    @pytest.mark.asyncio
    async def test_collect_handles_rate_limit(self):
        from src.collectors.discord import DiscordCollector

        resp = _mock_response(429)
        resp.json.return_value = {"retry_after": 30}
        resp.raise_for_status = MagicMock()
        cm, client = _async_client_mock(resp)

        collector = DiscordCollector()
        collector.bot_token = "fake-token"
        collector.channel_ids = ["chan_1"]

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test"])

        assert results == []


# ---------------------------------------------------------------------------
# LinkedIn Collector
# ---------------------------------------------------------------------------


class TestLinkedInCollector:
    """Test LinkedIn collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.linkedin import LinkedInCollector

        assert LinkedInCollector().platform == "linkedin"

    @pytest.mark.asyncio
    async def test_collect_returns_empty_without_token(self):
        from src.collectors.linkedin import LinkedInCollector

        collector = LinkedInCollector()
        collector.access_token = ""
        results = await collector.collect(["test"])
        assert results == []

    @pytest.mark.asyncio
    async def test_validate_credentials_no_token(self):
        from src.collectors.linkedin import LinkedInCollector

        collector = LinkedInCollector()
        collector.access_token = ""
        assert await collector.validate_credentials() is False

    @pytest.mark.asyncio
    async def test_extract_post_text(self):
        from src.collectors.linkedin import LinkedInCollector

        collector = LinkedInCollector()
        collector.access_token = "fake"
        post = {
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {"text": "Hello LinkedIn world!"}
                }
            }
        }
        text = collector._extract_post_text(post)
        assert text == "Hello LinkedIn world!"

    @pytest.mark.asyncio
    async def test_extract_post_text_missing(self):
        from src.collectors.linkedin import LinkedInCollector

        collector = LinkedInCollector()
        collector.access_token = "fake"
        assert collector._extract_post_text({}) == ""


# ---------------------------------------------------------------------------
# Facebook Collector
# ---------------------------------------------------------------------------


class TestFacebookCollector:
    """Test Facebook collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.facebook import FacebookCollector

        assert FacebookCollector().platform == "facebook"

    @pytest.mark.asyncio
    async def test_collect_returns_empty_without_token(self):
        from src.collectors.facebook import FacebookCollector

        collector = FacebookCollector()
        collector.access_token = ""
        results = await collector.collect(["test"])
        assert results == []

    @pytest.mark.asyncio
    async def test_validate_credentials_no_token(self):
        from src.collectors.facebook import FacebookCollector

        collector = FacebookCollector()
        collector.access_token = ""
        assert await collector.validate_credentials() is False

    @pytest.mark.asyncio
    async def test_validate_credentials_valid(self):
        from src.collectors.facebook import FacebookCollector

        resp = _mock_response(200, {"id": "12345", "name": "Test Page"})
        cm, client = _async_client_mock(resp)

        collector = FacebookCollector()
        collector.access_token = "valid-token"

        with patch("httpx.AsyncClient", return_value=cm):
            assert await collector.validate_credentials() is True


# ---------------------------------------------------------------------------
# Instagram Collector
# ---------------------------------------------------------------------------


class TestInstagramCollector:
    """Test Instagram collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.instagram import InstagramCollector

        assert InstagramCollector().platform == "instagram"

    @pytest.mark.asyncio
    async def test_collect_returns_empty_without_token(self):
        from src.collectors.instagram import InstagramCollector

        collector = InstagramCollector()
        collector.access_token = ""
        results = await collector.collect(["test"])
        assert results == []

    @pytest.mark.asyncio
    async def test_validate_credentials_no_token(self):
        from src.collectors.instagram import InstagramCollector

        collector = InstagramCollector()
        collector.access_token = ""
        assert await collector.validate_credentials() is False


# ---------------------------------------------------------------------------
# News Collector
# ---------------------------------------------------------------------------


class TestNewsCollector:
    """Test News collector with mocked HTTP calls."""

    def test_platform_name(self):
        from src.collectors.news import NewsCollector

        assert NewsCollector().platform == "news"

    @pytest.mark.asyncio
    async def test_validate_always_true(self):
        from src.collectors.news import NewsCollector

        collector = NewsCollector()
        assert await collector.validate_credentials() is True

    @pytest.mark.asyncio
    async def test_collect_newsapi_parses_articles(self):
        from src.collectors.news import NewsCollector

        api_response = {
            "articles": [
                {
                    "url": "https://example.com/article1",
                    "title": "Test Brand Launches New Product",
                    "description": "Exciting new features from test brand",
                    "source": {"name": "TechNews"},
                    "author": "Jane Reporter",
                    "publishedAt": "2025-01-15T10:00:00Z",
                }
            ]
        }

        resp = _mock_response(200, api_response)
        # For RSS, return empty feed
        rss_resp = _mock_response(200, text="<rss></rss>")
        rss_resp.text = "<rss></rss>"

        client = AsyncMock()
        client.get = AsyncMock(side_effect=[resp, rss_resp])
        cm = AsyncMock()
        cm.__aenter__ = AsyncMock(return_value=client)
        cm.__aexit__ = AsyncMock(return_value=False)

        collector = NewsCollector()
        collector.api_key = "fake-key"

        with patch("httpx.AsyncClient", return_value=cm):
            results = await collector.collect(["test brand"])

        assert len(results) >= 1
        _validate_mention(results[0], "news")
        assert "Test Brand" in results[0].text
        assert results[0].author_name == "TechNews"

    @pytest.mark.asyncio
    async def test_collect_handles_api_error(self):
        from src.collectors.news import NewsCollector

        resp = _mock_response(500)
        rss_resp = _mock_response(200, text="<rss></rss>")
        rss_resp.text = "<rss></rss>"

        client = AsyncMock()
        client.get = AsyncMock(side_effect=[resp, rss_resp])
        cm = AsyncMock()
        cm.__aenter__ = AsyncMock(return_value=client)
        cm.__aexit__ = AsyncMock(return_value=False)

        collector = NewsCollector()
        collector.api_key = "fake-key"

        with patch("httpx.AsyncClient", return_value=cm):
            # Should not raise, just return whatever RSS gives
            results = await collector.collect(["test"])

        assert isinstance(results, list)
