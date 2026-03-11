from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention, Platform, Project, Sentiment
from shared.schemas import MentionListOut, MentionOut

from ..deps import get_db, get_user_org_id, require_auth

MAX_BULK_IDS = 100

router = APIRouter()


@router.get(
    "/",
    response_model=MentionListOut,
    summary="List mentions",
    description="Retrieve a paginated, filterable list of social mentions for a project.",
)
async def list_mentions(
    project_id: int,
    request: Request,
    platform: str | None = None,
    sentiment: str | None = None,
    keyword: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    flagged_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """List mentions with optional filters for platform, sentiment, keyword, date range, and flagged status."""
    # Verify project belongs to user's org
    org_id = get_user_org_id(request)
    if org_id:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Project not found")

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
async def get_mention(
    mention_id: int, request: Request,
    user=Depends(require_auth), db: AsyncSession = Depends(get_db),
):
    """Fetch a single mention by ID, scoped to user's organization."""
    mention = await db.get(Mention, mention_id)
    if not mention:
        raise HTTPException(status_code=404, detail="Mention not found")
    # Verify mention's project belongs to user's org
    org_id = get_user_org_id(request)
    if org_id:
        project = await db.get(Project, mention.project_id)
        if not project or project.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Mention not found")
    return mention


@router.patch(
    "/{mention_id}/flag",
    summary="Toggle mention flag",
    description="Toggle the flagged status of a mention for review or follow-up.",
)
async def toggle_flag(
    mention_id: int, request: Request,
    user=Depends(require_auth), db: AsyncSession = Depends(get_db),
):
    """Toggle the is_flagged boolean on a mention."""
    mention = await db.get(Mention, mention_id)
    if not mention:
        raise HTTPException(status_code=404, detail="Mention not found")
    mention.is_flagged = not mention.is_flagged
    await db.commit()
    return {"id": mention.id, "is_flagged": mention.is_flagged}


class BulkFlagRequest(BaseModel):
    mention_ids: list[int] = Field(..., min_length=1, max_length=MAX_BULK_IDS)
    flagged: bool = True


class BulkAssignRequest(BaseModel):
    mention_ids: list[int] = Field(..., min_length=1, max_length=MAX_BULK_IDS)
    assignee: str = Field(..., min_length=1, max_length=255)


@router.post(
    "/bulk/flag",
    summary="Bulk flag/unflag mentions",
    description=f"Flag or unflag up to {MAX_BULK_IDS} mentions at once.",
)
async def bulk_flag(
    payload: BulkFlagRequest,
    request: Request,
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Set is_flagged on multiple mentions in one request."""
    result = await db.execute(select(Mention).where(Mention.id.in_(payload.mention_ids)))
    mentions = result.scalars().all()
    if not mentions:
        raise HTTPException(status_code=404, detail="No mentions found")

    updated_ids = []
    for m in mentions:
        m.is_flagged = payload.flagged
        updated_ids.append(m.id)
    await db.commit()
    return {"updated": len(updated_ids), "mention_ids": updated_ids, "flagged": payload.flagged}


@router.post(
    "/bulk/assign",
    summary="Bulk assign mentions",
    description=f"Assign up to {MAX_BULK_IDS} mentions to a user at once.",
)
async def bulk_assign(
    payload: BulkAssignRequest,
    request: Request,
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Assign multiple mentions to a user in one request."""
    result = await db.execute(select(Mention).where(Mention.id.in_(payload.mention_ids)))
    mentions = result.scalars().all()
    if not mentions:
        raise HTTPException(status_code=404, detail="No mentions found")

    updated_ids = []
    for m in mentions:
        m.assigned_to = payload.assignee
        updated_ids.append(m.id)
    await db.commit()
    return {"updated": len(updated_ids), "mention_ids": updated_ids, "assignee": payload.assignee}
