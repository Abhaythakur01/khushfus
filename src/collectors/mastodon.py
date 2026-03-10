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
            params: dict = {
                "q": keyword,
                "type": "statuses",
                "limit": 40,
            }

            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"{self.instance_url}/api/v2/search",
                        params=params,
                        headers=headers,
                        timeout=30.0,
                    )

                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "60"))
                        logger.warning(f"Mastodon rate limited, retry after {retry_after}s")
                        continue

                    resp.raise_for_status()
                    data = resp.json()

                for status in data.get("statuses", []):
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

            except httpx.HTTPStatusError as e:
                logger.error(f"Mastodon API error: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                logger.error(f"Mastodon collection failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} Mastodon mentions for keywords: {keywords}")
        return mentions

