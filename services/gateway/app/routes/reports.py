import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.events import EventBus, ReportRequestEvent, STREAM_REPORT_REQUESTS
from shared.models import Report
from shared.schemas import ReportOut

from ..deps import get_db, get_event_bus

router = APIRouter()


@router.get("/", response_model=list[ReportOut])
async def list_reports(
    project_id: int,
    report_type: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Report).where(Report.project_id == project_id)
    if report_type:
        query = query.where(Report.report_type == report_type)
    query = query.order_by(Report.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/generate", response_model=dict)
async def trigger_report(
    project_id: int,
    report_type: str = Query(default="daily"),
    bus: EventBus = Depends(get_event_bus),
):
    """Publish a report generation request to the Report Service."""
    event = ReportRequestEvent(project_id=project_id, report_type=report_type)
    await bus.publish(STREAM_REPORT_REQUESTS, event)
    return {"status": "report_generation_started", "project_id": project_id, "type": report_type}


@router.get("/{report_id}")
async def get_report(report_id: int, db: AsyncSession = Depends(get_db)):
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    data = json.loads(report.data_json) if report.data_json else {}
    return {
        "id": report.id,
        "report_type": report.report_type,
        "title": report.title,
        "period_start": report.period_start,
        "period_end": report.period_end,
        "created_at": report.created_at,
        "data": data,
    }
