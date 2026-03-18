"""
Notifications endpoints.

Returns in-app notifications for the authenticated user.
Currently backed by AlertLog entries as the primary notification source.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import AlertLog, AlertRule, User

from ..deps import get_db, require_auth

router = APIRouter()


@router.get(
    "",
    summary="List notifications",
    description="Return paginated in-app notifications for the authenticated user.",
)
async def get_notifications(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch recent notifications derived from alert log entries.

    Each item is shaped as:
        {id, type, title, message, is_read, created_at, link?}
    """
    offset = (page - 1) * limit

    stmt = (
        select(AlertLog)
        .order_by(AlertLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    logs = result.scalars().all()

    count_stmt = select(func.count()).select_from(AlertLog)
    total = (await db.execute(count_stmt)).scalar_one()

    items = []
    for log in logs:
        items.append({
            "id": log.id,
            "type": "alert",
            "title": log.title or "Alert triggered",
            "message": log.description or "",
            "is_read": log.acknowledged,
            "created_at": log.created_at.isoformat() if log.created_at else "",
            "link": "/alerts",
        })

    return {"items": items, "total": total}


@router.patch(
    "/{notification_id}/read",
    status_code=204,
    summary="Mark notification as read",
)
async def mark_notification_read(
    notification_id: int,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Mark a single notification (alert log entry) as acknowledged/read."""
    log = await db.get(AlertLog, notification_id)
    if log:
        log.acknowledged = True
        await db.commit()


@router.post(
    "/mark-all-read",
    status_code=204,
    summary="Mark all notifications as read",
)
async def mark_all_read(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Mark all alert log entries as acknowledged/read."""
    result = await db.execute(
        select(AlertLog).where(AlertLog.acknowledged == False)  # noqa: E712
    )
    logs = result.scalars().all()
    for log in logs:
        log.acknowledged = True
    if logs:
        await db.commit()
