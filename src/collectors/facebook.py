import logging
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention
from src.config.settings import settings

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"


class FacebookCollector(BaseCollector):
    """Collects mentions from Facebook pages and posts via Graph API.

    Requires a Page Access Token with pages_read_engagement and pages_read_user_content
    permissions. For monitoring public page mentions, you also need the page_public_content_access
    feature (requires Meta app review).

    What this collects:
    - Posts on monitored Facebook pages
    - Comments on those posts
    - Posts mentioning the brand via search (requires approved app)
    """

    platform = "facebook"

    def __init__(self):
        self.access_token = settings.facebook_page_access_token
        self.app_id = settings.facebook_app_id

    async def validate_credentials(self) -> bool:
        if not self.access_token:
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/me",
                    params={"access_token": self.access_token},
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def collect(
        self, keywords: list[str], since: datetime | None = None
    ) -> list[CollectedMention]:
        if not self.access_token:
            logger.warning("Facebook access token not configured, skipping collection")
            return []

        mentions = []

        # Step 1: Get pages managed by this token
        pages = await self._get_managed_pages()

        for page in pages:
            page_id = page["id"]
            page_name = page["name"]
            page_token = page.get("access_token", self.access_token)

            # Step 2: Get recent posts from the page
            posts = await self._get_page_posts(page_id, page_token, since)

            for post in posts:
                post_text = post.get("message", "")

                # Check if post matches keywords
                matched = self._matches_keywords(post_text, keywords)
                if matched or not post_text:
                    post_id = post["id"]
                    metrics = await self._get_post_metrics(post_id, page_token)

                    if post_text:
                        mentions.append(
                            CollectedMention(
                                platform=self.platform,
                                source_id=post_id,
                                source_url=f"https://facebook.com/{post_id}",
                                text=post_text,
                                author_name=page_name,
                                author_handle=page_id,
                                likes=metrics.get("likes", 0),
                                shares=metrics.get("shares", 0),
                                comments=metrics.get("comments", 0),
                                published_at=_parse_fb_time(post.get("created_time")),
                                raw_data=post,
                            )
                        )

                    # Step 3: Collect comments on this post
                    comment_mentions = await self._get_post_comments(
                        post_id, page_token, keywords
                    )
                    mentions.extend(comment_mentions)

            # Step 4: Search for page mentions/tags
            tagged_mentions = await self._get_page_tagged_posts(page_id, page_token, keywords)
            mentions.extend(tagged_mentions)

        logger.info(f"Collected {len(mentions)} Facebook mentions for keywords: {keywords}")
        return mentions

    async def _get_managed_pages(self) -> list[dict]:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/me/accounts",
                    params={
                        "access_token": self.access_token,
                        "fields": "id,name,access_token,fan_count",
                    },
                    timeout=30.0,
                )
                resp.raise_for_status()
                return resp.json().get("data", [])
        except Exception as e:
            logger.error(f"Failed to get Facebook pages: {e}")
            return []

    async def _get_page_posts(
        self, page_id: str, page_token: str, since: datetime | None
    ) -> list[dict]:
        params = {
            "access_token": page_token,
            "fields": "id,message,created_time,from",
            "limit": 100,
        }
        if since:
            params["since"] = int(since.timestamp())

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/{page_id}/feed",
                    params=params,
                    timeout=30.0,
                )
                resp.raise_for_status()
                return resp.json().get("data", [])
        except Exception as e:
            logger.error(f"Failed to get posts for page {page_id}: {e}")
            return []

    async def _get_post_metrics(self, post_id: str, page_token: str) -> dict:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/{post_id}",
                    params={
                        "access_token": page_token,
                        "fields": "likes.summary(true),shares,comments.summary(true)",
                    },
                    timeout=15.0,
                )
                resp.raise_for_status()
                data = resp.json()
                return {
                    "likes": data.get("likes", {}).get("summary", {}).get("total_count", 0),
                    "shares": data.get("shares", {}).get("count", 0),
                    "comments": data.get("comments", {}).get("summary", {}).get("total_count", 0),
                }
        except Exception:
            return {"likes": 0, "shares": 0, "comments": 0}

    async def _get_post_comments(
        self, post_id: str, page_token: str, keywords: list[str]
    ) -> list[CollectedMention]:
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/{post_id}/comments",
                    params={
                        "access_token": page_token,
                        "fields": "id,message,from,created_time,like_count",
                        "limit": 200,
                    },
                    timeout=30.0,
                )
                resp.raise_for_status()
                data = resp.json()

            for comment in data.get("data", []):
                text = comment.get("message", "")
                if not text or not self._matches_keywords(text, keywords):
                    continue

                from_data = comment.get("from", {})
                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=comment["id"],
                        source_url=f"https://facebook.com/{comment['id']}",
                        text=text,
                        author_name=from_data.get("name", ""),
                        author_handle=from_data.get("id", ""),
                        likes=comment.get("like_count", 0),
                        published_at=_parse_fb_time(comment.get("created_time")),
                        raw_data=comment,
                    )
                )
        except Exception as e:
            logger.error(f"Failed to get comments for post {post_id}: {e}")

        return mentions

    async def _get_page_tagged_posts(
        self, page_id: str, page_token: str, keywords: list[str]
    ) -> list[CollectedMention]:
        """Get posts where the page has been tagged/mentioned."""
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{GRAPH_API_BASE}/{page_id}/tagged",
                    params={
                        "access_token": page_token,
                        "fields": "id,message,from,created_time",
                        "limit": 50,
                    },
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    return []
                data = resp.json()

            for post in data.get("data", []):
                text = post.get("message", "")
                if not text:
                    continue

                from_data = post.get("from", {})
                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=post["id"],
                        source_url=f"https://facebook.com/{post['id']}",
                        text=text,
                        author_name=from_data.get("name", ""),
                        author_handle=from_data.get("id", ""),
                        published_at=_parse_fb_time(post.get("created_time")),
                        raw_data=post,
                    )
                )
        except Exception as e:
            logger.error(f"Failed to get tagged posts for page {page_id}: {e}")

        return mentions


def _parse_fb_time(time_str: str | None) -> datetime | None:
    if not time_str:
        return None
    try:
        return datetime.fromisoformat(time_str.replace("Z", "+00:00").replace("+0000", "+00:00"))
    except Exception:
        return None
