import logging
import os
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

ITUNES_SEARCH_URL = "https://itunes.apple.com/search"
ITUNES_REVIEWS_URL = "https://itunes.apple.com/{country}/rss/customerreviews/id={app_id}/sortBy=mostRecent/json"


class AppStoreCollector(BaseCollector):
    """Collects app reviews from Apple App Store (iTunes API) and Google Play Store."""

    platform = "appstore"

    def __init__(self):
        # Comma-separated app IDs for Apple App Store
        self.apple_app_ids = [aid.strip() for aid in os.getenv("APPLE_APP_IDS", "").split(",") if aid.strip()]
        # Comma-separated package names for Google Play Store
        self.play_store_packages = [
            pkg.strip() for pkg in os.getenv("PLAY_STORE_PACKAGES", "").split(",") if pkg.strip()
        ]
        self.country = os.getenv("APPSTORE_COUNTRY", "us")

    async def validate_credentials(self) -> bool:
        # iTunes API is free, no auth. Play scraper needs no auth either.
        return bool(self.apple_app_ids or self.play_store_packages)

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        mentions: list[CollectedMention] = []

        # Collect Apple App Store reviews
        for app_id in self.apple_app_ids:
            try:
                reviews = await self._fetch_apple_reviews(app_id)
                for review in reviews:
                    text = f"{review.get('title', '')} {review.get('content', '')}"
                    matched = self._matches_keywords(text, keywords)
                    if not matched:
                        continue

                    published = None
                    if review.get("updated"):
                        try:
                            published = datetime.fromisoformat(review["updated"].replace("Z", "+00:00"))
                        except (ValueError, TypeError):
                            pass

                    if since and published and published < since:
                        continue

                    rating = review.get("rating", 0)
                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=review.get("id", ""),
                            source_url=f"https://apps.apple.com/{self.country}/app/id{app_id}",
                            text=text.strip(),
                            author_name=review.get("author", ""),
                            author_handle=review.get("author", ""),
                            likes=review.get("vote_count", 0),
                            published_at=published,
                            raw_data={**review, "star_rating": rating, "source": "apple"},
                        )
                    )
            except Exception as e:
                logger.error(f"Apple App Store collection failed for app {app_id}: {e}")

        # Collect Google Play Store reviews
        for package in self.play_store_packages:
            try:
                reviews = await self._fetch_play_reviews(package, keywords)
                mentions.extend(reviews)
            except Exception as e:
                logger.error(f"Play Store collection failed for package {package}: {e}")

        logger.info(f"Collected {len(mentions)} app store mentions for keywords: {keywords}")
        return mentions

    async def _fetch_apple_reviews(self, app_id: str) -> list[dict]:
        url = ITUNES_REVIEWS_URL.format(country=self.country, app_id=app_id)
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=30.0)

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", "60"))
                logger.warning(f"iTunes rate limited, retry after {retry_after}s")
                return []

            resp.raise_for_status()
            data = resp.json()

        entries = data.get("feed", {}).get("entry", [])
        reviews = []
        for entry in entries:
            # Skip the app metadata entry (first entry)
            if "im:rating" not in entry:
                continue
            reviews.append(
                {
                    "id": entry.get("id", {}).get("label", ""),
                    "title": entry.get("title", {}).get("label", ""),
                    "content": entry.get("content", {}).get("label", ""),
                    "author": entry.get("author", {}).get("name", {}).get("label", ""),
                    "rating": int(entry.get("im:rating", {}).get("label", "0")),
                    "vote_count": int(entry.get("im:voteCount", {}).get("label", "0")),
                    "updated": entry.get("updated", {}).get("label"),
                }
            )
        return reviews

    async def _fetch_play_reviews(self, package: str, keywords: list[str]) -> list[CollectedMention]:
        """Fetch Google Play reviews using google-play-scraper."""
        mentions = []
        try:
            # google-play-scraper is synchronous; run in default executor
            import asyncio

            from google_play_scraper import Sort
            from google_play_scraper import reviews as gplay_reviews

            loop = asyncio.get_event_loop()
            result, _ = await loop.run_in_executor(
                None,
                lambda: gplay_reviews(package, lang="en", country=self.country, sort=Sort.NEWEST, count=200),
            )

            for review in result:
                text = review.get("content", "")
                matched = self._matches_keywords(text, keywords)
                if not matched:
                    continue

                published = review.get("at")
                rating = review.get("score", 0)

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=review.get("reviewId", ""),
                        source_url=f"https://play.google.com/store/apps/details?id={package}",
                        text=text,
                        author_name=review.get("userName", ""),
                        author_handle=review.get("userName", ""),
                        likes=review.get("thumbsUpCount", 0),
                        published_at=published,
                        raw_data={**review, "star_rating": rating, "source": "google_play"},
                    )
                )

        except ImportError:
            logger.warning("google-play-scraper not installed, skipping Play Store reviews")
        except Exception as e:
            logger.error(f"Play Store scraping failed for {package}: {e}")

        return mentions
