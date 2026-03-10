import logging
from datetime import datetime

import httpx

from shared.sanitize import strip_html
from src.collectors.base import BaseCollector, CollectedMention
from src.config.settings import settings

logger = logging.getLogger(__name__)

YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YT_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
YT_COMMENTS_URL = "https://www.googleapis.com/youtube/v3/commentThreads"


class YouTubeCollector(BaseCollector):
    platform = "youtube"

    def __init__(self):
        self.api_key = settings.youtube_api_key

    async def validate_credentials(self) -> bool:
        if not self.api_key:
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    YT_SEARCH_URL,
                    params={"part": "snippet", "q": "test", "key": self.api_key, "maxResults": 1},
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        if not self.api_key:
            logger.warning("YouTube API key not configured, skipping collection")
            return []

        mentions = []

        for keyword in keywords:
            params = {
                "part": "snippet",
                "q": keyword,
                "key": self.api_key,
                "maxResults": 50,
                "type": "video",
                "order": "date",
            }
            if since:
                params["publishedAfter"] = since.strftime("%Y-%m-%dT%H:%M:%SZ")

            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(YT_SEARCH_URL, params=params, timeout=30.0)
                    resp.raise_for_status()
                    data = resp.json()

                for item in data.get("items", []):
                    snippet = item["snippet"]
                    video_id = item["id"]["videoId"]

                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=video_id,
                            source_url=f"https://youtube.com/watch?v={video_id}",
                            text=f"{snippet['title']} - {snippet.get('description', '')}",
                            author_name=snippet.get("channelTitle", ""),
                            author_handle=snippet.get("channelId", ""),
                            published_at=datetime.fromisoformat(snippet["publishedAt"].replace("Z", "+00:00")),
                            raw_data=item,
                        )
                    )

                    # Also collect comments on matching videos
                    comment_mentions = await self._collect_comments(video_id, keywords)
                    mentions.extend(comment_mentions)

            except Exception as e:
                logger.error(f"YouTube collection failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} YouTube mentions for keywords: {keywords}")
        return mentions

    async def _collect_comments(self, video_id: str, keywords: list[str]) -> list[CollectedMention]:
        mentions = []
        params = {
            "part": "snippet",
            "videoId": video_id,
            "key": self.api_key,
            "maxResults": 100,
            "order": "relevance",
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(YT_COMMENTS_URL, params=params, timeout=30.0)
                if resp.status_code != 200:
                    return []
                data = resp.json()

            for item in data.get("items", []):
                comment = item["snippet"]["topLevelComment"]["snippet"]
                text = strip_html(comment["textDisplay"])

                # Only include comments that match keywords
                if not self._matches_keywords(text, keywords):
                    continue

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=item["id"],
                        source_url=f"https://youtube.com/watch?v={video_id}&lc={item['id']}",
                        text=text,
                        author_name=comment.get("authorDisplayName", ""),
                        author_handle=comment.get("authorChannelId", {}).get("value", ""),
                        author_profile_url=comment.get("authorChannelUrl", ""),
                        likes=comment.get("likeCount", 0),
                        published_at=datetime.fromisoformat(comment["publishedAt"].replace("Z", "+00:00")),
                        raw_data=item,
                    )
                )
        except Exception as e:
            logger.error(f"YouTube comment collection failed for video {video_id}: {e}")

        return mentions
