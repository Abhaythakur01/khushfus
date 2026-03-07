"""
Data Enrichment Service -- long-running async consumer for author/mention enrichment.

Consumes from STREAM_ENRICHMENT ('enrichment:request') and performs:
1. Influence scoring: log(followers) * engagement_rate
2. Bot detection: heuristic based on account age, posting patterns, handle, follower/following ratio
3. Organization resolution: checks author bio/name for known org keywords
4. Virality scoring: shares/likes velocity relative to follower count

Updates the Mention record with enrichment fields and publishes EnrichmentResultEvent
to STREAM_ENRICHMENT_RESULTS.
"""

import asyncio
import json
import logging
import math
import os
import re
from datetime import datetime, timedelta

from sqlalchemy import select, func

from shared.database import create_db
from shared.events import (
    EnrichmentResultEvent,
    EventBus,
    STREAM_ENRICHMENT,
    STREAM_ENRICHMENT_RESULTS,
)
from shared.models import Mention

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus"
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

GROUP_NAME = "enrichment-service"
CONSUMER_NAME = f"enrichment-{os.getpid()}"

# Known organization keywords for org resolution
ORG_KEYWORDS = [
    "inc", "inc.", "corp", "corp.", "corporation", "llc", "ltd", "ltd.",
    "limited", "company", "co.", "group", "holdings", "partners",
    "foundation", "institute", "association", "agency", "consulting",
    "solutions", "technologies", "tech", "labs", "studio", "studios",
    "media", "news", "press", "network", "networks", "global",
    "international", "university", "college", "school", "hospital",
    "healthcare", "pharma", "bank", "financial", "insurance",
    "ventures", "capital", "investments", "enterprises", "services",
    "software", "systems", "digital", "analytics", "research",
    "official", "verified", "brand", "team", "hq",
]

# Patterns suggesting bot accounts
BOT_HANDLE_PATTERNS = [
    r"bot\d*$",
    r"_bot$",
    r"^bot_",
    r"\d{6,}$",          # handles ending in long number sequences
    r"^[a-z]{2,4}\d{5,}",  # short prefix + many digits
    r"auto_?\w*post",
    r"feed_?bot",
    r"spam",
    r"promo\d+",
    r"^temp_",
    r"follow_?back",
    r"gain_?follow",
]


def calculate_influence_score(
    followers: int,
    total_engagement: int,
    post_count: int,
) -> float:
    """
    Calculate influence score based on:
      log(followers) * engagement_rate

    engagement_rate = total_engagement / max(post_count, 1) / max(followers, 1)
    Clamped to [0.0, 100.0] range.
    """
    if followers <= 0:
        return 0.0

    effective_posts = max(post_count, 1)
    avg_engagement_per_post = total_engagement / effective_posts
    engagement_rate = avg_engagement_per_post / max(followers, 1)

    # Core formula: log(followers) * engagement_rate
    # Use log base 10 so the scale is reasonable
    score = math.log10(max(followers, 1)) * engagement_rate * 100

    # Normalize to 0-100 range
    return round(min(max(score, 0.0), 100.0), 4)


def detect_bot(
    author_handle: str,
    author_followers: int,
    author_following: int,
    account_age_days: int,
    post_count: int,
    bio: str,
) -> bool:
    """
    Heuristic bot detection based on multiple signals.
    Returns True if the account is likely a bot.

    Signals (each adds to a risk score 0-10):
    1. Handle matches bot patterns
    2. Account age < 30 days with high activity
    3. Follower/following ratio anomaly
    4. Extremely high posting frequency
    5. Bio is empty or contains spam keywords
    """
    risk_score = 0.0
    handle_lower = (author_handle or "").lower()
    bio_lower = (bio or "").lower()

    # Signal 1: Handle pattern matching
    for pattern in BOT_HANDLE_PATTERNS:
        if re.search(pattern, handle_lower):
            risk_score += 2.5
            break

    # Signal 2: New account with high activity
    if account_age_days > 0:
        if account_age_days < 30 and post_count > 500:
            risk_score += 2.0
        elif account_age_days < 7 and post_count > 50:
            risk_score += 2.5
    else:
        # Unknown age is mildly suspicious
        risk_score += 0.5

    # Signal 3: Follower/following ratio anomaly
    if author_following > 0 and author_followers > 0:
        ratio = author_followers / author_following
        # Following massively more than followers = follow-unfollow bot behavior
        if ratio < 0.01 and author_following > 1000:
            risk_score += 2.0
        # Perfectly round follower counts are suspicious
        if author_followers > 100 and author_followers % 100 == 0:
            risk_score += 0.5
    elif author_following == 0 and author_followers == 0:
        risk_score += 1.0

    # Signal 4: Extreme posting frequency
    if account_age_days > 0:
        posts_per_day = post_count / max(account_age_days, 1)
        if posts_per_day > 100:
            risk_score += 2.5
        elif posts_per_day > 50:
            risk_score += 1.5

    # Signal 5: Bio analysis
    if not bio or len(bio.strip()) == 0:
        risk_score += 0.5
    else:
        spam_keywords = [
            "follow back", "follow4follow", "f4f", "gain followers",
            "free followers", "buy followers", "dm for promo",
            "automated", "bot account",
        ]
        for kw in spam_keywords:
            if kw in bio_lower:
                risk_score += 2.0
                break

    # Threshold: 5.0 or higher is considered bot
    return risk_score >= 5.0


def resolve_organization(
    author_name: str,
    author_bio: str,
) -> str:
    """
    Check if author name or bio contains known organization keywords.
    Returns the detected org name or empty string.
    """
    name_lower = (author_name or "").lower().strip()
    bio_lower = (author_bio or "").lower().strip()

    # Check author name for org keywords
    name_tokens = name_lower.split()
    for keyword in ORG_KEYWORDS:
        if keyword in name_tokens:
            # Return the original (un-lowered) author name as the org name
            return author_name.strip()

    # Check bio for "at @org" or "works at" patterns
    org_patterns = [
        r"(?:@|works?\s+(?:at|for|with))\s+([A-Z][\w&.\-]+(?:\s+[\w&.\-]+){0,3})",
        r"(?:CEO|CTO|CFO|COO|VP|Director|Manager|Head)\s+(?:at|of)\s+([A-Z][\w&.\-]+(?:\s+[\w&.\-]+){0,3})",
        r"([A-Z][\w&.\-]+(?:\s+[\w&.\-]+){0,3})\s+(?:official|verified)",
    ]
    for pattern in org_patterns:
        match = re.search(pattern, author_bio or "")
        if match:
            return match.group(1).strip()

    # Check bio for org keywords alongside capitalized words
    if bio_lower:
        for keyword in ORG_KEYWORDS:
            if keyword in bio_lower:
                # Try to extract the org name from surrounding context
                pattern = rf"([A-Z][\w&.\-]+(?:\s+[\w&.\-]+){{0,2}}\s+{re.escape(keyword)})"
                match = re.search(pattern, author_bio or "")
                if match:
                    return match.group(1).strip()

    return ""


def calculate_virality_score(
    likes: int,
    shares: int,
    comments: int,
    followers: int,
    hours_since_published: float,
) -> float:
    """
    Calculate virality score based on engagement velocity relative to follower count.

    Formula:
      velocity = (shares * 3 + likes + comments * 2) / max(hours_since_published, 0.5)
      virality = velocity / max(followers, 1) * 1000

    Shares weighted 3x (primary virality driver), comments 2x.
    Normalized per 1000 followers.
    Clamped to [0.0, 100.0].
    """
    if followers <= 0 and (likes + shares + comments) == 0:
        return 0.0

    effective_hours = max(hours_since_published, 0.5)
    effective_followers = max(followers, 1)

    # Weighted engagement
    weighted_engagement = (shares * 3) + likes + (comments * 2)

    # Velocity: engagement per hour
    velocity = weighted_engagement / effective_hours

    # Normalize by follower count (per 1000 followers)
    virality = (velocity / effective_followers) * 1000

    return round(min(max(virality, 0.0), 100.0), 4)


async def enrich_mention(session_factory, mention_id: int, data: dict) -> EnrichmentResultEvent | None:
    """
    Perform all enrichment steps on a single mention and update the database record.
    Returns the result event or None on failure.
    """
    async with session_factory() as db:
        mention = await db.get(Mention, mention_id)
        if not mention:
            logger.warning(f"Mention {mention_id} not found, skipping enrichment")
            return None

        # Gather data from mention + event payload
        author_handle = data.get("author_handle", mention.author_handle or "")
        author_followers = int(data.get("author_followers", mention.author_followers or 0))
        author_name = mention.author_name or ""

        # For bot detection, use what we have (some fields may be unavailable)
        # In production these would come from a profile lookup service
        author_following = int(data.get("author_following", 0))
        account_age_days = int(data.get("account_age_days", 365))  # default 1 year if unknown
        author_bio = data.get("author_bio", "")

        # Calculate post count from DB for this author in this project
        from sqlalchemy import func as sqlfunc
        post_count_result = await db.execute(
            select(sqlfunc.count(Mention.id)).where(
                Mention.author_handle == author_handle,
                Mention.project_id == mention.project_id,
            )
        )
        post_count = post_count_result.scalar() or 1

        # Total engagement for this author across all their mentions in the project
        engagement_result = await db.execute(
            select(
                sqlfunc.sum(Mention.likes),
                sqlfunc.sum(Mention.shares),
                sqlfunc.sum(Mention.comments),
            ).where(
                Mention.author_handle == author_handle,
                Mention.project_id == mention.project_id,
            )
        )
        eng = engagement_result.one()
        total_likes = eng[0] or 0
        total_shares = eng[1] or 0
        total_comments = eng[2] or 0
        total_engagement = total_likes + total_shares + total_comments

        # --- 1. Influence Scoring ---
        influence_score = calculate_influence_score(
            followers=author_followers,
            total_engagement=total_engagement,
            post_count=post_count,
        )

        # --- 2. Bot Detection ---
        is_bot = detect_bot(
            author_handle=author_handle,
            author_followers=author_followers,
            author_following=author_following,
            account_age_days=account_age_days,
            post_count=post_count,
            bio=author_bio,
        )

        # --- 3. Organization Resolution ---
        org_name = resolve_organization(
            author_name=author_name,
            author_bio=author_bio,
        )

        # --- 4. Virality Scoring ---
        hours_since_published = 1.0  # default
        if mention.published_at:
            delta = datetime.utcnow() - mention.published_at
            hours_since_published = max(delta.total_seconds() / 3600, 0.5)

        virality_score = calculate_virality_score(
            likes=mention.likes,
            shares=mention.shares,
            comments=mention.comments,
            followers=author_followers,
            hours_since_published=hours_since_published,
        )

        # --- Update Mention Record ---
        mention.author_influence_score = influence_score
        mention.author_is_bot = is_bot
        mention.author_org = org_name if org_name else None
        mention.virality_score = virality_score

        await db.commit()

        logger.info(
            f"Enriched mention {mention_id}: influence={influence_score:.2f}, "
            f"bot={is_bot}, org='{org_name}', virality={virality_score:.2f}"
        )

        return EnrichmentResultEvent(
            mention_id=mention_id,
            influence_score=influence_score,
            is_bot=is_bot,
            org_name=org_name,
            virality_score=virality_score,
        )


async def process_loop(bus: EventBus, session_factory):
    """Main consumer loop: read enrichment requests, process, publish results."""
    await bus.ensure_group(STREAM_ENRICHMENT, GROUP_NAME)
    logger.info("Enrichment Service listening on '%s'...", STREAM_ENRICHMENT)

    while True:
        try:
            messages = await bus.consume(
                STREAM_ENRICHMENT, GROUP_NAME, CONSUMER_NAME,
                count=20, block_ms=3000,
            )

            for msg_id, data in messages:
                try:
                    mention_id = int(data.get("mention_id", 0))
                    if mention_id == 0:
                        logger.warning(f"Invalid mention_id in enrichment request: {data}")
                        continue

                    result = await enrich_mention(session_factory, mention_id, data)

                    if result:
                        await bus.publish(STREAM_ENRICHMENT_RESULTS, result)

                except Exception as e:
                    logger.error(f"Enrichment failed for message {msg_id}: {e}", exc_info=True)
                finally:
                    await bus.ack(STREAM_ENRICHMENT, GROUP_NAME, msg_id)

        except Exception as e:
            logger.error(f"Enrichment consumer loop error: {e}", exc_info=True)
            await asyncio.sleep(1)


async def main():
    engine, session_factory = create_db(DATABASE_URL)
    bus = EventBus(REDIS_URL)
    await bus.connect()

    logger.info("Data Enrichment Service started")
    try:
        await process_loop(bus, session_factory)
    finally:
        await bus.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
