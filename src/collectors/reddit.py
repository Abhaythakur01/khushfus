import html
import logging
from datetime import datetime

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

REDDIT_SEARCH_URL = "https://www.reddit.com/search.json"


class RedditCollector(BaseCollector):
    """Collects mentions from Reddit using public JSON API (no auth needed)."""

    platform = "reddit"
    _rate_limit_delay: float = 2.0  # Reddit asks for <=30 req/min

    def __init__(self) -> None:
        super().__init__()

    async def validate_credentials(self) -> bool:
        return True  # Public API, no credentials needed

    async def collect(
        self, keywords: list[str], since: datetime | None = None, max_results: int = 1000
    ) -> list[CollectedMention]:
        mentions: list[CollectedMention] = []

        for keyword in keywords:
            params = {
                "q": keyword,
                "sort": "new",
                "limit": 100,
                "t": "week",
            }

            try:
                async with self._get_http_client() as client:
                    resp = await self._rate_limited_request(
                        client,
                        "GET",
                        REDDIT_SEARCH_URL,
                        params=params,
                    )
                    resp.raise_for_status()
                    data = resp.json()

                for post in data.get("data", {}).get("children", []):
                    post_data = post["data"]
                    source_id = post_data.get("id", "")

                    # 5.12 — skip duplicates at source
                    if self._is_duplicate(source_id):
                        continue

                    # Reddit returns HTML entities in text (&amp; &lt; etc.) — unescape them
                    raw_title = post_data.get("title", "")
                    raw_selftext = post_data.get("selftext", "")
                    text = html.unescape(f"{raw_title} {raw_selftext}")

                    published = datetime.fromtimestamp(post_data.get("created_utc", 0))
                    if since and published < since:
                        continue

                    mention = CollectedMention(
                        platform=self.platform,
                        source_id=source_id,
                        source_url=f"https://reddit.com{post_data.get('permalink', '')}",
                        text=text,
                        author_name=post_data.get("author", ""),
                        author_handle=post_data.get("author", ""),
                        likes=post_data.get("ups", 0),
                        comments=post_data.get("num_comments", 0),
                        published_at=published,
                        raw_data=post_data,
                    )
                    mentions.append(self._validate_mention(mention))

            except Exception as e:
                logger.error(f"Reddit collection failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} Reddit mentions for keywords: {keywords}")
        return mentions
