import logging
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention

logger = logging.getLogger(__name__)

BLUESKY_SEARCH_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts"


class BlueskyCollector(BaseCollector):
    """Collects mentions from Bluesky using the AT Protocol public search API."""

    platform = "bluesky"

    async def validate_credentials(self) -> bool:
        return True  # Public API, no credentials needed

    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        mentions: list[CollectedMention] = []

        for keyword in keywords:
            params: dict = {
                "q": keyword,
                "limit": 100,
            }
            if since:
                params["since"] = since.strftime("%Y-%m-%dT%H:%M:%SZ")

            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        BLUESKY_SEARCH_URL,
                        params=params,
                        timeout=30.0,
                    )

                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "60"))
                        logger.warning(f"Bluesky rate limited, retry after {retry_after}s")
                        continue

                    resp.raise_for_status()
                    data = resp.json()

                for post in data.get("posts", []):
                    record = post.get("record", {})
                    author = post.get("author", {})
                    text = record.get("text", "")

                    published = None
                    created_at = record.get("createdAt") or post.get("indexedAt")
                    if created_at:
                        published = datetime.fromisoformat(created_at.replace("Z", "+00:00"))

                    if since and published and published < since:
                        continue

                    # Extract URI for URL construction
                    uri = post.get("uri", "")
                    # URI format: at://did:plc:xxx/app.bsky.feed.post/rkey
                    handle = author.get("handle", "")
                    rkey = uri.rsplit("/", 1)[-1] if "/" in uri else ""
                    post_url = f"https://bsky.app/profile/{handle}/post/{rkey}" if handle and rkey else ""

                    mentions.append(
                        CollectedMention(
                            platform=self.platform,
                            source_id=uri,
                            source_url=post_url,
                            text=text,
                            author_name=author.get("displayName", ""),
                            author_handle=handle,
                            author_profile_url=f"https://bsky.app/profile/{handle}",
                            author_followers=author.get("followersCount", 0),
                            likes=post.get("likeCount", 0),
                            shares=post.get("repostCount", 0),
                            comments=post.get("replyCount", 0),
                            published_at=published,
                            raw_data=post,
                        )
                    )

            except httpx.HTTPStatusError as e:
                logger.error(f"Bluesky API error: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                logger.error(f"Bluesky collection failed for '{keyword}': {e}")

        logger.info(f"Collected {len(mentions)} Bluesky mentions for keywords: {keywords}")
        return mentions
