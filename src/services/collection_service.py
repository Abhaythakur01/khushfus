import json
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.collectors.base import BaseCollector, CollectedMention
from src.collectors.facebook import FacebookCollector
from src.collectors.gdelt import GdeltCollector
from src.collectors.instagram import InstagramCollector
from src.collectors.linkedin import LinkedInCollector
from src.collectors.news import NewsCollector
from src.collectors.quora import QuoraCollector
from src.collectors.reddit import RedditCollector
from src.collectors.telegram import TelegramCollector
from src.collectors.twitter import TwitterCollector
from src.collectors.web_scraper import WebScraperCollector
from src.collectors.youtube import YouTubeCollector
from src.models.keyword import Keyword
from src.models.mention import Mention, Platform, Sentiment
from src.models.project import Project, ProjectStatus
from src.nlp.analyzer import SentimentAnalyzer

logger = logging.getLogger(__name__)

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
}

analyzer = SentimentAnalyzer()


async def collect_for_project(db: AsyncSession, project_id: int, since: datetime | None = None):
    """Run collection across all configured platforms for a project."""
    project = await db.get(Project, project_id)
    if not project or project.status != ProjectStatus.ACTIVE:
        logger.warning(f"Project {project_id} not found or not active")
        return

    # Get active keywords
    result = await db.execute(
        select(Keyword).where(Keyword.project_id == project_id, Keyword.is_active.is_(True))
    )
    keywords = [kw.term for kw in result.scalars().all()]
    if not keywords:
        logger.warning(f"No active keywords for project {project_id}")
        return

    # Determine which platforms to collect from
    configured_platforms = [p.strip() for p in project.platforms.split(",")]

    total_collected = 0
    for platform_name in configured_platforms:
        collector_cls = PLATFORM_COLLECTORS.get(platform_name)
        if not collector_cls:
            continue

        collector = collector_cls()
        try:
            raw_mentions = await collector.collect(keywords, since)
            stored = await _store_mentions(db, project_id, raw_mentions, keywords)
            total_collected += stored
            logger.info(
                f"[{project.name}] {platform_name}: collected {len(raw_mentions)}, stored {stored}"
            )
        except Exception as e:
            logger.error(f"[{project.name}] {platform_name} collection failed: {e}")

    logger.info(f"[{project.name}] Total mentions collected: {total_collected}")
    return total_collected


async def _store_mentions(
    db: AsyncSession,
    project_id: int,
    raw_mentions: list[CollectedMention],
    keywords: list[str],
) -> int:
    """Analyze and store collected mentions, skipping duplicates."""
    stored = 0

    for raw in raw_mentions:
        # Skip duplicates by source_id + platform
        existing = await db.execute(
            select(Mention).where(
                Mention.project_id == project_id,
                Mention.source_id == raw.source_id,
                Mention.platform == raw.platform,
            )
        )
        if existing.scalar_one_or_none():
            continue

        # Run NLP analysis
        analysis = analyzer.analyze(raw.text)

        # Find which keywords matched
        matched = [kw for kw in keywords if kw.lower() in raw.text.lower()]

        mention = Mention(
            project_id=project_id,
            platform=Platform(raw.platform),
            source_id=raw.source_id,
            source_url=raw.source_url,
            text=raw.text,
            author_name=raw.author_name,
            author_handle=raw.author_handle,
            author_followers=raw.author_followers,
            author_profile_url=raw.author_profile_url,
            likes=raw.likes,
            shares=raw.shares,
            comments=raw.comments,
            reach=raw.reach,
            sentiment=Sentiment(analysis.sentiment),
            sentiment_score=analysis.sentiment_score,
            language=analysis.language,
            matched_keywords=",".join(matched),
            topics=",".join(analysis.topics),
            entities=json.dumps(analysis.entities),
            published_at=raw.published_at,
        )
        db.add(mention)
        stored += 1

    await db.commit()
    return stored
