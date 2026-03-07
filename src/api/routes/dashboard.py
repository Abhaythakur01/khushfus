from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.database import get_db
from src.services.report_service import get_dashboard_data

router = APIRouter()


@router.get("/{project_id}")
async def get_dashboard(
    project_id: int,
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Get real-time dashboard data for a project."""
    return await get_dashboard_data(db, project_id, days)
