import logging
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)


class TelegramCollector(BaseCollector):
    """Collects mentions from public Telegram channels via t.me web preview.

    No Telegram Bot API token required for public channels — uses the
    web preview endpoint that Telegram provides for public channels.

    For private/restricted channels, a Bot API token would be needed.

    What this collects:
    - Messages from configured public Telegram channels
    - Text content with keyword matching
    - View counts (when available via web preview)
    """

    platform = "forum"  # closest platform category

    def __init__(self, channels: list[str] | None = None):
        self.channels = channels or []

    async def validate_credentials(self) -> bool:
        return True  # Public channels don't need auth

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        if not self.channels:
            logger.debug("No Telegram channels configured, skipping")
            return []

        mentions = []

        for channel in self.channels:
            channel = channel.lstrip("@")
            try:
                channel_mentions = await self._scrape_channel(channel, keywords, since)
                mentions.extend(channel_mentions)
            except Exception as e:
                logger.error(f"Telegram collection failed for @{channel}: {e}")

        logger.info(f"Collected {len(mentions)} Telegram mentions for keywords: {keywords}")
        return mentions

    async def _scrape_channel(
        self, channel: str, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        mentions = []
        url = f"https://t.me/s/{channel}"

        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(
                    url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (compatible; KhushFus/1.0)",
                        "Accept": "text/html",
                    },
                    timeout=20.0,
                )
                if resp.status_code != 200:
                    logger.warning(f"Telegram channel @{channel} returned {resp.status_code}")
                    return []

            soup = BeautifulSoup(resp.text, "html.parser")
            messages = soup.select(".tgme_widget_message")

            for msg in messages:
                text_el = msg.select_one(".tgme_widget_message_text")
                if not text_el:
                    continue

                text = text_el.get_text(separator=" ", strip=True)
                if not self._matches_keywords(text, keywords):
                    continue

                # Extract message metadata
                msg_link = msg.get("data-post", "")
                msg_id = msg_link.split("/")[-1] if msg_link else ""

                # Date
                date_el = msg.select_one("time[datetime]")
                published = None
                if date_el and date_el.get("datetime"):
                    try:
                        published = datetime.fromisoformat(date_el["datetime"].replace("Z", "+00:00"))
                    except Exception:
                        pass

                if since and published and published < since:
                    continue

                # Views
                views_el = msg.select_one(".tgme_widget_message_views")
                views = 0
                if views_el:
                    views_text = views_el.get_text(strip=True)
                    views = self._parse_view_count(views_text)

                # Author
                author_el = msg.select_one(".tgme_widget_message_owner_name")
                author_name = author_el.get_text(strip=True) if author_el else channel

                mentions.append(
                    CollectedMention(
                        platform="forum",
                        source_id=f"tg_{channel}_{msg_id}",
                        source_url=f"https://t.me/{msg_link}" if msg_link else url,
                        text=text[:3000],
                        author_name=author_name,
                        author_handle=f"@{channel}",
                        reach=views,
                        published_at=published,
                        raw_data={"channel": channel, "message_id": msg_id},
                    )
                )

        except httpx.TimeoutException:
            logger.warning(f"Timeout scraping Telegram channel @{channel}")
        except Exception as e:
            logger.error(f"Telegram scrape failed for @{channel}: {e}")

        return mentions

    def _parse_view_count(self, text: str) -> int:
        """Parse view counts like '1.2K', '45.3M', '892'."""
        text = text.strip().upper()
        try:
            if text.endswith("K"):
                return int(float(text[:-1]) * 1_000)
            elif text.endswith("M"):
                return int(float(text[:-1]) * 1_000_000)
            elif text.endswith("B"):
                return int(float(text[:-1]) * 1_000_000_000)
            else:
                return int(text.replace(",", ""))
        except (ValueError, IndexError):
            return 0
