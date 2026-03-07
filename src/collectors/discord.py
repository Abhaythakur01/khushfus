import logging
import os
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

DISCORD_API_BASE = "https://discord.com/api/v10"


class DiscordCollector(BaseCollector):
    """Collects mentions from Discord channels using the Bot API."""

    platform = "discord"

    def __init__(self):
        self.bot_token = os.getenv("DISCORD_BOT_TOKEN", "")
        # Comma-separated channel IDs to monitor
        self.channel_ids = [
            cid.strip()
            for cid in os.getenv("DISCORD_CHANNEL_IDS", "").split(",")
            if cid.strip()
        ]

    async def validate_credentials(self) -> bool:
        if not self.bot_token:
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{DISCORD_API_BASE}/users/@me",
                    headers=self._headers(),
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def collect(
        self, keywords: list[str], since: datetime | None = None
    ) -> list[CollectedMention]:
        if not self.bot_token:
            logger.warning("DISCORD_BOT_TOKEN not configured, skipping collection")
            return []

        if not self.channel_ids:
            logger.warning("No DISCORD_CHANNEL_IDS configured, skipping collection")
            return []

        mentions: list[CollectedMention] = []

        for channel_id in self.channel_ids:
            try:
                messages = await self._fetch_channel_messages(channel_id)
                for msg in messages:
                    text = msg.get("content", "")
                    matched = self._matches_keywords(text, keywords)
                    if not matched:
                        continue

                    published = None
                    if msg.get("timestamp"):
                        published = datetime.fromisoformat(
                            msg["timestamp"].replace("Z", "+00:00")
                        )

                    if since and published and published < since:
                        continue

                    author = msg.get("author", {})
                    reaction_count = sum(
                        r.get("count", 0) for r in msg.get("reactions", [])
                    )
                    thread = msg.get("thread")
                    thread_message_count = thread.get("message_count", 0) if thread else 0

                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=msg.get("id", ""),
                            source_url=f"https://discord.com/channels/{msg.get('guild_id', '@me')}/{channel_id}/{msg.get('id', '')}",
                            text=text,
                            author_name=author.get("global_name", author.get("username", "")),
                            author_handle=f"{author.get('username', '')}#{author.get('discriminator', '0')}",
                            likes=reaction_count,
                            comments=thread_message_count,
                            published_at=published,
                            raw_data=msg,
                        )
                    )

            except httpx.HTTPStatusError as e:
                logger.error(f"Discord API error for channel {channel_id}: {e.response.status_code}")
            except Exception as e:
                logger.error(f"Discord collection failed for channel {channel_id}: {e}")

        logger.info(f"Collected {len(mentions)} Discord mentions for keywords: {keywords}")
        return mentions

    async def _fetch_channel_messages(self, channel_id: str) -> list[dict]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{DISCORD_API_BASE}/channels/{channel_id}/messages",
                headers=self._headers(),
                params={"limit": 100},
                timeout=30.0,
            )

            if resp.status_code == 429:
                retry_after = resp.json().get("retry_after", 60)
                logger.warning(f"Discord rate limited, retry after {retry_after}s")
                return []

            resp.raise_for_status()
            return resp.json()

    def _headers(self) -> dict:
        return {"Authorization": f"Bot {self.bot_token}"}
