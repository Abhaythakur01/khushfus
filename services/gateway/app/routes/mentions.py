from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention, Platform, Sentiment
from shared.schemas import MentionListOut, MentionOut

from ..deps import get_db

router = APIRouter()


@router.get(
    "/",
    response_model=MentionListOut,
    summary="List mentions",
    description="Retrieve a paginated, filterable list of social mentions for a project.",
)
async def list_mentions(
    project_id: int,
    platform: str | None = None,
    sentiment: str | None = None,
    keyword: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    flagged_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List mentions with optional filters for platform, sentiment, keyword, date range, and flagged status."""
    query = select(Mention).where(Mention.project_id == project_id)
    count_query = select(func.count(Mention.id)).where(Mention.project_id == project_id)

    if platform:
        query = query.where(Mention.platform == Platform(platform))
        count_query = count_query.where(Mention.platform == Platform(platform))
    if sentiment:
        query = query.where(Mention.sentiment == Sentiment(sentiment))
        count_query = count_query.where(Mention.sentiment == Sentiment(sentiment))
    if keyword:
        query = query.where(Mention.matched_keywords.contains(keyword))
        count_query = count_query.where(Mention.matched_keywords.contains(keyword))
    if since:
        query = query.where(Mention.published_at >= since)
        count_query = count_query.where(Mention.published_at >= since)
    if until:
        query = query.where(Mention.published_at <= until)
        count_query = count_query.where(Mention.published_at <= until)
    if flagged_only:
        query = query.where(Mention.is_flagged.is_(True))
        count_query = count_query.where(Mention.is_flagged.is_(True))

    total = (await db.execute(count_query)).scalar() or 0
    offset = (page - 1) * page_size
    query = query.order_by(Mention.published_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)

    return MentionListOut(items=result.scalars().all(), total=total, page=page, page_size=page_size)


@router.get(
    "/{mention_id}",
    response_model=MentionOut,
    summary="Get mention by ID",
    description="Retrieve a single mention by its unique identifier.",
)
async def get_mention(mention_id: int, db: AsyncSession = Depends(get_db)):
    """Fetch a single mention by ID."""
    mention = await db.get(Mention, mention_id)
    if not mention:
        raise HTTPException(status_code=404, detail="Mention not found")
    return mention


@router.patch(
    "/{mention_id}/flag",
    summary="Toggle mention flag",
    description="Toggle the flagged status of a mention for review or follow-up.",
)
async def toggle_flag(mention_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle the is_flagged boolean on a mention."""
    mention = await db.get(Mention, mention_id)
    if not mention:
        raise HTTPException(status_code=404, detail="Mention not found")
    mention.is_flagged = not mention.is_flagged
    await db.commit()
    return {"id": mention.id, "is_flagged": mention.is_flagged}
