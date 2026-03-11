import logging
import os
from datetime import datetime

import httpx

from shared.sanitize import strip_html
from shared.url_validator import validate_url
from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)


class MastodonCollector(BaseCollector):
    """Collects mentions from Mastodon / ActivityPub instances."""

    platform = "mastodon"

    def __init__(self):
        self.instance_url = os.getenv("MASTODON_INSTANCE_URL", "https://mastodon.social").rstrip("/")
        self.access_token = os.getenv("MASTODON_ACCESS_TOKEN", "")

        # Validate instance URL on startup to prevent SSRF
        try:
            validate_url(self.instance_url)
        except ValueError as e:
            logger.error(f"MASTODON_INSTANCE_URL failed SSRF validation: {self.instance_url} — {e}")
            raise

    async def validate_credentials(self) -> bool:
        # Public search works without auth; auth is optional
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.instance_url}/api/v1/instance",
                    timeout=10.0,
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        mentions: list[CollectedMention] = []
        headers = {}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"

        for keyword in keywords:
            # Try authenticated search first, fall back to public hashtag timeline
            statuses = []
            try:
                if self.access_token:
                    statuses = await self._search_statuses(keyword, headers)
                if not statuses:
                    statuses = await self._hashtag_timeline(keyword, headers)
            except httpx.HTTPStatusError as e:
                logger.error(f"Mastodon API error: {e.response.status_code} - {e.response.text}")
                continue
            except Exception as e:
                logger.error(f"Mastodon collection failed for '{keyword}': {e}")
                continue

            for status in statuses:
                # Strip HTML tags from content
                content = status.get("content", "")
                text = strip_html(content)

                published = None
                if status.get("created_at"):
                    published = datetime.fromisoformat(status["created_at"].replace("Z", "+00:00"))

                if since and published and published < since:
                    continue

                account = status.get("account", {})

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=status.get("id", ""),
                        source_url=status.get("url", ""),
                        text=text,
                        author_name=account.get("display_name", ""),
                        author_handle=f"{account.get('acct', '')}",
                        author_followers=account.get("followers_count", 0),
                        author_profile_url=account.get("url", ""),
                        likes=status.get("favourites_count", 0),
                        shares=status.get("reblogs_count", 0),
                        comments=status.get("replies_count", 0),
                        published_at=published,
                        raw_data=status,
                    )
                )

        logger.info(f"Collected {len(mentions)} Mastodon mentions for keywords: {keywords}")
        return mentions

    async def _search_statuses(self, keyword: str, headers: dict) -> list[dict]:
        """Search statuses via authenticated /api/v2/search endpoint."""
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.instance_url}/api/v2/search",
                params={"q": keyword, "type": "statuses", "limit": 40},
                headers=headers,
                timeout=30.0,
            )
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", "60"))
                logger.warning(f"Mastodon rate limited, retry after {retry_after}s")
                return []
            resp.raise_for_status()
            return resp.json().get("statuses", [])

    async def _hashtag_timeline(self, keyword: str, headers: dict) -> list[dict]:
        """Fetch public hashtag timeline (works without authentication).

        Converts keyword to a hashtag-safe form (no spaces, alphanumeric only).
        """
        # Hashtags can't have spaces — try the keyword as-is and as concatenated
        tag = keyword.replace(" ", "").replace("-", "")
        if not tag.isalnum():
            # Fall back to first word if keyword has special chars
            tag = keyword.split()[0] if keyword.split() else keyword

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.instance_url}/api/v1/timelines/tag/{tag}",
                params={"limit": 40},
                headers=headers,
                timeout=30.0,
            )
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", "60"))
                logger.warning(f"Mastodon rate limited, retry after {retry_after}s")
                return []
            if resp.status_code != 200:
                logger.debug(f"Mastodon hashtag #{tag} returned {resp.status_code}")
                return []
            return resp.json()

