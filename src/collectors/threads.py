import logging
import os
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

THREADS_API_BASE = "https://graph.threads.net/v1.0"


class ThreadsCollector(BaseCollector):
    """Collects mentions from Meta Threads API."""

    platform = "threads"

    def __init__(self):
        self.access_token = os.getenv("THREADS_ACCESS_TOKEN", "")
        # Comma-separated user IDs to monitor
        self.user_ids = [uid.strip() for uid in os.getenv("THREADS_USER_IDS", "me").split(",") if uid.strip()]

    async def validate_credentials(self) -> bool:
        if not self.access_token:
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{THREADS_API_BASE}/me",
                    params={"access_token": self.access_token, "fields": "id"},
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        if not self.access_token:
            logger.warning("THREADS_ACCESS_TOKEN not configured, skipping collection")
            return []

        mentions: list[CollectedMention] = []

        for user_id in self.user_ids:
            try:
                threads = await self._fetch_user_threads(user_id)
                for thread in threads:
                    text = thread.get("text", "")
                    matched = self._matches_keywords(text, keywords)
                    if not matched:
                        continue

                    published = None
                    if thread.get("timestamp"):
                        published = datetime.fromisoformat(thread["timestamp"].replace("Z", "+00:00"))

                    if since and published and published < since:
                        continue

                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=thread.get("id", ""),
                            source_url=thread.get("permalink", ""),
                            text=text,
                            author_name=thread.get("username", ""),
                            author_handle=thread.get("username", ""),
                            author_profile_url=f"https://www.threads.net/@{thread.get('username', '')}",
                            likes=thread.get("likes", 0),
                            shares=thread.get("reposts", 0),
                            comments=thread.get("replies", 0),
                            published_at=published,
                            raw_data=thread,
                        )
                    )

            except httpx.HTTPStatusError as e:
                logger.error(f"Threads API error for user {user_id}: {e.response.status_code}")
            except Exception as e:
                logger.error(f"Threads collection failed for user {user_id}: {e}")

        logger.info(f"Collected {len(mentions)} Threads mentions for keywords: {keywords}")
        return mentions

    async def _fetch_user_threads(self, user_id: str) -> list[dict]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{THREADS_API_BASE}/{user_id}/threads",
                params={
                    "access_token": self.access_token,
                    "fields": "id,text,username,timestamp,permalink,likes,replies,reposts",
                    "limit": 100,
                },
                timeout=30.0,
            )

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", "60"))
                logger.warning(f"Threads rate limited, retry after {retry_after}s")
                return []

            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])
