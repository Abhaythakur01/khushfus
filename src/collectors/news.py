import logging
from datetime import datetime

import feedparser
import httpx

from shared.sanitize import strip_html
from src.collectors.base import BaseCollector, CollectedMention
from src.config.settings import settings

logger = logging.getLogger(__name__)

NEWSAPI_URL = "https://newsapi.org/v2/everything"

# Public RSS feeds for news monitoring
DEFAULT_RSS_FEEDS = [
    "https://news.google.com/rss/search?q={keyword}",
]


class NewsCollector(BaseCollector):
    platform = "news"

    def __init__(self):
        self.api_key = settings.news_api_key

    async def validate_credentials(self) -> bool:
        # RSS feeds don't need credentials; NewsAPI is optional
        return True

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        mentions = []

        # Collect from NewsAPI if key is available
        if self.api_key:
            mentions.extend(await self._collect_newsapi(keywords, since))

        # Always collect from RSS feeds (free)
        mentions.extend(await self._collect_rss(keywords, since))

        logger.info(f"Collected {len(mentions)} news mentions for keywords: {keywords}")
        return mentions

    async def _collect_newsapi(self, keywords: list[str], since: datetime | None) -> list[CollectedMention]:
        mentions = []
        query = " OR ".join(keywords)
        params = {
            "q": query,
            "apiKey": self.api_key,
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 100,
        }
        if since:
            params["from"] = since.strftime("%Y-%m-%d")

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(NEWSAPI_URL, params=params, timeout=30.0)
                resp.raise_for_status()
                data = resp.json()

            for article in data.get("articles", []):
                text = strip_html(f"{article.get('title', '')} {article.get('description', '')}")
                published = None
                if article.get("publishedAt"):
                    published = datetime.fromisoformat(article["publishedAt"].replace("Z", "+00:00"))

                mentions.append(
                    CollectedMention(
                        platform="news",
                        source_id=article.get("url", ""),
                        source_url=article.get("url", ""),
                        text=text,
                        author_name=article.get("source", {}).get("name", ""),
                        author_handle=article.get("author", ""),
                        published_at=published,
                        raw_data=article,
                    )
                )
        except Exception as e:
            logger.error(f"NewsAPI collection failed: {e}")

        return mentions

    async def _collect_rss(self, keywords: list[str], since: datetime | None) -> list[CollectedMention]:
        mentions = []

        for keyword in keywords:
            for feed_template in DEFAULT_RSS_FEEDS:
                feed_url = feed_template.format(keyword=keyword)
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(feed_url, timeout=15.0)
                        feed = feedparser.parse(resp.text)

                    for entry in feed.entries[:50]:
                        text = strip_html(f"{entry.get('title', '')} {entry.get('summary', '')}")

                        published = None
                        if hasattr(entry, "published_parsed") and entry.published_parsed:
                            published = datetime(*entry.published_parsed[:6])

                        if since and published and published < since:
                            continue

                        mentions.append(
                            CollectedMention(
                                platform="news",
                                source_id=entry.get("link", ""),
                                source_url=entry.get("link", ""),
                                text=text,
                                author_name=entry.get("source", {}).get("title", "")
                                if isinstance(entry.get("source"), dict)
                                else "",
                                author_handle="",
                                published_at=published,
                                raw_data=dict(entry),
                            )
                        )
                except Exception as e:
                    logger.error(f"RSS collection failed for {feed_url}: {e}")

        return mentions
