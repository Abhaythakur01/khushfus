import logging
import os
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

LISTEN_NOTES_SEARCH_URL = "https://listen-api.listennotes.com/api/v2/search"
PODCAST_INDEX_SEARCH_URL = "https://api.podcastindex.org/api/1.0/search/byterm"


class PodcastCollector(BaseCollector):
    """Collects podcast episode mentions using Listen Notes API or PodcastIndex API."""

    platform = "podcast"

    def __init__(self):
        self.listen_notes_api_key = os.getenv("LISTEN_NOTES_API_KEY", "")
        self.podcast_index_key = os.getenv("PODCAST_INDEX_API_KEY", "")
        self.podcast_index_secret = os.getenv("PODCAST_INDEX_API_SECRET", "")

    async def validate_credentials(self) -> bool:
        return bool(self.listen_notes_api_key or self.podcast_index_key)

    async def collect(
        self, keywords: list[str], since: datetime | None = None
    ) -> list[CollectedMention]:
        if self.listen_notes_api_key:
            return await self._collect_listen_notes(keywords, since)
        elif self.podcast_index_key:
            return await self._collect_podcast_index(keywords, since)
        else:
            logger.warning("No podcast API key configured (LISTEN_NOTES_API_KEY or PODCAST_INDEX_API_KEY), skipping")
            return []

    async def _collect_listen_notes(
        self, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        mentions: list[CollectedMention] = []

        for keyword in keywords:
            params: dict = {
                "q": keyword,
                "type": "episode",
                "sort_by_date": 1,
                "len_min": 1,
            }
            if since:
                params["published_after"] = int(since.timestamp() * 1000)

            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        LISTEN_NOTES_SEARCH_URL,
                        params=params,
                        headers={"X-ListenAPI-Key": self.listen_notes_api_key},
                        timeout=30.0,
                    )

                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "60"))
                        logger.warning(f"Listen Notes rate limited, retry after {retry_after}s")
                        continue

                    resp.raise_for_status()
                    data = resp.json()

                for episode in data.get("results", []):
                    text = f"{episode.get('title_original', '')} {episode.get('description_original', '')}"

                    published = None
                    pub_date_ms = episode.get("pub_date_ms")
                    if pub_date_ms:
                        published = datetime.fromtimestamp(pub_date_ms / 1000)

                    if since and published and published < since:
                        continue

                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=episode.get("id", ""),
                            source_url=episode.get("listennotes_url", ""),
                            text=text.strip(),
                            author_name=episode.get("podcast", {}).get("title_original", ""),
                            author_handle=episode.get("podcast", {}).get("publisher_original", ""),
                            author_profile_url=episode.get("podcast", {}).get("listennotes_url", ""),
                            reach=episode.get("listen_score", 0),
                            published_at=published,
                            raw_data=episode,
                        )
                    )

            except httpx.HTTPStatusError as e:
                logger.error(f"Listen Notes API error: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                logger.error(f"Listen Notes collection failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} podcast mentions for keywords: {keywords}")
        return mentions

    async def _collect_podcast_index(
        self, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        import hashlib
        import time

        mentions: list[CollectedMention] = []

        for keyword in keywords:
            try:
                # PodcastIndex requires auth headers
                epoch_time = str(int(time.time()))
                auth_hash = hashlib.sha1(
                    (self.podcast_index_key + self.podcast_index_secret + epoch_time).encode()
                ).hexdigest()

                headers = {
                    "X-Auth-Key": self.podcast_index_key,
                    "X-Auth-Date": epoch_time,
                    "Authorization": auth_hash,
                    "User-Agent": "KhushFus/1.0",
                }

                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        PODCAST_INDEX_SEARCH_URL,
                        params={"q": keyword},
                        headers=headers,
                        timeout=30.0,
                    )

                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "60"))
                        logger.warning(f"PodcastIndex rate limited, retry after {retry_after}s")
                        continue

                    resp.raise_for_status()
                    data = resp.json()

                for feed in data.get("feeds", []):
                    text = f"{feed.get('title', '')} {feed.get('description', '')}"

                    published = None
                    newest_item_pub = feed.get("newestItemPublishTime")
                    if newest_item_pub:
                        published = datetime.fromtimestamp(newest_item_pub)

                    if since and published and published < since:
                        continue

                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=str(feed.get("id", "")),
                            source_url=feed.get("link", ""),
                            text=text.strip(),
                            author_name=feed.get("title", ""),
                            author_handle=feed.get("author", ""),
                            published_at=published,
                            raw_data=feed,
                        )
                    )

            except httpx.HTTPStatusError as e:
                logger.error(f"PodcastIndex API error: {e.response.status_code}")
            except Exception as e:
                logger.error(f"PodcastIndex collection failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} podcast mentions for keywords: {keywords}")
        return mentions
