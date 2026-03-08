import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.mention import Mention, Platform, Sentiment
from src.models.report import Report, ReportType

logger = logging.getLogger(__name__)


async def generate_report(db: AsyncSession, project_id: int, report_type: str) -> Report:
    """Generate a report for the given project and period."""
    now = datetime.utcnow()

    if report_type == "daily":
        period_start = now - timedelta(days=1)
    elif report_type == "weekly":
        period_start = now - timedelta(weeks=1)
    elif report_type == "monthly":
        period_start = now - timedelta(days=30)
    else:
        period_start = now - timedelta(days=1)

    report_data = await _build_report_data(db, project_id, period_start, now)

    report = Report(
        project_id=project_id,
        report_type=ReportType(report_type),
        title=f"{report_type.capitalize()} Report - {now.strftime('%Y-%m-%d')}",
        period_start=period_start,
        period_end=now,
        data_json=json.dumps(report_data, default=str),
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    logger.info(f"Generated {report_type} report #{report.id} for project {project_id}")
    return report


async def _build_report_data(db: AsyncSession, project_id: int, start: datetime, end: datetime) -> dict:
    """Build comprehensive report data from mentions in the period."""
    base_filter = [
        Mention.project_id == project_id,
        Mention.collected_at >= start,
        Mention.collected_at <= end,
    ]

    # Total mentions
    total_result = await db.execute(select(func.count(Mention.id)).where(*base_filter))
    total_mentions = total_result.scalar() or 0

    # Sentiment breakdown
    sentiment_counts = {}
    for s in Sentiment:
        result = await db.execute(select(func.count(Mention.id)).where(*base_filter, Mention.sentiment == s))
        sentiment_counts[s.value] = result.scalar() or 0

    # Platform breakdown
    platform_counts = {}
    for p in Platform:
        result = await db.execute(select(func.count(Mention.id)).where(*base_filter, Mention.platform == p))
        count = result.scalar() or 0
        if count > 0:
            platform_counts[p.value] = count

    # Average sentiment score
    avg_result = await db.execute(select(func.avg(Mention.sentiment_score)).where(*base_filter))
    avg_sentiment = avg_result.scalar() or 0.0

    # Top contributors (by follower count)
    top_contributors_result = await db.execute(
        select(
            Mention.author_name,
            Mention.author_handle,
            Mention.author_followers,
            Mention.platform,
            func.count(Mention.id).label("mention_count"),
        )
        .where(*base_filter)
        .group_by(
            Mention.author_handle,
            Mention.author_name,
            Mention.author_followers,
            Mention.platform,
        )
        .order_by(func.count(Mention.id).desc())
        .limit(20)
    )
    top_contributors = [
        {
            "name": row.author_name,
            "handle": row.author_handle,
            "followers": row.author_followers,
            "platform": row.platform,
            "mentions": row.mention_count,
        }
        for row in top_contributors_result
    ]

    # Engagement totals
    engagement_result = await db.execute(
        select(
            func.sum(Mention.likes).label("total_likes"),
            func.sum(Mention.shares).label("total_shares"),
            func.sum(Mention.comments).label("total_comments"),
            func.sum(Mention.reach).label("total_reach"),
        ).where(*base_filter)
    )
    engagement = engagement_result.one()

    # Keyword frequency
    keyword_mentions = await db.execute(
        select(Mention.matched_keywords).where(*base_filter, Mention.matched_keywords.isnot(None))
    )
    keyword_freq: dict[str, int] = {}
    for row in keyword_mentions.scalars():
        for kw in row.split(","):
            kw = kw.strip()
            if kw:
                keyword_freq[kw] = keyword_freq.get(kw, 0) + 1

    # Flagged mentions (discrepancies)
    flagged_result = await db.execute(select(func.count(Mention.id)).where(*base_filter, Mention.is_flagged.is_(True)))
    flagged_count = flagged_result.scalar() or 0

    # Probable influencers (high follower count + engagement)
    influencers_result = await db.execute(
        select(
            Mention.author_name,
            Mention.author_handle,
            Mention.author_followers,
            Mention.author_profile_url,
            Mention.platform,
        )
        .where(*base_filter, Mention.author_followers > 1000)
        .distinct(Mention.author_handle)
        .order_by(Mention.author_handle, Mention.author_followers.desc())
        .limit(10)
    )
    influencers = [
        {
            "name": row.author_name,
            "handle": row.author_handle,
            "followers": row.author_followers,
            "profile_url": row.author_profile_url,
            "platform": row.platform,
        }
        for row in influencers_result
    ]

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "total_mentions": total_mentions,
        "sentiment": {
            "breakdown": sentiment_counts,
            "average_score": round(float(avg_sentiment), 4),
        },
        "platforms": platform_counts,
        "top_contributors": top_contributors,
        "engagement": {
            "total_likes": engagement.total_likes or 0,
            "total_shares": engagement.total_shares or 0,
            "total_comments": engagement.total_comments or 0,
            "total_reach": engagement.total_reach or 0,
        },
        "keyword_frequency": keyword_freq,
        "flagged_mentions": flagged_count,
        "influencers": influencers,
    }


async def get_dashboard_data(db: AsyncSession, project_id: int, days: int = 7) -> dict:
    """Get real-time dashboard data for a project."""
    now = datetime.utcnow()
    start = now - timedelta(days=days)
    data = await _build_report_data(db, project_id, start, now)

    # Add daily trend data
    daily_trend = []
    for i in range(days):
        day_start = start + timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        day_count = await db.execute(
            select(func.count(Mention.id)).where(
                Mention.project_id == project_id,
                Mention.collected_at >= day_start,
                Mention.collected_at < day_end,
            )
        )
        daily_trend.append(
            {
                "date": day_start.strftime("%Y-%m-%d"),
                "mentions": day_count.scalar() or 0,
            }
        )

    data["daily_trend"] = daily_trend
    return data
