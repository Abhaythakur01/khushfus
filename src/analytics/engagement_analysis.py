"""
Engagement analysis: optimal posting times, platform comparison, and virality scoring.
"""

import logging
import math
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention, Platform

logger = logging.getLogger(__name__)


class EngagementAnalyzer:
    """Analyse engagement patterns across time, platforms, and individual mentions."""

    async def compute_engagement_by_hour(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
    ) -> list[dict]:
        """Group mentions by hour of day (0-23), compute average engagement per mention.

        Returns:
            List of 24 dicts (one per hour), each with ``hour``, ``mention_count``,
            ``avg_likes``, ``avg_shares``, ``avg_comments``, ``avg_total_engagement``,
            and ``is_peak``.
        """
        stmt = (
            select(
                func.strftime("%H", Mention.collected_at).label("hour"),
                func.count().label("mention_count"),
                func.avg(Mention.likes).label("avg_likes"),
                func.avg(Mention.shares).label("avg_shares"),
                func.avg(Mention.comments).label("avg_comments"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(func.strftime("%H", Mention.collected_at))
            .order_by(func.strftime("%H", Mention.collected_at))
        )

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        hourly: list[dict] = []
        for row in rows:
            avg_likes = float(row.avg_likes or 0)
            avg_shares = float(row.avg_shares or 0)
            avg_comments = float(row.avg_comments or 0)
            hourly.append({
                "hour": int(row.hour),
                "mention_count": int(row.mention_count),
                "avg_likes": round(avg_likes, 2),
                "avg_shares": round(avg_shares, 2),
                "avg_comments": round(avg_comments, 2),
                "avg_total_engagement": round(avg_likes + avg_shares + avg_comments, 2),
            })

        # Mark peak hour(s) — top 3 by total engagement
        if hourly:
            sorted_by_eng = sorted(hourly, key=lambda h: h["avg_total_engagement"], reverse=True)
            peak_hours = {h["hour"] for h in sorted_by_eng[:3]}
            for h in hourly:
                h["is_peak"] = h["hour"] in peak_hours

        logger.info("Computed engagement by hour: %d hours with data for project %d", len(hourly), project_id)
        return hourly

    async def compute_engagement_by_platform(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
    ) -> list[dict]:
        """Compute per-platform engagement totals and averages.

        Returns:
            List of dicts with ``platform``, ``mention_count``, ``total_likes``,
            ``total_shares``, ``total_comments``, ``total_reach``,
            ``avg_engagement_per_mention``.
        """
        stmt = (
            select(
                Mention.platform,
                func.count().label("mention_count"),
                func.sum(Mention.likes).label("total_likes"),
                func.sum(Mention.shares).label("total_shares"),
                func.sum(Mention.comments).label("total_comments"),
                func.sum(Mention.reach).label("total_reach"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(Mention.platform)
            .order_by(func.count().desc())
        )

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        platforms: list[dict] = []
        for row in rows:
            mention_count = int(row.mention_count or 0)
            total_likes = int(row.total_likes or 0)
            total_shares = int(row.total_shares or 0)
            total_comments = int(row.total_comments or 0)
            total_engagement = total_likes + total_shares + total_comments

            platform_value = row.platform.value if isinstance(row.platform, Platform) else str(row.platform)

            platforms.append({
                "platform": platform_value,
                "mention_count": mention_count,
                "total_likes": total_likes,
                "total_shares": total_shares,
                "total_comments": total_comments,
                "total_reach": int(row.total_reach or 0),
                "avg_engagement_per_mention": round(total_engagement / mention_count, 2) if mention_count > 0 else 0.0,
            })

        logger.info("Computed engagement for %d platforms in project %d", len(platforms), project_id)
        return platforms

    async def compute_virality_scores(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
        limit: int = 20,
    ) -> list[dict]:
        """Score and rank mentions by virality potential.

        Formula: ``log(shares + 1) * 2 + log(likes + 1) + log(comments + 1)``

        Returns:
            Top ``limit`` mentions by virality score, each with ``mention_id``,
            ``text`` (truncated), ``platform``, ``author_handle``, engagement
            stats, and ``virality_score``.
        """
        stmt = (
            select(
                Mention.id,
                Mention.text,
                Mention.platform,
                Mention.author_handle,
                Mention.likes,
                Mention.shares,
                Mention.comments,
                Mention.reach,
                Mention.source_url,
                Mention.published_at,
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
        )

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        scored: list[dict] = []
        for row in rows:
            likes = int(row.likes or 0)
            shares = int(row.shares or 0)
            comments = int(row.comments or 0)

            score = math.log(shares + 1) * 2 + math.log(likes + 1) + math.log(comments + 1)

            platform_value = row.platform.value if isinstance(row.platform, Platform) else str(row.platform)
            text_preview = (row.text[:200] + "...") if row.text and len(row.text) > 200 else (row.text or "")

            scored.append({
                "mention_id": row.id,
                "text": text_preview,
                "platform": platform_value,
                "author_handle": row.author_handle,
                "likes": likes,
                "shares": shares,
                "comments": comments,
                "reach": int(row.reach or 0),
                "source_url": row.source_url,
                "published_at": row.published_at.isoformat() if row.published_at else None,
                "virality_score": round(score, 4),
            })

        scored.sort(key=lambda s: s["virality_score"], reverse=True)
        top = scored[:limit]

        logger.info(
            "Computed virality scores for %d mentions in project %d, returning top %d",
            len(scored), project_id, len(top),
        )
        return top
