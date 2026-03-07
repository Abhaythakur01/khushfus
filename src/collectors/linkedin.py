import logging
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention
from src.config.settings import settings

logger = logging.getLogger(__name__)

LI_API_BASE = "https://api.linkedin.com/v2"
LI_COMMUNITY_API = "https://api.linkedin.com/rest"


class LinkedInCollector(BaseCollector):
    """Collects mentions from LinkedIn via the Marketing/Community Management API.

    LinkedIn's API is the most restrictive of all major platforms:
    - Organization Social Actions require "rw_organization_social" scope
    - Community Management API requires Partner Program approval
    - UGC (user-generated content) posts require "w_member_social" scope

    What this collects:
    - Posts published on the organization page
    - Comments on organization posts
    - Share statistics / engagement metrics
    - Mentions of the organization (requires Community Management API)
    """

    platform = "linkedin"

    def __init__(self):
        self.access_token = settings.linkedin_access_token

    async def validate_credentials(self) -> bool:
        if not self.access_token:
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{LI_API_BASE}/me",
                    headers=self._headers(),
                    timeout=15.0,
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def collect(
        self, keywords: list[str], since: datetime | None = None
    ) -> list[CollectedMention]:
        if not self.access_token:
            logger.warning("LinkedIn access token not configured, skipping collection")
            return []

        mentions = []

        # Get organization ID
        org_id = await self._get_organization_id()
        if not org_id:
            logger.warning("No LinkedIn organization found, falling back to personal posts")
            personal_mentions = await self._collect_personal_posts(keywords, since)
            mentions.extend(personal_mentions)
            return mentions

        # Collect organization posts
        org_mentions = await self._collect_org_posts(org_id, keywords, since)
        mentions.extend(org_mentions)

        # Collect mentions of the organization
        mention_mentions = await self._collect_org_mentions(org_id, keywords, since)
        mentions.extend(mention_mentions)

        logger.info(f"Collected {len(mentions)} LinkedIn mentions for keywords: {keywords}")
        return mentions

    async def _get_organization_id(self) -> str | None:
        """Get the first organization the authenticated user administers."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{LI_API_BASE}/organizationalEntityAcls",
                    headers=self._headers(),
                    params={"q": "roleAssignee", "role": "ADMINISTRATOR", "count": 1},
                    timeout=15.0,
                )
                if resp.status_code != 200:
                    return None
                data = resp.json()
                elements = data.get("elements", [])
                if elements:
                    org_urn = elements[0].get("organizationalTarget", "")
                    return org_urn.split(":")[-1] if org_urn else None
        except Exception as e:
            logger.error(f"Failed to get LinkedIn organization: {e}")
        return None

    async def _collect_org_posts(
        self, org_id: str, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{LI_API_BASE}/ugcPosts",
                    headers=self._headers(),
                    params={
                        "q": "authors",
                        "authors": f"urn:li:organization:{org_id}",
                        "count": 50,
                    },
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    logger.warning(f"LinkedIn UGC posts returned {resp.status_code}")
                    return []
                data = resp.json()

            for post in data.get("elements", []):
                text = self._extract_post_text(post)
                if not text:
                    continue

                published = None
                created_time = post.get("created", {}).get("time")
                if created_time:
                    published = datetime.fromtimestamp(created_time / 1000)
                    if since and published < since:
                        continue

                post_urn = post.get("id", "")
                activity_id = post_urn.split(":")[-1] if post_urn else ""

                # Get engagement stats
                stats = await self._get_post_stats(post_urn)

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=activity_id,
                        source_url=f"https://www.linkedin.com/feed/update/{post_urn}",
                        text=text,
                        author_name=f"Organization:{org_id}",
                        author_handle=org_id,
                        likes=stats.get("likes", 0),
                        shares=stats.get("shares", 0),
                        comments=stats.get("comments", 0),
                        published_at=published,
                        raw_data=post,
                    )
                )

                # Collect comments on the post
                comment_mentions = await self._collect_post_comments(
                    post_urn, keywords
                )
                mentions.extend(comment_mentions)

        except Exception as e:
            logger.error(f"Failed to collect org posts: {e}")

        return mentions

    async def _collect_personal_posts(
        self, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        """Fallback: collect posts from the authenticated user's feed."""
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{LI_API_BASE}/ugcPosts",
                    headers=self._headers(),
                    params={"q": "authors", "authors": "urn:li:person:me", "count": 50},
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    return []
                data = resp.json()

            for post in data.get("elements", []):
                text = self._extract_post_text(post)
                if not text or not self._matches_keywords(text, keywords):
                    continue

                published = None
                created_time = post.get("created", {}).get("time")
                if created_time:
                    published = datetime.fromtimestamp(created_time / 1000)
                    if since and published < since:
                        continue

                post_urn = post.get("id", "")
                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=post_urn.split(":")[-1],
                        source_url=f"https://www.linkedin.com/feed/update/{post_urn}",
                        text=text,
                        author_name="",
                        author_handle="me",
                        published_at=published,
                        raw_data=post,
                    )
                )
        except Exception as e:
            logger.error(f"Failed to collect personal posts: {e}")

        return mentions

    async def _collect_org_mentions(
        self, org_id: str, keywords: list[str], since: datetime | None
    ) -> list[CollectedMention]:
        """Collect posts that mention/tag the organization. Requires Community Management API."""
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{LI_COMMUNITY_API}/socialActions/urn:li:organization:{org_id}/mentions",
                    headers={**self._headers(), "LinkedIn-Version": "202401"},
                    params={"count": 50},
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    # This endpoint requires Community Management API approval
                    logger.debug("LinkedIn mentions endpoint not accessible (requires partner approval)")
                    return []
                data = resp.json()

            for element in data.get("elements", []):
                text = element.get("text", "")
                if not text:
                    continue

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=element.get("id", ""),
                        source_url="",
                        text=text,
                        author_name=element.get("actor", ""),
                        author_handle="",
                        published_at=None,
                        raw_data=element,
                    )
                )
        except Exception as e:
            logger.error(f"Failed to collect org mentions: {e}")

        return mentions

    async def _get_post_stats(self, post_urn: str) -> dict:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{LI_API_BASE}/socialActions/{post_urn}",
                    headers=self._headers(),
                    timeout=15.0,
                )
                if resp.status_code != 200:
                    return {}
                data = resp.json()
                return {
                    "likes": data.get("likesSummary", {}).get("totalLikes", 0),
                    "comments": data.get("commentsSummary", {}).get("totalFirstLevelComments", 0),
                    "shares": data.get("sharesSummary", {}).get("totalShares", 0) if "sharesSummary" in data else 0,
                }
        except Exception:
            return {}

    async def _collect_post_comments(
        self, post_urn: str, keywords: list[str]
    ) -> list[CollectedMention]:
        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{LI_API_BASE}/socialActions/{post_urn}/comments",
                    headers=self._headers(),
                    params={"count": 100},
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    return []
                data = resp.json()

            for comment in data.get("elements", []):
                text = comment.get("message", {}).get("text", "")
                if not text or not self._matches_keywords(text, keywords):
                    continue

                created_time = comment.get("created", {}).get("time")
                published = datetime.fromtimestamp(created_time / 1000) if created_time else None

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=comment.get("id", "").split(":")[-1],
                        source_url="",
                        text=text,
                        author_name=comment.get("actor", ""),
                        author_handle="",
                        likes=comment.get("likesSummary", {}).get("totalLikes", 0),
                        published_at=published,
                        raw_data=comment,
                    )
                )
        except Exception as e:
            logger.error(f"Failed to collect comments for {post_urn}: {e}")

        return mentions

    def _extract_post_text(self, post: dict) -> str:
        specific = post.get("specificContent", {})
        share = specific.get("com.linkedin.ugc.ShareContent", {})
        share_commentary = share.get("shareCommentary", {})
        return share_commentary.get("text", "")

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "X-Restli-Protocol-Version": "2.0.0",
        }
