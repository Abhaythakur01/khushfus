import asyncio
import logging
from datetime import datetime, timedelta

from celery import Celery
from celery.schedules import crontab
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.config.settings import settings
from src.models.project import Project, ProjectStatus

logger = logging.getLogger(__name__)

app = Celery("khushfus", broker=settings.redis_url, backend=settings.redis_url)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "collect-all-projects-hourly": {
            "task": "src.services.worker.collect_all_projects",
            "schedule": crontab(minute=0),  # every hour
        },
        "generate-daily-reports": {
            "task": "src.services.worker.generate_daily_reports",
            "schedule": crontab(hour=6, minute=0),  # 6 AM UTC daily
        },
        "generate-weekly-reports": {
            "task": "src.services.worker.generate_weekly_reports",
            "schedule": crontab(hour=7, minute=0, day_of_week=1),  # Monday 7 AM
        },
        "generate-monthly-reports": {
            "task": "src.services.worker.generate_monthly_reports",
            "schedule": crontab(hour=8, minute=0, day_of_month=1),  # 1st of month
        },
    },
)


def _get_async_session() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(settings.database_url)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _run_async(coro):
    """Run an async function from a sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@app.task(name="src.services.worker.collect_all_projects")
def collect_all_projects():
    """Collect mentions for all active projects."""
    _run_async(_collect_all_projects_async())


async def _collect_all_projects_async():
    from src.services.collection_service import collect_for_project

    session_factory = _get_async_session()
    async with session_factory() as db:
        result = await db.execute(
            select(Project).where(Project.status == ProjectStatus.ACTIVE)
        )
        projects = result.scalars().all()

        since = datetime.utcnow() - timedelta(hours=1)
        for project in projects:
            try:
                await collect_for_project(db, project.id, since=since)
            except Exception as e:
                logger.error(f"Collection failed for project {project.id}: {e}")


@app.task(name="src.services.worker.collect_project")
def collect_project(project_id: int, hours_back: int = 1):
    """Collect mentions for a specific project."""
    _run_async(_collect_project_async(project_id, hours_back))


async def _collect_project_async(project_id: int, hours_back: int):
    from src.services.collection_service import collect_for_project

    session_factory = _get_async_session()
    async with session_factory() as db:
        since = datetime.utcnow() - timedelta(hours=hours_back)
        await collect_for_project(db, project_id, since=since)


@app.task(name="src.services.worker.generate_daily_reports")
def generate_daily_reports():
    """Generate daily reports for all active projects."""
    _run_async(_generate_reports_async("daily"))


@app.task(name="src.services.worker.generate_weekly_reports")
def generate_weekly_reports():
    """Generate weekly reports for all active projects."""
    _run_async(_generate_reports_async("weekly"))


@app.task(name="src.services.worker.generate_monthly_reports")
def generate_monthly_reports():
    """Generate monthly reports for all active projects."""
    _run_async(_generate_reports_async("monthly"))


async def _generate_reports_async(report_type: str):
    from src.services.report_service import generate_report

    session_factory = _get_async_session()
    async with session_factory() as db:
        result = await db.execute(
            select(Project).where(Project.status == ProjectStatus.ACTIVE)
        )
        projects = result.scalars().all()

        for project in projects:
            try:
                await generate_report(db, project.id, report_type)
            except Exception as e:
                logger.error(f"Report generation failed for project {project.id}: {e}")
