import logging
from datetime import datetime

import httpx

from src.collectors.base import BaseCollector, CollectedMention
from src.config.settings import settings

logger = logging.getLogger(__name__)

TWITTER_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent"


class TwitterCollector(BaseCollector):
    platform = "twitter"

    def __init__(self):
        self.bearer_token = settings.twitter_bearer_token

    async def validate_credentials(self) -> bool:
        if not self.bearer_token:
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.twitter.com/2/users/me",
                    headers=self._headers(),
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def collect(
        self, keywords: list[str], since: datetime | None = None
    ) -> list[CollectedMention]:
        if not self.bearer_token:
            logger.warning("Twitter bearer token not configured, skipping collection")
            return []

        query = " OR ".join(f'"{kw}"' for kw in keywords)
        params = {
            "query": query,
            "max_results": 100,
            "tweet.fields": "created_at,public_metrics,author_id,lang",
            "user.fields": "name,username,public_metrics,profile_image_url",
            "expansions": "author_id",
        }

        if since:
            params["start_time"] = since.strftime("%Y-%m-%dT%H:%M:%SZ")

        mentions = []
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    TWITTER_SEARCH_URL,
                    headers=self._headers(),
                    params=params,
                    timeout=30.0,
                )
                resp.raise_for_status()
                data = resp.json()

            users_map = {}
            for user in data.get("includes", {}).get("users", []):
                users_map[user["id"]] = user

            for tweet in data.get("data", []):
                author = users_map.get(tweet.get("author_id"), {})
                metrics = tweet.get("public_metrics", {})

                mentions.append(
                    CollectedMention(
                        platform=self.platform,
                        source_id=tweet["id"],
                        source_url=f"https://twitter.com/i/status/{tweet['id']}",
                        text=tweet["text"],
                        author_name=author.get("name", ""),
                        author_handle=author.get("username", ""),
                        author_followers=author.get("public_metrics", {}).get(
                            "followers_count", 0
                        ),
                        author_profile_url=f"https://twitter.com/{author.get('username', '')}",
                        likes=metrics.get("like_count", 0),
                        shares=metrics.get("retweet_count", 0),
                        comments=metrics.get("reply_count", 0),
                        reach=metrics.get("impression_count", 0),
                        published_at=datetime.fromisoformat(
                            tweet["created_at"].replace("Z", "+00:00")
                        ),
                        raw_data=tweet,
                    )
                )

            logger.info(f"Collected {len(mentions)} tweets for keywords: {keywords}")

        except httpx.HTTPStatusError as e:
            logger.error(f"Twitter API error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            logger.error(f"Twitter collection failed: {e}")

        return mentions

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.bearer_token}"}
