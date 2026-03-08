import logging
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)


class QuoraCollector(BaseCollector):
    """Collects mentions from Quora via web scraping.

    Quora doesn't have a public API, so this collector scrapes
    the public web interface to find questions and answers mentioning keywords.

    What this collects:
    - Questions mentioning keywords
    - Answer snippets from public question pages
    - Author and upvote information when available
    """

    platform = "forum"

    async def validate_credentials(self) -> bool:
        return True  # Web scraping, no credentials

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        mentions = []

        for keyword in keywords:
            try:
                search_mentions = await self._search_quora(keyword)
                mentions.extend(search_mentions)
            except Exception as e:
                logger.error(f"Quora collection failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} Quora mentions for keywords: {keywords}")
        return mentions

    async def _search_quora(self, keyword: str) -> list[CollectedMention]:
        mentions = []

        # Use Google to search Quora (more reliable than scraping Quora search directly)
        search_url = f"https://www.google.com/search?q=site:quora.com+{keyword}&num=15"

        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(
                    search_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Accept": "text/html",
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                    timeout=15.0,
                )
                if resp.status_code != 200:
                    return []

            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract Quora URLs from Google results
            quora_urls = []
            for link in soup.select("a[href]"):
                href = link.get("href", "")
                if "quora.com" in href:
                    # Extract actual URL from Google redirect
                    if "/url?q=" in href:
                        actual = href.split("/url?q=")[1].split("&")[0]
                        if "quora.com" in actual:
                            quora_urls.append(actual)

            # Scrape each Quora page
            for url in quora_urls[:8]:
                try:
                    page_mentions = await self._scrape_quora_page(url, keyword)
                    mentions.extend(page_mentions)
                except Exception:
                    continue

        except Exception as e:
            logger.error(f"Quora search failed for '{keyword}': {e}")

        return mentions

    async def _scrape_quora_page(self, url: str, keyword: str) -> list[CollectedMention]:
        mentions = []

        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(
                    url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Accept": "text/html",
                    },
                    timeout=15.0,
                )
                if resp.status_code != 200:
                    return []

            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract question title
            title = ""
            title_el = soup.select_one("meta[property='og:title']")
            if title_el:
                title = title_el.get("content", "")
            if not title:
                h1 = soup.find("h1")
                title = h1.get_text(strip=True) if h1 else ""

            # Extract answer snippets
            description = ""
            desc_el = soup.select_one("meta[property='og:description']")
            if desc_el:
                description = desc_el.get("content", "")

            text = f"{title} - {description}" if description else title
            if not text or keyword.lower() not in text.lower():
                return []

            mentions.append(
                CollectedMention(
                    platform="forum",
                    source_id=url,
                    source_url=url,
                    text=text[:3000],
                    author_name="Quora",
                    author_handle="quora.com",
                    published_at=None,
                    raw_data={"url": url, "title": title},
                )
            )

        except Exception as e:
            logger.error(f"Quora page scrape failed for {url}: {e}")

        return mentions
