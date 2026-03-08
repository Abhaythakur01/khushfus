"""
Re-exports all collectors and the platform registry.
Uses the existing collector implementations from src/collectors/.
"""

from src.collectors.appstore import AppStoreCollector
from src.collectors.base import BaseCollector
from src.collectors.bluesky import BlueskyCollector
from src.collectors.discord import DiscordCollector
from src.collectors.facebook import FacebookCollector
from src.collectors.gdelt import GdeltCollector
from src.collectors.instagram import InstagramCollector
from src.collectors.linkedin import LinkedInCollector
from src.collectors.mastodon import MastodonCollector
from src.collectors.news import NewsCollector
from src.collectors.pinterest import PinterestCollector
from src.collectors.podcast import PodcastCollector
from src.collectors.quora import QuoraCollector
from src.collectors.reddit import RedditCollector
from src.collectors.reviews import ReviewSiteCollector
from src.collectors.telegram import TelegramCollector
from src.collectors.threads import ThreadsCollector
from src.collectors.tiktok import TikTokCollector
from src.collectors.twitter import TwitterCollector
from src.collectors.web_scraper import WebScraperCollector
from src.collectors.youtube import YouTubeCollector

PLATFORM_COLLECTORS: dict[str, type[BaseCollector]] = {
    "twitter": TwitterCollector,
    "youtube": YouTubeCollector,
    "news": NewsCollector,
    "reddit": RedditCollector,
    "facebook": FacebookCollector,
    "instagram": InstagramCollector,
    "linkedin": LinkedInCollector,
    "blog": WebScraperCollector,
    "forum": WebScraperCollector,
    "gdelt": GdeltCollector,
    "telegram": TelegramCollector,
    "quora": QuoraCollector,
    "tiktok": TikTokCollector,
    "discord": DiscordCollector,
    "threads": ThreadsCollector,
    "bluesky": BlueskyCollector,
    "pinterest": PinterestCollector,
    "appstore": AppStoreCollector,
    "reviews": ReviewSiteCollector,
    "mastodon": MastodonCollector,
    "podcast": PodcastCollector,
}
