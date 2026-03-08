import logging
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
GDELT_TV_API = "https://api.gdeltproject.org/api/v2/tv/tv"


class GdeltCollector(BaseCollector):
    """Collects mentions from GDELT (Global Database of Events, Language, and Tone).

    GDELT is a free, open platform that monitors the world's news media — print, broadcast,
    and web — in over 100 languages. No API key required.

    What this collects:
    - Global news articles mentioning keywords
    - Sentiment/tone data from GDELT's built-in analysis
    - Geographic and thematic context
    - TV broadcast mentions (when available)
    """

    platform = "news"

    async def validate_credentials(self) -> bool:
        return True  # Free, no auth needed

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        mentions = []

        for keyword in keywords:
            # Collect from GDELT DOC API (news articles)
            article_mentions = await self._collect_articles(keyword, since)
            mentions.extend(article_mentions)

            # Collect from GDELT TV API (broadcast mentions)
            tv_mentions = await self._collect_tv_mentions(keyword, since)
            mentions.extend(tv_mentions)

        logger.info(f"Collected {len(mentions)} GDELT mentions for keywords: {keywords}")
        return mentions

    async def _collect_articles(self, keyword: str, since: datetime | None) -> list[CollectedMention]:
        mentions = []

        # GDELT DOC API uses timespan format like "1d", "7d", "1w"
        if since:
            delta = datetime.utcnow() - since
            days = max(1, delta.days)
            timespan = f"{min(days, 30)}d"
        else:
            timespan = "7d"

        params = {
            "query": keyword,
            "mode": "ArtList",
            "maxrecords": 100,
            "timespan": timespan,
            "format": "json",
            "sort": "DateDesc",
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(GDELT_DOC_API, params=params, timeout=30.0)
                if resp.status_code != 200:
                    logger.warning(f"GDELT API returned {resp.status_code}")
                    return []

                data = resp.json()

            for article in data.get("articles", []):
                title = article.get("title", "")
                url = article.get("url", "")
                source = article.get("domain", article.get("sourcecountry", ""))
                seendate = article.get("seendate", "")

                published = None
                if seendate:
                    try:
                        published = datetime.strptime(seendate[:14], "%Y%m%dT%H%M%S")
                    except Exception:
                        pass

                # GDELT provides a tone score: -100 (very negative) to +100 (very positive)
                tone = article.get("tone", 0)
                language = article.get("language", "en")
                socialimage = article.get("socialimage", "")

                mentions.append(
                    CollectedMention(
                        platform="news",
                        source_id=url,
                        source_url=url,
                        text=title,
                        author_name=source,
                        author_handle=article.get("domain", ""),
                        published_at=published,
                        raw_data={
                            **article,
                            "gdelt_tone": tone,
                            "gdelt_language": language,
                            "social_image": socialimage,
                        },
                    )
                )

        except httpx.TimeoutException:
            logger.warning(f"GDELT timeout for keyword '{keyword}'")
        except Exception as e:
            logger.error(f"GDELT article collection failed for '{keyword}': {e}")

        return mentions

    async def _collect_tv_mentions(self, keyword: str, since: datetime | None) -> list[CollectedMention]:
        """Collect TV broadcast mentions from GDELT TV API."""
        mentions = []

        if since:
            delta = datetime.utcnow() - since
            days = max(1, delta.days)
            timespan = f"{min(days, 14)}d"  # TV API has shorter retention
        else:
            timespan = "7d"

        params = {
            "query": keyword,
            "mode": "ClipList",
            "maxrecords": 50,
            "timespan": timespan,
            "format": "json",
            "sort": "DateDesc",
        }

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(GDELT_TV_API, params=params, timeout=30.0)
                if resp.status_code != 200:
                    return []
                data = resp.json()

            for clip in data.get("clips", []):
                snippet = clip.get("snippet", "")
                station = clip.get("station", "")
                show = clip.get("show", "")
                url = clip.get("preview_url", clip.get("url", ""))

                published = None
                date_str = clip.get("date", "")
                if date_str:
                    try:
                        published = datetime.strptime(date_str[:14], "%Y%m%dT%H%M%S")
                    except Exception:
                        pass

                mentions.append(
                    CollectedMention(
                        platform="news",
                        source_id=url or f"gdelt_tv_{clip.get('ia_show_id', '')}",
                        source_url=url,
                        text=f"[TV - {station}/{show}] {snippet}",
                        author_name=station,
                        author_handle=show,
                        published_at=published,
                        raw_data=clip,
                    )
                )

        except Exception as e:
            logger.error(f"GDELT TV collection failed for '{keyword}': {e}")

        return mentions
