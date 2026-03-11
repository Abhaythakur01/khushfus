"""
Direct collection pipeline — runs collectors + NLP + storage inline in the gateway.

Used when Redis/microservices are unavailable (local dev, single-node deploy).
Runs as a FastAPI BackgroundTask so the HTTP response returns immediately.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import select

from shared.models import Keyword, Mention, Platform, Project, Sentiment
from src.collectors.base import CollectedMention

logger = logging.getLogger(__name__)

# Map collector platform strings to Platform enum values
PLATFORM_ENUM_MAP: dict[str, Platform] = {p.value: p for p in Platform}

# Free-tier collectors that work without API keys
FREE_COLLECTORS = {
    "reddit": "src.collectors.reddit.RedditCollector",
    "news": "src.collectors.news.NewsCollector",
    "mastodon": "src.collectors.mastodon.MastodonCollector",
}

# GDELT is also free but uses platform="news", so we add it separately
GDELT_COLLECTOR = "src.collectors.gdelt.GdeltCollector"


def _get_collector_instance(dotted_path: str):
    """Dynamically import and instantiate a collector class."""
    module_path, class_name = dotted_path.rsplit(".", 1)
    import importlib
    module = importlib.import_module(module_path)
    cls = getattr(module, class_name)
    return cls()


def _run_vader(text: str) -> tuple[Sentiment, float]:
    """Run VADER sentiment analysis. Returns (sentiment_enum, compound_score)."""
    try:
        from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        analyzer = SentimentIntensityAnalyzer()
        scores = analyzer.polarity_scores(text)
        compound = scores["compound"]

        if compound >= 0.05:
            return Sentiment.POSITIVE, compound
        elif compound <= -0.05:
            return Sentiment.NEGATIVE, compound
        else:
            return Sentiment.NEUTRAL, compound
    except Exception as e:
        logger.warning(f"VADER failed: {e}")
        return Sentiment.NEUTRAL, 0.0


def _detect_language(text: str) -> str:
    """Detect language using langdetect. Returns ISO 639-1 code."""
    try:
        from langdetect import detect
        return detect(text)
    except Exception:
        return "en"


async def run_direct_collection(
    session_factory,
    project_id: int,
    hours_back: int = 24,
):
    """
    Collect mentions directly without Redis/microservices.

    1. Load project + keywords from DB
    2. Run free-tier collectors for each keyword
    3. Analyze each mention with VADER sentiment
    4. Store results in the mentions table
    """
    logger.info(f"Starting direct collection for project {project_id} (last {hours_back}h)")

    async with session_factory() as session:
        # Load project with keywords
        result = await session.execute(
            select(Project).where(Project.id == project_id)
        )
        project = result.scalar_one_or_none()
        if not project:
            logger.error(f"Project {project_id} not found")
            return

        # Load keywords
        kw_result = await session.execute(
            select(Keyword).where(
                Keyword.project_id == project_id,
                Keyword.is_active == True,  # noqa: E712
            )
        )
        keywords = [kw.term for kw in kw_result.scalars().all()]

        if not keywords:
            logger.warning(f"Project {project_id} has no active keywords — skipping collection")
            return

        # Determine which platforms the project is tracking
        project_platforms = set()
        if project.platforms:
            project_platforms = {p.strip().lower() for p in project.platforms.split(",") if p.strip()}

        # Use naive UTC datetime to match collector output (most return naive datetimes)
        since = datetime.utcnow() - timedelta(hours=hours_back)

        # Collect from all available free collectors
        all_raw: list[CollectedMention] = []

        collectors_to_run: list[tuple[str, str]] = []

        for platform_name, dotted_path in FREE_COLLECTORS.items():
            # Run collector if project tracks this platform or tracks "all"
            if not project_platforms or platform_name in project_platforms or "all" in project_platforms:
                collectors_to_run.append((platform_name, dotted_path))

        # Always try GDELT for news if news is in platforms
        if not project_platforms or "news" in project_platforms or "all" in project_platforms:
            collectors_to_run.append(("gdelt", GDELT_COLLECTOR))

        for platform_name, dotted_path in collectors_to_run:
            try:
                collector = _get_collector_instance(dotted_path)
                logger.info(f"Running {platform_name} collector for keywords: {keywords}")
                mentions = await collector.collect(keywords, since=since)
                all_raw.extend(mentions)
                logger.info(f"{platform_name}: collected {len(mentions)} raw mentions")
            except Exception as e:
                logger.error(f"{platform_name} collector failed: {e}")

        if not all_raw:
            logger.info(f"No mentions collected for project {project_id}")
            return

        # Deduplicate by source_id
        seen_source_ids: set[str] = set()
        unique_raw: list[CollectedMention] = []
        for m in all_raw:
            if m.source_id and m.source_id in seen_source_ids:
                continue
            if m.source_id:
                seen_source_ids.add(m.source_id)
            unique_raw.append(m)

        logger.info(f"Processing {len(unique_raw)} unique mentions (from {len(all_raw)} total)")

        # Check existing source_ids to avoid duplicate DB entries
        existing_ids_result = await session.execute(
            select(Mention.source_id).where(
                Mention.project_id == project_id,
                Mention.source_id.in_([m.source_id for m in unique_raw if m.source_id]),
            )
        )
        existing_ids = {row for row in existing_ids_result.scalars().all()}

        stored_count = 0
        for raw in unique_raw:
            if raw.source_id and raw.source_id in existing_ids:
                continue

            # NLP: VADER sentiment
            sentiment, sentiment_score = _run_vader(raw.text)

            # Language detection
            lang = _detect_language(raw.text)

            # Match which keywords appear in the text
            matched = [kw for kw in keywords if kw.lower() in raw.text.lower()]

            # Map platform string to enum
            platform_enum = PLATFORM_ENUM_MAP.get(raw.platform, Platform.OTHER)

            mention = Mention(
                project_id=project_id,
                platform=platform_enum,
                source_id=raw.source_id,
                source_url=raw.source_url,
                text=raw.text[:10000],  # Truncate very long texts
                author_name=raw.author_name,
                author_handle=raw.author_handle,
                author_followers=raw.author_followers,
                author_profile_url=raw.author_profile_url,
                likes=raw.likes,
                shares=raw.shares,
                comments=raw.comments,
                reach=raw.reach or raw.author_followers,
                sentiment=sentiment,
                sentiment_score=sentiment_score,
                language=lang,
                matched_keywords=",".join(matched),
                published_at=raw.published_at,
                is_flagged=False,
            )
            session.add(mention)
            stored_count += 1

        await session.commit()
        logger.info(
            f"Direct collection complete for project {project_id}: "
            f"{stored_count} mentions stored, {len(unique_raw) - stored_count} duplicates skipped"
        )
