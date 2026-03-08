from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention, Platform, Sentiment

from ..deps import get_db

router = APIRouter()


@router.get(
    "/{project_id}",
    summary="Get dashboard metrics",
    description="Aggregated dashboard: mentions, sentiment, platforms, engagement, top contributors, and trends.",
)
async def get_dashboard(
    project_id: int,
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    start = now - timedelta(days=days)
    base = [Mention.project_id == project_id, Mention.collected_at >= start, Mention.collected_at <= now]

    # Total
    total = (await db.execute(select(func.count(Mention.id)).where(*base))).scalar() or 0

    # Sentiment breakdown
    sentiment_counts = {}
    for s in Sentiment:
        c = (await db.execute(select(func.count(Mention.id)).where(*base, Mention.sentiment == s))).scalar() or 0
        sentiment_counts[s.value] = c

    # Average sentiment
    avg = (await db.execute(select(func.avg(Mention.sentiment_score)).where(*base))).scalar() or 0.0

    # Platform breakdown
    platform_counts = {}
    for p in Platform:
        c = (await db.execute(select(func.count(Mention.id)).where(*base, Mention.platform == p))).scalar() or 0
        if c > 0:
            platform_counts[p.value] = c

    # Engagement
    eng = (
        await db.execute(
            select(
                func.sum(Mention.likes),
                func.sum(Mention.shares),
                func.sum(Mention.comments),
                func.sum(Mention.reach),
            ).where(*base)
        )
    ).one()

    # Top contributors
    top = await db.execute(
        select(
            Mention.author_name,
            Mention.author_handle,
            Mention.author_followers,
            Mention.platform,
            func.count(Mention.id).label("cnt"),
        )
        .where(*base)
        .group_by(Mention.author_handle, Mention.author_name, Mention.author_followers, Mention.platform)
        .order_by(func.count(Mention.id).desc())
        .limit(20)
    )
    top_contributors = [
        {
            "name": r.author_name,
            "handle": r.author_handle,
            "followers": r.author_followers,
            "platform": r.platform,
            "mentions": r.cnt,
        }
        for r in top
    ]

    # Daily trend
    daily_trend = []
    for i in range(days):
        d_start = start + timedelta(days=i)
        d_end = d_start + timedelta(days=1)
        c = (
            await db.execute(
                select(func.count(Mention.id)).where(
                    Mention.project_id == project_id,
                    Mention.collected_at >= d_start,
                    Mention.collected_at < d_end,
                )
            )
        ).scalar() or 0
        daily_trend.append({"date": d_start.strftime("%Y-%m-%d"), "mentions": c})

    return {
        "total_mentions": total,
        "sentiment": {"breakdown": sentiment_counts, "average_score": round(float(avg), 4)},
        "platforms": platform_counts,
        "engagement": {
            "total_likes": eng[0] or 0,
            "total_shares": eng[1] or 0,
            "total_comments": eng[2] or 0,
            "total_reach": eng[3] or 0,
        },
        "top_contributors": top_contributors,
        "daily_trend": daily_trend,
    }
