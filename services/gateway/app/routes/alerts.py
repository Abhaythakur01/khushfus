from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import AlertLog, AlertRule, Project
from shared.schemas import AlertLogOut, AlertRuleCreate, AlertRuleOut

from ..deps import get_db

router = APIRouter()


@router.get("/{project_id}/rules", response_model=list[AlertRuleOut])
async def list_alert_rules(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AlertRule).where(AlertRule.project_id == project_id)
    )
    return result.scalars().all()


@router.post("/{project_id}/rules", response_model=AlertRuleOut, status_code=201)
async def create_alert_rule(
    project_id: int, data: AlertRuleCreate, db: AsyncSession = Depends(get_db)
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

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


@router.delete("/{project_id}/rules/{rule_id}")
async def delete_alert_rule(
    project_id: int, rule_id: int, db: AsyncSession = Depends(get_db)
):
    rule = await db.get(AlertRule, rule_id)
    if not rule or rule.project_id != project_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"status": "deleted"}


@router.get("/{project_id}/logs", response_model=list[AlertLogOut])
async def list_alert_logs(
    project_id: int, limit: int = 50, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(AlertLog)
        .where(AlertLog.project_id == project_id)
        .order_by(AlertLog.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.patch("/{project_id}/logs/{log_id}/acknowledge")
async def acknowledge_alert(
    project_id: int, log_id: int, db: AsyncSession = Depends(get_db)
):
    log = await db.get(AlertLog, log_id)
    if not log or log.project_id != project_id:
        raise HTTPException(status_code=404, detail="Alert not found")
    log.acknowledged = True
    await db.commit()
    return {"id": log.id, "acknowledged": True}
