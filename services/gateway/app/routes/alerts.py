import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import AlertLog, AlertRule, Project
from shared.schemas import AlertLogOut, AlertRuleCreate, AlertRuleOut
from shared.url_validator import validate_url

from ..deps import get_db, get_user_org_id, require_auth

logger = logging.getLogger(__name__)

router = APIRouter()


async def _verify_project_access(db: AsyncSession, project_id: int, request: Request):
    """Verify that the project exists and belongs to the user's organization."""
    org_id = get_user_org_id(request)
    if org_id:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Project not found")


@router.get(
    "/{project_id}/rules",
    response_model=list[AlertRuleOut],
    summary="List alert rules",
    description="List all alert rules configured for a project.",
)
async def list_alert_rules(
    project_id: int,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Return all alert rules for the given project (paginated, org-scoped)."""
    await _verify_project_access(db, project_id, request)
    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.project_id == project_id)
        .order_by(AlertRule.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return result.scalars().all()


@router.post(
    "/{project_id}/rules",
    response_model=AlertRuleOut,
    status_code=201,
    summary="Create an alert rule",
    description="Create an alert rule with configurable thresholds, time windows, and channels.",
)
async def create_alert_rule(
    project_id: int, data: AlertRuleCreate, request: Request,
    user=Depends(require_auth), db: AsyncSession = Depends(get_db),
):
    await _verify_project_access(db, project_id, request)
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate webhook URL against SSRF if provided
    if data.webhook_url:
        try:
            validate_url(data.webhook_url)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid webhook URL: {e}")

    rule = AlertRule(
        project_id=project_id,
        name=data.name,
        rule_type=data.rule_type,
        threshold=data.threshold,
        window_minutes=data.window_minutes,
        channels=data.channels,
        webhook_url=data.webhook_url,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete(
    "/{project_id}/rules/{rule_id}",
    summary="Delete an alert rule",
    description="Remove an alert rule from a project by rule ID.",
)
async def delete_alert_rule(
    project_id: int, rule_id: int, request: Request,
    user=Depends(require_auth), db: AsyncSession = Depends(get_db),
):
    await _verify_project_access(db, project_id, request)
    rule = await db.get(AlertRule, rule_id)
    if not rule or rule.project_id != project_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"status": "deleted"}


@router.get(
    "/{project_id}/logs",
    response_model=list[AlertLogOut],
    summary="List alert logs",
    description="Retrieve the most recent alert log entries for a project (paginated).",
)
async def list_alert_logs(
    project_id: int,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    await _verify_project_access(db, project_id, request)
    result = await db.execute(
        select(AlertLog)
        .where(AlertLog.project_id == project_id)
        .order_by(AlertLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return result.scalars().all()


@router.patch(
    "/{project_id}/logs/{log_id}/acknowledge",
    summary="Acknowledge an alert",
    description="Mark an alert log entry as acknowledged to indicate it has been reviewed.",
)
async def acknowledge_alert(
    project_id: int, log_id: int, request: Request,
    user=Depends(require_auth), db: AsyncSession = Depends(get_db),
):
    await _verify_project_access(db, project_id, request)
    log = await db.get(AlertLog, log_id)
    if not log or log.project_id != project_id:
        raise HTTPException(status_code=404, detail="Alert not found")
    log.acknowledged = True
    await db.commit()
    return {"id": log.id, "acknowledged": True}
