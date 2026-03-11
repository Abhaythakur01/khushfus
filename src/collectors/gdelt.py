import logging
from datetime import datetime, timezone

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

# Full Text Search API — searches actual article body text, not just titles
GDELT_FTS_API = "https://api.gdeltproject.org/api/v1/search_ftxtsearch/search_ftxtsearch"
# DOC API v2 — searches titles/metadata, returns richer JSON with tone/domain/image
GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
# TV API — broadcast TV mentions
GDELT_TV_API = "https://api.gdeltproject.org/api/v2/tv/tv"


class GdeltCollector(BaseCollector):
    """Collects mentions from GDELT (Global Database of Events, Language, and Tone).

    Uses three GDELT APIs:
    1. Full Text Search API (primary) — searches full article body text across 65+ languages
       with deduplication, tone filtering, and domain/country targeting.
    2. DOC API v2 (fallback) — returns richer metadata (tone scores, images, domains).
    3. TV API — broadcast TV transcript mentions.

    All free, no API key required.
    """

    platform = "news"
    _rate_limit_delay: float = 5.0  # GDELT recommends conservative pacing

    def __init__(self) -> None:
        super().__init__()

    async def validate_credentials(self) -> bool:
        return True  # Free, no auth needed

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        mentions: list[CollectedMention] = []

        for keyword in keywords:
            # Primary: Full Text Search API (searches article body, less rate-limited)
            fts_mentions = await self._collect_fts(keyword, since)
            mentions.extend(fts_mentions)

            # Fallback: DOC API v2 if FTS returned nothing (has richer metadata)
            if not fts_mentions:
                doc_mentions = await self._collect_doc_api(keyword, since)
                mentions.extend(doc_mentions)

            # TV broadcast mentions
            tv_mentions = await self._collect_tv_mentions(keyword, since)
            mentions.extend(tv_mentions)

        logger.info(f"Collected {len(mentions)} GDELT mentions for keywords: {keywords}")
        return mentions

    async def _collect_fts(self, keyword: str, since: datetime | None) -> list[CollectedMention]:
        """Collect via GDELT Full Text Search API."""
        mentions: list[CollectedMention] = []

        # Build query with sort and optional time window
        query = f"{keyword} sortby:date"
        if since:
            aware_since = since.replace(tzinfo=timezone.utc) if since.tzinfo is None else since
            delta = datetime.now(timezone.utc) - aware_since
            minutes = max(15, int(delta.total_seconds() / 60))
            # FTS API uses lastminutes (multiples of 15, max ~24h = 1440)
            if minutes <= 1440:
                query += f" lastminutes:{minutes}"

        params = {
            "query": query,
            "output": "urllist",
            "maxrows": 150,
            "dropdup": "true",
        }

        try:
            async with self._get_http_client() as client:
                resp = await self._rate_limited_request(client, "GET", GDELT_FTS_API, params=params, timeout=30.0)
                if resp.status_code != 200:
                    logger.warning(f"GDELT FTS API returned {resp.status_code}")
                    return []

            # Parse CSV: each line is "YYYYMMDDHHMMSS,lang,url"
            for line in resp.text.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue

                parts = line.split(",", 2)
                if len(parts) < 3:
                    continue

                date_str, language, url = parts[0], parts[1], parts[2]

                # 5.12 — skip duplicates at source
                if self._is_duplicate(url):
                    continue

                # Parse date (YYYYMMDDHHMMSS)
                published = None
                try:
                    published = datetime.strptime(date_str[:14], "%Y%m%d%H%M%S")
                except Exception:
                    pass

                # Extract domain from URL for author_name
                domain = ""
                try:
                    from urllib.parse import urlparse

                    domain = urlparse(url).netloc.replace("www.", "")
                except Exception:
                    pass

                mention = CollectedMention(
                    platform="news",
                    source_id=url,
                    source_url=url,
                    text=f"[{domain}] {keyword}",
                    author_name=domain,
                    author_handle=domain,
                    published_at=published,
                    raw_data={
                        "gdelt_api": "fts",
                        "gdelt_language": language,
                        "keyword": keyword,
                        "url": url,
                    },
                )
                mentions.append(self._validate_mention(mention))

        except Exception as e:
            if "Timeout" in type(e).__name__:
                logger.warning(f"GDELT FTS timeout for keyword '{keyword}'")
            else:
                logger.error(f"GDELT FTS collection failed for '{keyword}': {e}")

        return mentions

    async def _collect_doc_api(self, keyword: str, since: datetime | None) -> list[CollectedMention]:
        """Fallback: collect via GDELT DOC API v2 (richer metadata but title-only search)."""
        mentions: list[CollectedMention] = []

        if since:
            aware_since = since.replace(tzinfo=timezone.utc) if since.tzinfo is None else since
            delta = datetime.now(timezone.utc) - aware_since
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
            async with self._get_http_client() as client:
                resp = await self._rate_limited_request(client, "GET", GDELT_DOC_API, params=params, timeout=30.0)
                if resp.status_code != 200:
                    logger.warning(f"GDELT DOC API returned {resp.status_code}")
                    return []
                data = resp.json()

            for article in data.get("articles", []):
                title = article.get("title", "")
                url = article.get("url", "")
                source = article.get("domain", article.get("sourcecountry", ""))
                seendate = article.get("seendate", "")

                # 5.12 — skip duplicates at source
                if self._is_duplicate(url):
                    continue

                published = None
                if seendate:
                    try:
                        published = datetime.strptime(seendate[:14], "%Y%m%dT%H%M%S")
                    except Exception:
                        pass

                tone = article.get("tone", 0)
                language = article.get("language", "en")
                socialimage = article.get("socialimage", "")

                mention = CollectedMention(
                    platform="news",
                    source_id=url,
                    source_url=url,
                    text=title,
                    author_name=source,
                    author_handle=article.get("domain", ""),
                    published_at=published,
                    raw_data={
                        **article,
                        "gdelt_api": "doc_v2",
                        "gdelt_tone": tone,
                        "gdelt_language": language,
                        "social_image": socialimage,
                    },
                )
                mentions.append(self._validate_mention(mention))

        except Exception as e:
            if "Timeout" in type(e).__name__:
                logger.warning(f"GDELT DOC timeout for keyword '{keyword}'")
            else:
                logger.error(f"GDELT DOC collection failed for '{keyword}': {e}")

        return mentions

    async def _collect_tv_mentions(self, keyword: str, since: datetime | None) -> list[CollectedMention]:
        """Collect TV broadcast mentions from GDELT TV API."""
        mentions: list[CollectedMention] = []

        if since:
            aware_since = since.replace(tzinfo=timezone.utc) if since.tzinfo is None else since
            delta = datetime.now(timezone.utc) - aware_since
            days = max(1, delta.days)
            timespan = f"{min(days, 14)}d"
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
            async with self._get_http_client() as client:
                resp = await self._rate_limited_request(client, "GET", GDELT_TV_API, params=params, timeout=30.0)
                if resp.status_code != 200:
                    return []
                data = resp.json()

            for clip in data.get("clips", []):
                snippet = clip.get("snippet", "")
                station = clip.get("station", "")
                show = clip.get("show", "")
                url = clip.get("preview_url", clip.get("url", ""))
                clip_id = url or f"gdelt_tv_{clip.get('ia_show_id', '')}"

                # 5.12 — skip duplicates at source
                if self._is_duplicate(clip_id):
                    continue

                published = None
                date_str = clip.get("date", "")
                if date_str:
                    try:
                        published = datetime.strptime(date_str[:14], "%Y%m%dT%H%M%S")
                    except Exception:
                        pass

                mention = CollectedMention(
                    platform="news",
                    source_id=clip_id,
                    source_url=url,
                    text=f"[TV - {station}/{show}] {snippet}",
                    author_name=station,
                    author_handle=show,
                    published_at=published,
                    raw_data={**clip, "gdelt_api": "tv"},
                )
                mentions.append(self._validate_mention(mention))

        except Exception as e:
            logger.error(f"GDELT TV collection failed for '{keyword}': {e}")

        return mentions
