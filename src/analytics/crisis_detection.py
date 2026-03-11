"""
Crisis detection: real-time negative sentiment velocity monitoring and brand health scoring.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention, Sentiment

logger = logging.getLogger(__name__)


class CrisisDetector:
    """Detect brand crises and compute overall brand health scores."""

    async def detect_crisis(
        self,
        session: AsyncSession,
        project_id: int,
        lookback_hours: int = 6,
        baseline_days: int = 30,
    ) -> dict:
        """Compare recent negative mention velocity against a historical baseline.

        A crisis is detected when the recent negative rate exceeds the baseline
        rate by more than 2x (medium), 3x (high), or 5x (critical).

        Returns:
            Dict with ``is_crisis``, ``severity`` (``"none"``, ``"medium"``,
            ``"high"``, ``"critical"``), ``recent_negative_count``,
            ``recent_total``, ``baseline_daily_negative_avg``,
            ``velocity_ratio``, ``lookback_hours``, ``baseline_days``.
        """
        now = datetime.utcnow()
        recent_start = now - timedelta(hours=lookback_hours)
        baseline_start = now - timedelta(days=baseline_days)

        # Recent negative count and total
        recent_neg_stmt = (
            select(func.count())
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= recent_start,
                Mention.sentiment == Sentiment.NEGATIVE,
            )
        )
        recent_total_stmt = (
            select(func.count())
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= recent_start,
            )
        )

        # Baseline: daily average negative mentions over baseline_days
        baseline_neg_stmt = (
            select(func.count())
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= baseline_start,
                Mention.collected_at < recent_start,
                Mention.sentiment == Sentiment.NEGATIVE,
            )
        )
        baseline_total_stmt = (
            select(func.count())
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= baseline_start,
                Mention.collected_at < recent_start,
            )
        )

        recent_neg = (await session.execute(recent_neg_stmt)).scalar() or 0
        recent_total = (await session.execute(recent_total_stmt)).scalar() or 0
        baseline_neg = (await session.execute(baseline_neg_stmt)).scalar() or 0
        _baseline_total = (await session.execute(baseline_total_stmt)).scalar() or 0

        # Normalize to per-hour rates for comparison
        baseline_hours = max(baseline_days * 24, 1)
        baseline_neg_rate = baseline_neg / baseline_hours  # negatives per hour
        recent_neg_rate = recent_neg / max(lookback_hours, 1)

        if baseline_neg_rate > 0:
            velocity_ratio = recent_neg_rate / baseline_neg_rate
        else:
            velocity_ratio = float(recent_neg_rate) if recent_neg_rate > 0 else 0.0

        # Determine severity
        if velocity_ratio >= 5.0:
            severity = "critical"
            is_crisis = True
        elif velocity_ratio >= 3.0:
            severity = "high"
            is_crisis = True
        elif velocity_ratio >= 2.0:
            severity = "medium"
            is_crisis = True
        else:
            severity = "none"
            is_crisis = False

        result = {
            "is_crisis": is_crisis,
            "severity": severity,
            "recent_negative_count": recent_neg,
            "recent_total": recent_total,
            "baseline_daily_negative_avg": round(baseline_neg / max(baseline_days, 1), 2),
            "baseline_neg_rate_per_hour": round(baseline_neg_rate, 4),
            "recent_neg_rate_per_hour": round(recent_neg_rate, 4),
            "velocity_ratio": round(velocity_ratio, 2),
            "lookback_hours": lookback_hours,
            "baseline_days": baseline_days,
        }

        if is_crisis:
            logger.warning(
                "CRISIS DETECTED for project %d: severity=%s, ratio=%.2f",
                project_id, severity, velocity_ratio,
            )
        else:
            logger.info("No crisis for project %d: velocity_ratio=%.2f", project_id, velocity_ratio)

        return result

    async def compute_brand_health_score(
        self,
        session: AsyncSession,
        project_id: int,
        days: int = 30,
    ) -> dict:
        """Compute a composite brand health score (0-100).

        Components:
        - **Sentiment** (40%): ratio of positive mentions
        - **Engagement trend** (20%): recent vs earlier engagement growth
        - **Volume trend** (20%): recent vs earlier mention volume growth
        - **Crisis absence** (20%): 100 if no crisis detected, 0 if critical

        Returns:
            Dict with ``score`` (0-100), ``grade`` (A-F), ``components``,
            and ``trend`` label.
        """
        now = datetime.utcnow()
        start = now - timedelta(days=days)
        midpoint = now - timedelta(days=days // 2)

        # --- Sentiment component (40%) ---
        sentiment_stmt = (
            select(
                Mention.sentiment,
                func.count().label("cnt"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
            )
            .group_by(Mention.sentiment)
        )
        sentiment_result = await session.execute(sentiment_stmt)
        sentiment_rows = {row.sentiment: row.cnt for row in sentiment_result.all()}
        total_mentions = sum(sentiment_rows.values())

        if total_mentions == 0:
            return {
                "score": 0,
                "grade": "N/A",
                "components": {
                    "sentiment": 0,
                    "engagement_trend": 0,
                    "volume_trend": 0,
                    "crisis_absence": 100,
                },
                "trend": "insufficient_data",
                "total_mentions": 0,
            }

        positive_count = sentiment_rows.get(Sentiment.POSITIVE, 0)
        negative_count = sentiment_rows.get(Sentiment.NEGATIVE, 0)

        # Sentiment score: positive ratio adjusted by negative penalty
        positive_ratio = positive_count / total_mentions
        negative_ratio = negative_count / total_mentions
        sentiment_score = max(0, min(100, (positive_ratio - negative_ratio + 1) * 50))

        # --- Engagement trend (20%) ---
        earlier_eng_stmt = (
            select(func.avg(Mention.likes + Mention.shares + Mention.comments).label("avg_eng"))
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at < midpoint,
            )
        )
        recent_eng_stmt = (
            select(func.avg(Mention.likes + Mention.shares + Mention.comments).label("avg_eng"))
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= midpoint,
            )
        )

        earlier_eng = float((await session.execute(earlier_eng_stmt)).scalar() or 0)
        recent_eng = float((await session.execute(recent_eng_stmt)).scalar() or 0)

        if earlier_eng > 0:
            eng_growth = (recent_eng - earlier_eng) / earlier_eng
        else:
            eng_growth = 0.0

        # Map growth to 0-100: -50% → 0, 0% → 50, +50% → 100
        engagement_trend_score = max(0, min(100, (eng_growth + 0.5) * 100))

        # --- Volume trend (20%) ---
        earlier_vol_stmt = (
            select(func.count())
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at < midpoint,
            )
        )
        recent_vol_stmt = (
            select(func.count())
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= midpoint,
            )
        )

        earlier_vol = (await session.execute(earlier_vol_stmt)).scalar() or 0
        recent_vol = (await session.execute(recent_vol_stmt)).scalar() or 0

        if earlier_vol > 0:
            vol_growth = (recent_vol - earlier_vol) / earlier_vol
        else:
            vol_growth = 0.0

        volume_trend_score = max(0, min(100, (vol_growth + 0.5) * 100))

        # --- Crisis absence (20%) ---
        crisis = await self.detect_crisis(session, project_id)
        crisis_map = {"none": 100, "medium": 60, "high": 30, "critical": 0}
        crisis_absence_score = crisis_map.get(crisis["severity"], 100)

        # --- Composite ---
        score = round(
            sentiment_score * 0.4
            + engagement_trend_score * 0.2
            + volume_trend_score * 0.2
            + crisis_absence_score * 0.2,
            1,
        )

        # Grade
        if score >= 90:
            grade = "A"
        elif score >= 80:
            grade = "B"
        elif score >= 65:
            grade = "C"
        elif score >= 50:
            grade = "D"
        else:
            grade = "F"

        # Overall trend
        momentum = (recent_eng + recent_vol) - (earlier_eng + earlier_vol)
        if abs(momentum) < 1:
            trend = "stable"
        elif momentum > 0:
            trend = "improving"
        else:
            trend = "declining"

        result = {
            "score": score,
            "grade": grade,
            "components": {
                "sentiment": round(sentiment_score, 1),
                "engagement_trend": round(engagement_trend_score, 1),
                "volume_trend": round(volume_trend_score, 1),
                "crisis_absence": crisis_absence_score,
            },
            "trend": trend,
            "total_mentions": total_mentions,
        }

        logger.info("Brand health for project %d: score=%.1f grade=%s trend=%s", project_id, score, grade, trend)
        return result
