import logging
import os
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)


class ReviewSiteCollector(BaseCollector):
    """Multi-source collector for review sites: Trustpilot, G2, Yelp, TripAdvisor."""

    platform = "reviews"

    def __init__(self):
        self.trustpilot_api_key = os.getenv("TRUSTPILOT_API_KEY", "")
        self.trustpilot_business_ids = [
            bid.strip()
            for bid in os.getenv("TRUSTPILOT_BUSINESS_IDS", "").split(",")
            if bid.strip()
        ]
        self.yelp_api_key = os.getenv("YELP_API_KEY", "")
        self.yelp_business_ids = [
            bid.strip()
            for bid in os.getenv("YELP_BUSINESS_IDS", "").split(",")
            if bid.strip()
        ]
        self.g2_product_urls = [
            url.strip()
            for url in os.getenv("G2_PRODUCT_URLS", "").split(",")
            if url.strip()
        ]

    async def validate_credentials(self) -> bool:
        return bool(self.trustpilot_api_key or self.yelp_api_key or self.g2_product_urls)

    async def collect(
        self, keywords: list[str], since: datetime | None = None
    ) -> list[CollectedMention]:
        mentions: list[CollectedMention] = []

        # Trustpilot
        if self.trustpilot_api_key and self.trustpilot_business_ids:
            trustpilot_mentions = await self._collect_trustpilot(keywords, since)
            mentions.extend(trustpilot_mentions)

        # Yelp
        if self.yelp_api_key and self.yelp_business_ids:
            yelp_mentions = await self._collect_yelp(keywords, since)
            mentions.extend(yelp_mentions)

        # G2 (scraping)
        if self.g2_product_urls:
            g2_mentions = await self._collect_g2(keywords, since)
            mentions.extend(g2_mentions)

        logger.info(f"Collected {len(mentions)} review site mentions for keywords: {keywords}")
        return mentions

    async def _collect_trustpilot(
        self, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        mentions = []

        for business_id in self.trustpilot_business_ids:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"https://api.trustpilot.com/v1/business-units/{business_id}/reviews",
                        headers={"apikey": self.trustpilot_api_key},
                        params={"perPage": 100, "orderBy": "createdat.desc"},
                        timeout=30.0,
                    )

                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "60"))
                        logger.warning(f"Trustpilot rate limited, retry after {retry_after}s")
                        continue

                    resp.raise_for_status()
                    data = resp.json()

                for review in data.get("reviews", []):
                    text = f"{review.get('title', '')} {review.get('text', '')}"
                    matched = self._matches_keywords(text, keywords)
                    if not matched:
                        continue

                    published = None
                    if review.get("createdAt"):
                        published = datetime.fromisoformat(
                            review["createdAt"].replace("Z", "+00:00")
                        )

                    if since and published and published < since:
                        continue

                    consumer = review.get("consumer", {})
                    rating = review.get("stars", 0)

                    mentions.append(
                        CollectedMention(
                            platform="trustpilot",
                            source_id=review.get("id", ""),
                            source_url=review.get("url", f"https://www.trustpilot.com/review/{business_id}"),
                            text=text.strip(),
                            author_name=consumer.get("displayName", ""),
                            author_handle=consumer.get("displayName", ""),
                            likes=0,
                            published_at=published,
                            raw_data={**review, "star_rating": rating, "source": "trustpilot"},
                        )
                    )

            except httpx.HTTPStatusError as e:
                logger.error(f"Trustpilot API error for {business_id}: {e.response.status_code}")
            except Exception as e:
                logger.error(f"Trustpilot collection failed for {business_id}: {e}")

        return mentions

    async def _collect_yelp(
        self, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        mentions = []

        for business_id in self.yelp_business_ids:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"https://api.yelp.com/v3/businesses/{business_id}/reviews",
                        headers={"Authorization": f"Bearer {self.yelp_api_key}"},
                        params={"limit": 50, "sort_by": "newest"},
                        timeout=30.0,
                    )

                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "60"))
                        logger.warning(f"Yelp rate limited, retry after {retry_after}s")
                        continue

                    resp.raise_for_status()
                    data = resp.json()

                for review in data.get("reviews", []):
                    text = review.get("text", "")
                    matched = self._matches_keywords(text, keywords)
                    if not matched:
                        continue

                    published = None
                    if review.get("time_created"):
                        try:
                            published = datetime.fromisoformat(review["time_created"])
                        except (ValueError, TypeError):
                            pass

                    if since and published and published < since:
                        continue

                    user = review.get("user", {})
                    rating = review.get("rating", 0)

                    mentions.append(
                        CollectedMention(
                            platform="yelp",
                            source_id=review.get("id", ""),
                            source_url=review.get("url", ""),
                            text=text,
                            author_name=user.get("name", ""),
                            author_handle=user.get("name", ""),
                            author_profile_url=user.get("profile_url", ""),
                            published_at=published,
                            raw_data={**review, "star_rating": rating, "source": "yelp"},
                        )
                    )

            except httpx.HTTPStatusError as e:
                logger.error(f"Yelp API error for {business_id}: {e.response.status_code}")
            except Exception as e:
                logger.error(f"Yelp collection failed for {business_id}: {e}")

        return mentions

    async def _collect_g2(
        self, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        """Scrape public G2 reviews using BeautifulSoup."""
        mentions = []

        try:
            from bs4 import BeautifulSoup
        except ImportError:
            logger.warning("beautifulsoup4 not installed, skipping G2 review scraping")
            return mentions

        for product_url in self.g2_product_urls:
            try:
                reviews_url = product_url.rstrip("/") + "/reviews"
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        reviews_url,
                        headers={
                            "User-Agent": "Mozilla/5.0 (compatible; KhushFus/1.0)",
                        },
                        timeout=30.0,
                        follow_redirects=True,
                    )

                    if resp.status_code == 429:
                        logger.warning("G2 rate limited, skipping")
                        continue

                    resp.raise_for_status()

                soup = BeautifulSoup(resp.text, "html.parser")
                review_divs = soup.select("[itemprop='review']")

                for div in review_divs:
                    title_el = div.select_one("[itemprop='name']")
                    body_el = div.select_one("[itemprop='reviewBody']")
                    author_el = div.select_one("[itemprop='author']")
                    date_el = div.select_one("[itemprop='datePublished']")
                    rating_el = div.select_one("[itemprop='ratingValue']")

                    title = title_el.get_text(strip=True) if title_el else ""
                    body = body_el.get_text(strip=True) if body_el else ""
                    text = f"{title} {body}".strip()

                    matched = self._matches_keywords(text, keywords)
                    if not matched:
                        continue

                    published = None
                    if date_el:
                        date_str = date_el.get("content", date_el.get_text(strip=True))
                        try:
                            published = datetime.fromisoformat(date_str)
                        except (ValueError, TypeError):
                            pass

                    if since and published and published < since:
                        continue

                    author_name = author_el.get_text(strip=True) if author_el else ""
                    rating = float(rating_el.get("content", "0")) if rating_el else 0

                    mentions.append(
                        CollectedMention(
                            platform="g2",
                            source_id=f"g2-{hash(text)}",
                            source_url=reviews_url,
                            text=text,
                            author_name=author_name,
                            author_handle=author_name,
                            published_at=published,
                            raw_data={"star_rating": rating, "source": "g2", "product_url": product_url},
                        )
                    )

            except Exception as e:
                logger.error(f"G2 scraping failed for {product_url}: {e}")

        return mentions
