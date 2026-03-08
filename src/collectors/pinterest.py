import logging
import os
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

PINTEREST_API_BASE = "https://api.pinterest.com/v5"


class PinterestCollector(BaseCollector):
    """Collects mentions from Pinterest using the API v5."""

    platform = "pinterest"

    def __init__(self):
        self.access_token = os.getenv("PINTEREST_ACCESS_TOKEN", "")

    async def validate_credentials(self) -> bool:
        if not self.access_token:
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{PINTEREST_API_BASE}/user_account",
                    headers=self._headers(),
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        if not self.access_token:
            logger.warning("PINTEREST_ACCESS_TOKEN not configured, skipping collection")
            return []

        mentions: list[CollectedMention] = []

        for keyword in keywords:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"{PINTEREST_API_BASE}/search/pins",
                        headers=self._headers(),
                        params={"query": keyword, "page_size": 100},
                        timeout=30.0,
                    )

                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "60"))
                        logger.warning(f"Pinterest rate limited, retry after {retry_after}s")
                        continue

                    resp.raise_for_status()
                    data = resp.json()

                for pin in data.get("items", []):
                    text = pin.get("description", "") or pin.get("title", "")

                    published = None
                    if pin.get("created_at"):
                        published = datetime.fromisoformat(pin["created_at"].replace("Z", "+00:00"))

                    if since and published and published < since:
                        continue

                    pinner = pin.get("pinner", {}) or {}

                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=pin.get("id", ""),
                            source_url=f"https://www.pinterest.com/pin/{pin.get('id', '')}",
                            text=text,
                            author_name=pinner.get("full_name", ""),
                            author_handle=pinner.get("username", ""),
                            author_profile_url=f"https://www.pinterest.com/{pinner.get('username', '')}/",
                            shares=pin.get("save_count", 0),
                            comments=pin.get("comment_count", 0),
                            published_at=published,
                            raw_data=pin,
                        )
                    )

            except httpx.HTTPStatusError as e:
                logger.error(f"Pinterest API error: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                logger.error(f"Pinterest collection failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} Pinterest mentions for keywords: {keywords}")
        return mentions

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.access_token}"}
