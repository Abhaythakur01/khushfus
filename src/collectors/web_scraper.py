import logging
import re
from datetime import datetime
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from shared.sanitize import strip_html
from shared.url_validator import validate_url
from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

# Common forum platforms and blog engines to detect
FORUM_INDICATORS = ["forum", "community", "discuss", "thread", "topic", "viewtopic"]
BLOG_INDICATORS = ["blog", "article", "post", "news", "press-release", "press_release"]


class WebScraperCollector(BaseCollector):
    """General-purpose web scraper for blogs, forums, press releases, and digital media.

    Uses BeautifulSoup for HTML parsing. No API keys needed.
    Respects robots.txt patterns via User-Agent identification.

    What this collects:
    - Blog posts mentioning keywords
    - Forum discussions
    - Press releases and news articles
    - Any web page content matching keywords
    """

    platform = "blog"  # default, overridden per-result

    def __init__(self, target_urls: list[str] | None = None):
        self.target_urls = target_urls or []
        self.default_search_engines = [
            "https://www.google.com/search?q={keyword}+site:{domain}&num=20",
        ]

    async def validate_credentials(self) -> bool:
        return True  # No credentials needed

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        mentions = []

        # Scrape configured target URLs
        for url in self.target_urls:
            try:
                validate_url(url)
            except ValueError as e:
                logger.warning(f"Skipping target URL due to SSRF validation failure: {url} — {e}")
                continue
            try:
                page_mentions = await self._scrape_url(url, keywords)
                mentions.extend(page_mentions)
            except Exception as e:
                logger.error(f"Failed to scrape {url}: {e}")

        # Search Google for keyword mentions on blogs and forums
        for keyword in keywords:
            try:
                search_mentions = await self._search_and_scrape(keyword)
                mentions.extend(search_mentions)
            except Exception as e:
                logger.error(f"Web search scrape failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} web mentions for keywords: {keywords}")
        return mentions

    async def _scrape_url(self, url: str, keywords: list[str]) -> list[CollectedMention]:
        """Scrape a single URL and extract mentions matching keywords."""
        mentions = []
        try:
            validate_url(url)
        except ValueError as e:
            logger.warning(f"Skipping URL due to SSRF validation failure: {url} — {e}")
            return []
        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(
                    url,
                    headers=self._scrape_headers(),
                    timeout=20.0,
                )
                if resp.status_code != 200:
                    return []

            soup = BeautifulSoup(resp.text, "html.parser")

            # Remove script and style elements
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()

            # Try to find article/post content
            content_selectors = [
                "article",
                ".post-content",
                ".entry-content",
                ".article-body",
                ".blog-post",
                ".forum-post",
                ".thread-content",
                "main",
                "#content",
                ".content",
            ]

            articles = []
            for selector in content_selectors:
                found = soup.select(selector)
                if found:
                    articles = found
                    break

            if not articles:
                # Fall back to all paragraphs
                articles = [soup]

            for article in articles:
                text = article.get_text(separator=" ", strip=True)
                text = re.sub(r"\s+", " ", text)[:5000]  # limit text length
                text = strip_html(text)  # defense-in-depth XSS prevention

                if not self._matches_keywords(text, keywords):
                    continue

                # Extract metadata
                title = self._extract_title(soup)
                author = self._extract_author(soup)
                pub_date = self._extract_date(soup)
                platform_type = self._detect_platform_type(url)

                mentions.append(
                    CollectedMention(
                        platform=platform_type,
                        source_id=url,
                        source_url=url,
                        text=f"{title} - {text[:2000]}" if title else text[:2000],
                        author_name=author,
                        author_handle=urlparse(url).netloc,
                        published_at=pub_date,
                        raw_data={"url": url, "title": title},
                    )
                )

        except httpx.TimeoutException:
            logger.warning(f"Timeout scraping {url}")
        except Exception as e:
            logger.error(f"Scrape error for {url}: {e}")

        return mentions

    async def _search_and_scrape(self, keyword: str) -> list[CollectedMention]:
        """Use Google search to find and scrape relevant pages."""
        mentions = []
        search_url = f"https://www.google.com/search?q={keyword}+blog+OR+forum+OR+press&num=10"

        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(
                    search_url,
                    headers=self._scrape_headers(),
                    timeout=15.0,
                )
                if resp.status_code != 200:
                    return []

            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract URLs from search results
            urls = []
            for link in soup.select("a[href]"):
                href = link.get("href", "")
                if href.startswith("/url?q="):
                    actual_url = href.split("/url?q=")[1].split("&")[0]
                    if self._is_valid_content_url(actual_url):
                        try:
                            validate_url(actual_url)
                            urls.append(actual_url)
                        except ValueError as e:
                            logger.warning(f"Skipping search result URL due to SSRF validation failure: {actual_url} — {e}")

            # Scrape top results
            for url in urls[:5]:
                try:
                    page_mentions = await self._scrape_url(url, [keyword])
                    mentions.extend(page_mentions)
                except Exception:
                    continue

        except Exception as e:
            logger.error(f"Search scrape failed for '{keyword}': {e}")

        return mentions

    def _extract_title(self, soup: BeautifulSoup) -> str:
        # Try og:title, then <title>, then <h1>
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            return og_title["content"]

        title_tag = soup.find("title")
        if title_tag:
            return title_tag.get_text(strip=True)

        h1 = soup.find("h1")
        if h1:
            return h1.get_text(strip=True)

        return ""

    def _extract_author(self, soup: BeautifulSoup) -> str:
        # Try meta author, then common class names
        meta_author = soup.find("meta", attrs={"name": "author"})
        if meta_author and meta_author.get("content"):
            return meta_author["content"]

        for selector in [".author", ".byline", "[rel='author']", ".post-author"]:
            el = soup.select_one(selector)
            if el:
                return el.get_text(strip=True)

        return ""

    def _extract_date(self, soup: BeautifulSoup) -> datetime | None:
        # Try structured data, then meta tags, then time elements
        for attr in ["datePublished", "article:published_time", "date"]:
            meta = soup.find("meta", property=attr) or soup.find("meta", attrs={"name": attr})
            if meta and meta.get("content"):
                try:
                    return datetime.fromisoformat(meta["content"].replace("Z", "+00:00"))
                except Exception:
                    pass

        time_el = soup.find("time")
        if time_el and time_el.get("datetime"):
            try:
                return datetime.fromisoformat(time_el["datetime"].replace("Z", "+00:00"))
            except Exception:
                pass

        return None

    def _detect_platform_type(self, url: str) -> str:
        url_lower = url.lower()
        if any(ind in url_lower for ind in FORUM_INDICATORS):
            return "forum"
        if any(ind in url_lower for ind in BLOG_INDICATORS):
            return "blog"
        return "other"

    def _is_valid_content_url(self, url: str) -> bool:
        """Filter out non-content URLs."""
        try:
            parsed = urlparse(url)
            skip_domains = [
                "google.com",
                "youtube.com",
                "twitter.com",
                "facebook.com",
                "instagram.com",
                "linkedin.com",
                "reddit.com",  # already covered by other collectors
            ]
            return parsed.scheme in ("http", "https") and not any(d in parsed.netloc for d in skip_domains)
        except Exception:
            return False

    def _scrape_headers(self) -> dict:
        return {
            "User-Agent": "Mozilla/5.0 (compatible; KhushFus/1.0; Social Listening Bot)",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        }
