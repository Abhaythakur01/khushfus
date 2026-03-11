"""
Sentiment trend analysis: time-series decomposition, spike detection, and momentum scoring.
"""

import logging
import math
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention, Sentiment

logger = logging.getLogger(__name__)

# strftime format strings for SQLite date bucketing
_GRANULARITY_FORMATS = {
    "hourly": "%Y-%m-%d %H",
    "daily": "%Y-%m-%d",
    "weekly": "%Y-%W",
}


class SentimentTrendAnalyzer:
    """Analyse sentiment over time, detect anomalies, and compute momentum."""

    async def compute_sentiment_over_time(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
        granularity: str = "daily",
    ) -> list[dict]:
        """Group mentions into time buckets and return sentiment counts + avg score.

        Args:
            session: Async SQLAlchemy session.
            project_id: Target project.
            start / end: Time window (naive datetimes).
            granularity: One of ``"hourly"``, ``"daily"``, ``"weekly"``.

        Returns:
            List of dicts, each with ``bucket``, ``positive``, ``negative``,
            ``neutral``, ``mixed``, ``total``, and ``avg_sentiment_score``.
        """
        fmt = _GRANULARITY_FORMATS.get(granularity, _GRANULARITY_FORMATS["daily"])
        bucket_expr = func.strftime(fmt, Mention.collected_at)

        stmt = (
            select(
                bucket_expr.label("bucket"),
                Mention.sentiment,
                func.count().label("cnt"),
                func.avg(Mention.sentiment_score).label("avg_score"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(bucket_expr, Mention.sentiment)
            .order_by(bucket_expr)
        )

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        # Pivot rows into per-bucket dicts
        buckets: dict[str, dict] = {}
        for row in rows:
            b = row.bucket
            if b not in buckets:
                buckets[b] = {
                    "bucket": b,
                    "positive": 0,
                    "negative": 0,
                    "neutral": 0,
                    "mixed": 0,
                    "total": 0,
                    "avg_sentiment_score": 0.0,
                    "_score_sum": 0.0,
                }
            entry = buckets[b]
            sentiment_key = row.sentiment.value if isinstance(row.sentiment, Sentiment) else str(row.sentiment)
            entry[sentiment_key] = row.cnt
            entry["total"] += row.cnt
            entry["_score_sum"] += (row.avg_score or 0.0) * row.cnt

        results: list[dict] = []
        for entry in buckets.values():
            if entry["total"] > 0:
                entry["avg_sentiment_score"] = round(entry["_score_sum"] / entry["total"], 4)
            del entry["_score_sum"]
            results.append(entry)

        logger.info("Computed sentiment over time: %d buckets for project %d", len(results), project_id)
        return results

    async def detect_sentiment_spikes(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
        threshold: float = 2.0,
    ) -> list[dict]:
        """Detect days where the average sentiment score deviates from the rolling mean.

        A spike is flagged when ``|daily_score - rolling_mean| > threshold * rolling_std``.

        Returns:
            List of spike event dicts with ``date``, ``score``, ``mean``, ``std_dev``,
            ``deviation``, and ``direction`` (``"positive_spike"`` or ``"negative_spike"``).
        """
        bucket_expr = func.strftime("%Y-%m-%d", Mention.collected_at)

        stmt = (
            select(
                bucket_expr.label("day"),
                func.avg(Mention.sentiment_score).label("avg_score"),
                func.count().label("cnt"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(bucket_expr)
            .order_by(bucket_expr)
        )

        result = await session.execute(stmt)
        rows = result.all()

        if len(rows) < 3:
            return []

        scores = [(row.day, float(row.avg_score or 0.0)) for row in rows]

        # Compute overall mean and std dev
        values = [s for _, s in scores]
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        std_dev = math.sqrt(variance) if variance > 0 else 0.0

        if std_dev == 0:
            return []

        spikes: list[dict] = []
        for day, score in scores:
            deviation = abs(score - mean)
            if deviation > threshold * std_dev:
                spikes.append({
                    "date": day,
                    "score": round(score, 4),
                    "mean": round(mean, 4),
                    "std_dev": round(std_dev, 4),
                    "deviation": round(deviation, 4),
                    "direction": "positive_spike" if score > mean else "negative_spike",
                })

        logger.info("Detected %d sentiment spikes for project %d", len(spikes), project_id)
        return spikes

    async def compute_sentiment_momentum(
        self,
        session: AsyncSession,
        project_id: int,
        days: int = 30,
    ) -> dict:
        """Compare average sentiment of the recent half-period vs the earlier half-period.

        Returns:
            Dict with ``momentum`` (float delta), ``direction`` (``"improving"``,
            ``"declining"``, or ``"stable"``), ``recent_avg``, ``earlier_avg``,
            ``total_mentions``.
        """
        now = datetime.utcnow()
        start = now - timedelta(days=days)
        midpoint = now - timedelta(days=days // 2)

        # Earlier half
        earlier_stmt = (
            select(
                func.avg(Mention.sentiment_score).label("avg_score"),
                func.count().label("cnt"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at < midpoint,
            )
        )

        # Recent half
        recent_stmt = (
            select(
                func.avg(Mention.sentiment_score).label("avg_score"),
                func.count().label("cnt"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= midpoint,
                Mention.collected_at <= now,
            )
        )

        earlier_result = await session.execute(earlier_stmt)
        recent_result = await session.execute(recent_stmt)

        earlier_row = earlier_result.one()
        recent_row = recent_result.one()

        earlier_avg = float(earlier_row.avg_score or 0.0)
        recent_avg = float(recent_row.avg_score or 0.0)
        total = int(earlier_row.cnt or 0) + int(recent_row.cnt or 0)

        momentum = round(recent_avg - earlier_avg, 4)

        if total == 0:
            direction = "stable"
        elif abs(momentum) < 0.05:
            direction = "stable"
        elif momentum > 0:
            direction = "improving"
        else:
            direction = "declining"

        logger.info("Sentiment momentum for project %d: %.4f (%s)", project_id, momentum, direction)
        return {
            "momentum": momentum,
            "direction": direction,
            "recent_avg": round(recent_avg, 4),
            "earlier_avg": round(earlier_avg, 4),
            "total_mentions": total,
            "period_days": days,
        }
