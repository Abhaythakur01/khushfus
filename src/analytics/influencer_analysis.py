"""
Influencer analysis: ranking by composite score and bot detection heuristics.
"""

import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention

logger = logging.getLogger(__name__)


class InfluencerAnalyzer:
    """Rank influencers by impact and detect likely bot accounts."""

    async def rank_influencers(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
        limit: int = 50,
    ) -> list[dict]:
        """Rank authors by a composite influence score.

        Score formula per author:
            ``0.4 * normalized_followers + 0.3 * normalized_engagement + 0.3 * normalized_mention_count``

        Normalization is min-max within the result set.

        Returns:
            Ranked list of dicts with ``author_handle``, ``author_name``,
            ``mention_count``, ``total_followers``, ``total_engagement``,
            ``composite_score``, and ``rank``.
        """
        stmt = (
            select(
                Mention.author_handle,
                func.max(Mention.author_name).label("author_name"),
                func.count().label("mention_count"),
                func.max(Mention.author_followers).label("max_followers"),
                func.sum(Mention.likes + Mention.shares + Mention.comments).label("total_engagement"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
                Mention.author_handle.isnot(None),
            )
            .group_by(Mention.author_handle)
        )

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        # Extract raw values
        entries = []
        for row in rows:
            entries.append({
                "author_handle": row.author_handle,
                "author_name": row.author_name,
                "mention_count": int(row.mention_count or 0),
                "total_followers": int(row.max_followers or 0),
                "total_engagement": int(row.total_engagement or 0),
            })

        # Min-max normalization helpers
        def _normalize(values: list[float]) -> list[float]:
            min_v = min(values)
            max_v = max(values)
            span = max_v - min_v
            if span == 0:
                return [0.5] * len(values)
            return [(v - min_v) / span for v in values]

        followers_vals = [e["total_followers"] for e in entries]
        engagement_vals = [e["total_engagement"] for e in entries]
        mention_vals = [e["mention_count"] for e in entries]

        norm_followers = _normalize(followers_vals)
        norm_engagement = _normalize(engagement_vals)
        norm_mentions = _normalize(mention_vals)

        for i, entry in enumerate(entries):
            entry["composite_score"] = round(
                0.4 * norm_followers[i] + 0.3 * norm_engagement[i] + 0.3 * norm_mentions[i],
                4,
            )

        entries.sort(key=lambda e: e["composite_score"], reverse=True)
        entries = entries[:limit]

        for rank, entry in enumerate(entries, start=1):
            entry["rank"] = rank

        logger.info("Ranked %d influencers for project %d", len(entries), project_id)
        return entries

    async def detect_bots(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
    ) -> dict:
        """Detect likely bot accounts using heuristic signals.

        Heuristics:
        - High mention volume (> 10 mentions in the window)
        - Low engagement ratio: ``total_engagement / mention_count < 1``
        - Short author handle (length <= 5) — common for auto-generated names

        Returns:
            Dict with ``total_authors``, ``suspect_count``, ``bot_ratio``,
            and ``suspects`` list.
        """
        stmt = (
            select(
                Mention.author_handle,
                func.max(Mention.author_name).label("author_name"),
                func.count().label("mention_count"),
                func.sum(Mention.likes + Mention.shares + Mention.comments).label("total_engagement"),
                func.max(Mention.author_followers).label("max_followers"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
                Mention.author_handle.isnot(None),
            )
            .group_by(Mention.author_handle)
        )

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return {
                "total_authors": 0,
                "suspect_count": 0,
                "bot_ratio": 0.0,
                "suspects": [],
            }

        total_authors = len(rows)
        suspects: list[dict] = []

        for row in rows:
            mention_count = int(row.mention_count or 0)
            total_engagement = int(row.total_engagement or 0)
            handle = row.author_handle or ""

            signals: list[str] = []

            # High volume
            if mention_count > 10:
                signals.append("high_volume")

            # Low engagement ratio
            engagement_ratio = total_engagement / mention_count if mention_count > 0 else 0
            if mention_count > 5 and engagement_ratio < 1.0:
                signals.append("low_engagement")

            # Short handle
            if len(handle) <= 5:
                signals.append("short_handle")

            # Flag as suspect if 2+ signals fire
            if len(signals) >= 2:
                suspects.append({
                    "author_handle": handle,
                    "author_name": row.author_name,
                    "mention_count": mention_count,
                    "engagement_ratio": round(engagement_ratio, 2),
                    "signals": signals,
                    "confidence": round(len(signals) / 3.0, 2),
                })

        suspects.sort(key=lambda s: s["confidence"], reverse=True)

        bot_ratio = round(len(suspects) / total_authors, 4) if total_authors > 0 else 0.0

        logger.info(
            "Bot detection for project %d: %d suspects out of %d authors (%.1f%%)",
            project_id, len(suspects), total_authors, bot_ratio * 100,
        )

        return {
            "total_authors": total_authors,
            "suspect_count": len(suspects),
            "bot_ratio": bot_ratio,
            "suspects": suspects,
        }
