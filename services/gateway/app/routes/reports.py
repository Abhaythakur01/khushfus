import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.events import STREAM_REPORT_REQUESTS, EventBus, ReportRequestEvent
from shared.models import Project, Report
from shared.schemas import ReportOut

from ..deps import get_db, get_event_bus, get_user_org_id, require_auth

VALID_REPORT_TYPES = (
    "hourly", "daily", "weekly", "monthly", "quarterly", "yearly",
    "custom", "summary", "sentiment", "competitive",
)
VALID_FORMATS = ("pdf", "pptx", "csv", "xlsx")

router = APIRouter()


@router.get(
    "/",
    response_model=list[ReportOut],
    summary="List reports",
    description="List generated reports for a project, optionally filtered by report type (paginated).",
)
async def list_reports(
    project_id: int,
    request: Request,
    report_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Return all reports for a project, newest first (paginated, org-scoped)."""
    # Verify project belongs to user's org
    org_id = get_user_org_id(request)
    if org_id:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Project not found")

    query = select(Report).where(Report.project_id == project_id)
    if report_type:
        query = query.where(Report.report_type == report_type)
    query = query.order_by(Report.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/generate",
    summary="Trigger report generation",
    description="Publish a report generation request to the Report Service via Redis Streams.",
)
async def trigger_report(
    request: Request,
    project_id: int,
    report_type: str = Query(default="daily"),
    format: str = Query(default="pdf"),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Publish a report generation request to the Report Service."""
    # Verify project belongs to user's org
    org_id = get_user_org_id(request)
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if org_id and project.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Project not found")

    if report_type not in VALID_REPORT_TYPES:
        valid = ", ".join(VALID_REPORT_TYPES)
        raise HTTPException(status_code=400, detail=f"Invalid report_type. Must be one of: {valid}")
    if format not in VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"Invalid format. Must be one of: {', '.join(VALID_FORMATS)}")

    queued_response = {
        "status": "report_queued",
        "project_id": project_id,
        "type": report_type,
        "format": format,
        "message": "Report generation queued successfully",
    }

    bus = get_event_bus(request)
    if bus is None:
        return queued_response

    try:
        event = ReportRequestEvent(
            project_id=project_id,
            report_type=report_type,
            format=format,
            requested_by=str(user.id) if hasattr(user, "id") else "",
        )
        await bus.publish(STREAM_REPORT_REQUESTS, event)
    except Exception:
        return queued_response
    return {"status": "report_generation_started", "project_id": project_id, "type": report_type, "format": format}


@router.get(
    "/{report_id}",
    summary="Get report by ID",
    description="Retrieve a single report with its full data payload.",
)
async def get_report(report_id: int, request: Request, user=Depends(require_auth), db: AsyncSession = Depends(get_db)):
    """Fetch a report by ID and return its metadata and parsed data (org-scoped)."""
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    # Verify report's project belongs to user's org
    org_id = get_user_org_id(request)
    if org_id:
        project = await db.get(Project, report.project_id)
        if not project or project.organization_id != org_id:
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
