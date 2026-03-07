import logging
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

REDDIT_SEARCH_URL = "https://www.reddit.com/search.json"


class RedditCollector(BaseCollector):
    """Collects mentions from Reddit using public JSON API (no auth needed)."""

    platform = "reddit"

    async def validate_credentials(self) -> bool:
        return True  # Public API, no credentials needed

    async def collect(
        self, keywords: list[str], since: datetime | None = None
    ) -> list[CollectedMention]:
        mentions = []

        for keyword in keywords:
            params = {
                "q": keyword,
                "sort": "new",
                "limit": 100,
                "t": "week",
            }

            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        REDDIT_SEARCH_URL,
                        params=params,
                        headers={"User-Agent": "KhushFus/1.0 Social Listening Bot"},
                        timeout=30.0,
                    )
                    resp.raise_for_status()
                    data = resp.json()

                for post in data.get("data", {}).get("children", []):
                    post_data = post["data"]
                    text = f"{post_data.get('title', '')} {post_data.get('selftext', '')}"

                    published = datetime.fromtimestamp(post_data.get("created_utc", 0))
                    if since and published < since:
                        continue

                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=post_data.get("id", ""),
                            source_url=f"https://reddit.com{post_data.get('permalink', '')}",
                            text=text,
                            author_name=post_data.get("author", ""),
                            author_handle=post_data.get("author", ""),
                            likes=post_data.get("ups", 0),
                            comments=post_data.get("num_comments", 0),
                            published_at=published,
                            raw_data=post_data,
                        )
                    )

            except Exception as e:
                logger.error(f"Reddit collection failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} Reddit mentions for keywords: {keywords}")
        return mentions
