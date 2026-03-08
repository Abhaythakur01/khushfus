import logging
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention
from src.config.settings import settings

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"


class InstagramCollector(BaseCollector):
    """Collects mentions from Instagram via the Instagram Graph API (Business/Creator accounts).

    Requires an Instagram Business or Creator account connected to a Facebook Page.
    Uses a Page Access Token with instagram_basic, instagram_manage_comments permissions.

    What this collects:
    - Recent media (posts, reels, stories) from the connected account
    - Comments on those media items
    - Hashtag-based search (requires instagram_basic + approved review)
    - Mentions/tags of the business account
    """

    platform = "instagram"

    def __init__(self):
        self.access_token = settings.instagram_access_token or settings.facebook_page_access_token

    async def validate_credentials(self) -> bool:
        if not self.access_token:
            return False
        try:
            ig_user_id = await self._get_ig_user_id()
            return ig_user_id is not None
        except Exception:
            return False

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        if not self.access_token:
            logger.warning("Instagram access token not configured, skipping collection")
            return []

        mentions = []
        ig_user_id = await self._get_ig_user_id()
        if not ig_user_id:
            logger.error("Could not resolve Instagram Business Account ID")
            return []

        # Collect from own recent media + comments
        media_mentions = await self._collect_own_media(ig_user_id, keywords, since)
        mentions.extend(media_mentions)

        # Collect from mentions/tags
        tag_mentions = await self._collect_mentioned_media(ig_user_id, keywords)
        mentions.extend(tag_mentions)

        # Collect from hashtag search
        for kw in keywords:
            hashtag = kw.lstrip("#").replace(" ", "")
            if hashtag:
                hashtag_mentions = await self._collect_hashtag(ig_user_id, hashtag, since)
                mentions.extend(hashtag_mentions)

        logger.info(f"Collected {len(mentions)} Instagram mentions for keywords: {keywords}")
        return mentions

    async def _get_ig_user_id(self) -> str | None:
        """Resolve the Instagram Business Account ID from the Facebook Page."""
        try:
            async with httpx.AsyncClient() as client:
                # First get pages
                resp = await client.get(
                    f"{GRAPH_API_BASE}/me/accounts",
                    params={"access_token": self.access_token, "fields": "instagram_business_account"},
                    timeout=15.0,
                )
                resp.raise_for_status()
                pages = resp.json().get("data", [])

                for page in pages:
                    ig_account = page.get("instagram_business_account")
                    if ig_account:
                        return ig_account["id"]
        except Exception as e:
            logger.error(f"Failed to get Instagram user ID: {e}")
        return None

    async def _collect_own_media(
        self, ig_user_id: str, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/{ig_user_id}/media",
                    params={
                        "access_token": self.access_token,
                        "fields": "id,caption,timestamp,like_count,comments_count,permalink,media_type,username",
                        "limit": 50,
                    },
                    timeout=30.0,
                )
                resp.raise_for_status()
                data = resp.json()

            for item in data.get("data", []):
                caption = item.get("caption", "")
                published = _parse_ig_time(item.get("timestamp"))

                if since and published and published < since:
                    continue

                if caption and self._matches_keywords(caption, keywords):
                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=item["id"],
                            source_url=item.get("permalink", ""),
                            text=caption,
                            author_name=item.get("username", ""),
                            author_handle=item.get("username", ""),
                            likes=item.get("like_count", 0),
                            comments=item.get("comments_count", 0),
                            published_at=published,
                            raw_data=item,
                        )
                    )

                # Collect comments on each media
                comment_mentions = await self._collect_media_comments(item["id"], keywords, item.get("permalink", ""))
                mentions.extend(comment_mentions)

        except Exception as e:
            logger.error(f"Failed to collect own media: {e}")

        return mentions

    async def _collect_media_comments(
        self, media_id: str, keywords: list[str], permalink: str
    ) -> list[CollectedMention]:
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/{media_id}/comments",
                    params={
                        "access_token": self.access_token,
                        "fields": "id,text,timestamp,username,like_count",
                        "limit": 100,
                    },
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    return []
                data = resp.json()

            for comment in data.get("data", []):
                text = comment.get("text", "")
                if not text or not self._matches_keywords(text, keywords):
                    continue

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=comment["id"],
                        source_url=permalink,
                        text=text,
                        author_name=comment.get("username", ""),
                        author_handle=comment.get("username", ""),
                        likes=comment.get("like_count", 0),
                        published_at=_parse_ig_time(comment.get("timestamp")),
                        raw_data=comment,
                    )
                )
        except Exception as e:
            logger.error(f"Failed to collect comments for media {media_id}: {e}")

        return mentions

    async def _collect_mentioned_media(self, ig_user_id: str, keywords: list[str]) -> list[CollectedMention]:
        """Collect media where the business account is tagged."""
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/{ig_user_id}/tags",
                    params={
                        "access_token": self.access_token,
                        "fields": "id,caption,timestamp,permalink,username,like_count,comments_count",
                        "limit": 50,
                    },
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    return []
                data = resp.json()

            for item in data.get("data", []):
                caption = item.get("caption", "")
                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=item["id"],
                        source_url=item.get("permalink", ""),
                        text=caption or "[Tagged media - no caption]",
                        author_name=item.get("username", ""),
                        author_handle=item.get("username", ""),
                        likes=item.get("like_count", 0),
                        comments=item.get("comments_count", 0),
                        published_at=_parse_ig_time(item.get("timestamp")),
                        raw_data=item,
                    )
                )
        except Exception as e:
            logger.error(f"Failed to collect tagged media: {e}")

        return mentions

    async def _collect_hashtag(self, ig_user_id: str, hashtag: str, since: datetime | None) -> list[CollectedMention]:
        """Search for recent media with a specific hashtag."""
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                # First resolve hashtag to ID
                resp = await client.get(
                    f"{GRAPH_API_BASE}/ig_hashtag_search",
                    params={
                        "access_token": self.access_token,
                        "user_id": ig_user_id,
                        "q": hashtag,
                    },
                    timeout=15.0,
                )
                if resp.status_code != 200:
                    return []
                hashtag_data = resp.json().get("data", [])
                if not hashtag_data:
                    return []

                hashtag_id = hashtag_data[0]["id"]

                # Get recent media for this hashtag
                resp = await client.get(
                    f"{GRAPH_API_BASE}/{hashtag_id}/recent_media",
                    params={
                        "access_token": self.access_token,
                        "user_id": ig_user_id,
                        "fields": "id,caption,timestamp,permalink,like_count,comments_count",
                        "limit": 50,
                    },
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    return []
                data = resp.json()

            for item in data.get("data", []):
                caption = item.get("caption", "")
                published = _parse_ig_time(item.get("timestamp"))

                if since and published and published < since:
                    continue

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=item["id"],
                        source_url=item.get("permalink", ""),
                        text=caption or f"[#{hashtag} media]",
                        author_name="",
                        author_handle="",
                        likes=item.get("like_count", 0),
                        comments=item.get("comments_count", 0),
                        published_at=published,
                        raw_data=item,
                    )
                )
        except Exception as e:
            logger.error(f"Failed to collect hashtag #{hashtag}: {e}")

        return mentions


def _parse_ig_time(time_str: str | None) -> datetime | None:
    if not time_str:
        return None
    try:
        return datetime.fromisoformat(time_str.replace("Z", "+00:00"))
    except Exception:
        return None
