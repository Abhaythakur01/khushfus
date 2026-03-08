import logging
import os
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

TIKTOK_SEARCH_URL = "https://open.tiktokapis.com/v2/research/video/query/"


class TikTokCollector(BaseCollector):
    """Collects mentions from TikTok using the Research API."""

    platform = "tiktok"

    def __init__(self):
        self.access_token = os.getenv("TIKTOK_ACCESS_TOKEN", "")

    async def validate_credentials(self) -> bool:
        return bool(self.access_token)

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        if not self.access_token:
            logger.warning("TIKTOK_ACCESS_TOKEN not configured, skipping collection")
            return []

        mentions: list[CollectedMention] = []
        start_date = since.strftime("%Y%m%d") if since else "20200101"
        end_date = datetime.utcnow().strftime("%Y%m%d")

        body = {
            "query": {"and": [{"operation": "IN", "field_name": "keyword", "field_values": keywords}]},
            "start_date": start_date,
            "end_date": end_date,
            "max_count": 100,
            "fields": [
                "id",
                "video_description",
                "create_time",
                "username",
                "like_count",
                "comment_count",
                "share_count",
                "view_count",
            ],
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    TIKTOK_SEARCH_URL,
                    json=body,
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/json",
                    },
                    timeout=30.0,
                )

                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", "60"))
                    logger.warning(f"TikTok rate limited, retry after {retry_after}s")
                    return mentions

                resp.raise_for_status()
                data = resp.json()

            for video in data.get("data", {}).get("videos", []):
                published = datetime.fromtimestamp(video.get("create_time", 0))
                if since and published < since:
                    continue

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=str(video.get("id", "")),
                        source_url=f"https://www.tiktok.com/@{video.get('username', '')}/video/{video.get('id', '')}",
                        text=video.get("video_description", ""),
                        author_name=video.get("username", ""),
                        author_handle=video.get("username", ""),
                        author_profile_url=f"https://www.tiktok.com/@{video.get('username', '')}",
                        likes=video.get("like_count", 0),
                        shares=video.get("share_count", 0),
                        comments=video.get("comment_count", 0),
                        reach=video.get("view_count", 0),
                        published_at=published,
                        raw_data=video,
                    )
                )

            logger.info(f"Collected {len(mentions)} TikTok mentions for keywords: {keywords}")

        except httpx.HTTPStatusError as e:
            logger.error(f"TikTok API error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            logger.error(f"TikTok collection failed: {e}")

        return mentions
