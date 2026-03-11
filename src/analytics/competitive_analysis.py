"""
Competitive analysis: share of voice, sentiment comparison, and engagement benchmarking
across multiple projects (brands).
"""

import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention, Platform, Sentiment

logger = logging.getLogger(__name__)


class CompetitiveAnalyzer:
    """Compare metrics across multiple projects (competitors)."""

    async def compute_share_of_voice(
        self,
        session: AsyncSession,
        project_ids: list[int],
        start: datetime,
        end: datetime,
    ) -> dict:
        """Compute each project's share of total mention volume.

        Returns:
            Dict with ``total_mentions``, ``projects`` list (each with
            ``project_id``, ``mention_count``, ``share_percent``), and
            ``leader_project_id``.
        """
        if not project_ids:
            return {"total_mentions": 0, "projects": [], "leader_project_id": None}

        stmt = (
            select(
                Mention.project_id,
                func.count().label("cnt"),
            )
            .where(
                Mention.project_id.in_(project_ids),
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(Mention.project_id)
        )

        result = await session.execute(stmt)
        rows = result.all()

        total = sum(row.cnt for row in rows)
        projects: list[dict] = []
        for row in rows:
            projects.append({
                "project_id": row.project_id,
                "mention_count": int(row.cnt),
                "share_percent": round(row.cnt / total * 100, 2) if total > 0 else 0.0,
            })

        # Include projects with zero mentions
        seen_ids = {p["project_id"] for p in projects}
        for pid in project_ids:
            if pid not in seen_ids:
                projects.append({
                    "project_id": pid,
                    "mention_count": 0,
                    "share_percent": 0.0,
                })

        projects.sort(key=lambda p: p["mention_count"], reverse=True)
        leader = projects[0]["project_id"] if projects and projects[0]["mention_count"] > 0 else None

        logger.info("Share of voice computed for %d projects, total=%d", len(project_ids), total)
        return {
            "total_mentions": total,
            "projects": projects,
            "leader_project_id": leader,
        }

    async def compare_sentiment(
        self,
        session: AsyncSession,
        project_ids: list[int],
        start: datetime,
        end: datetime,
    ) -> list[dict]:
        """Compare sentiment breakdown across projects.

        Returns:
            List of dicts per project with ``project_id``, ``total``,
            ``positive``, ``negative``, ``neutral``, ``mixed``,
            ``positive_ratio``, ``negative_ratio``, ``avg_sentiment_score``.
        """
        if not project_ids:
            return []

        stmt = (
            select(
                Mention.project_id,
                Mention.sentiment,
                func.count().label("cnt"),
                func.avg(Mention.sentiment_score).label("avg_score"),
            )
            .where(
                Mention.project_id.in_(project_ids),
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(Mention.project_id, Mention.sentiment)
        )

        result = await session.execute(stmt)
        rows = result.all()

        # Aggregate per project
        project_data: dict[int, dict] = {}
        for row in rows:
            pid = row.project_id
            if pid not in project_data:
                project_data[pid] = {
                    "project_id": pid,
                    "total": 0,
                    "positive": 0,
                    "negative": 0,
                    "neutral": 0,
                    "mixed": 0,
                    "_score_sum": 0.0,
                }
            entry = project_data[pid]
            sentiment_key = row.sentiment.value if isinstance(row.sentiment, Sentiment) else str(row.sentiment)
            entry[sentiment_key] = int(row.cnt)
            entry["total"] += int(row.cnt)
            entry["_score_sum"] += float(row.avg_score or 0) * int(row.cnt)

        results: list[dict] = []
        for pid in project_ids:
            entry = project_data.get(pid, {
                "project_id": pid,
                "total": 0,
                "positive": 0,
                "negative": 0,
                "neutral": 0,
                "mixed": 0,
                "_score_sum": 0.0,
            })
            total = entry["total"]
            entry["positive_ratio"] = round(entry["positive"] / total, 4) if total > 0 else 0.0
            entry["negative_ratio"] = round(entry["negative"] / total, 4) if total > 0 else 0.0
            entry["avg_sentiment_score"] = round(entry["_score_sum"] / total, 4) if total > 0 else 0.0
            del entry["_score_sum"]
            results.append(entry)

        logger.info("Sentiment comparison for %d projects", len(project_ids))
        return results

    async def compare_engagement(
        self,
        session: AsyncSession,
        project_ids: list[int],
        start: datetime,
        end: datetime,
    ) -> list[dict]:
        """Compare engagement metrics across projects.

        Returns:
            List of dicts per project with ``project_id``, ``mention_count``,
            ``total_likes``, ``total_shares``, ``total_comments``,
            ``total_reach``, ``avg_engagement_per_mention``, ``top_platform``.
        """
        if not project_ids:
            return []

        # Aggregate engagement per project
        stmt = (
            select(
                Mention.project_id,
                func.count().label("mention_count"),
                func.sum(Mention.likes).label("total_likes"),
                func.sum(Mention.shares).label("total_shares"),
                func.sum(Mention.comments).label("total_comments"),
                func.sum(Mention.reach).label("total_reach"),
            )
            .where(
                Mention.project_id.in_(project_ids),
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(Mention.project_id)
        )

        result = await session.execute(stmt)
        rows = result.all()

        engagement_map: dict[int, dict] = {}
        for row in rows:
            mention_count = int(row.mention_count or 0)
            total_likes = int(row.total_likes or 0)
            total_shares = int(row.total_shares or 0)
            total_comments = int(row.total_comments or 0)
            total_eng = total_likes + total_shares + total_comments

            engagement_map[row.project_id] = {
                "project_id": row.project_id,
                "mention_count": mention_count,
                "total_likes": total_likes,
                "total_shares": total_shares,
                "total_comments": total_comments,
                "total_reach": int(row.total_reach or 0),
                "avg_engagement_per_mention": round(total_eng / mention_count, 2) if mention_count > 0 else 0.0,
            }

        # Find top platform per project
        platform_stmt = (
            select(
                Mention.project_id,
                Mention.platform,
                func.sum(Mention.likes + Mention.shares + Mention.comments).label("platform_eng"),
            )
            .where(
                Mention.project_id.in_(project_ids),
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(Mention.project_id, Mention.platform)
        )
        platform_result = await session.execute(platform_stmt)
        platform_rows = platform_result.all()

        top_platforms: dict[int, str] = {}
        top_platform_eng: dict[int, int] = {}
        for row in platform_rows:
            eng = int(row.platform_eng or 0)
            pid = row.project_id
            if pid not in top_platform_eng or eng > top_platform_eng[pid]:
                platform_val = row.platform.value if isinstance(row.platform, Platform) else str(row.platform)
                top_platforms[pid] = platform_val
                top_platform_eng[pid] = eng

        results: list[dict] = []
        for pid in project_ids:
            entry = engagement_map.get(pid, {
                "project_id": pid,
                "mention_count": 0,
                "total_likes": 0,
                "total_shares": 0,
                "total_comments": 0,
                "total_reach": 0,
                "avg_engagement_per_mention": 0.0,
            })
            entry["top_platform"] = top_platforms.get(pid, "none")
            results.append(entry)

        logger.info("Engagement comparison for %d projects", len(project_ids))
        return results
