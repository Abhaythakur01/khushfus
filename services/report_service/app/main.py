"""
Report Service — generates daily/weekly/monthly reports.

1. Listens to 'reports:request' stream for on-demand generation
2. Runs a scheduler for automatic report generation
3. Aggregates mention data from PostgreSQL
4. Generates PDF reports via WeasyPrint + Jinja2
5. Publishes 'reports:ready' event when done
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from sqlalchemy import func, select

from shared.database import create_db
from shared.events import EventBus, STREAM_REPORT_REQUESTS, STREAM_REPORT_READY
from shared.models import Mention, Platform, Project, ProjectStatus, Report, ReportType, Sentiment

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus"
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

GROUP_NAME = "report-service"
CONSUMER_NAME = f"report-{os.getpid()}"
TEMPLATE_DIR = Path(__file__).parent / "templates"
OUTPUT_DIR = Path("/app/reports_output")


async def build_report_data(db, project_id: int, start: datetime, end: datetime) -> dict:
    """Aggregate mention data for a report period."""
    base = [Mention.project_id == project_id, Mention.collected_at >= start, Mention.collected_at <= end]

    total = (await db.execute(select(func.count(Mention.id)).where(*base))).scalar() or 0

    sentiment_counts = {}
    for s in Sentiment:
        c = (await db.execute(select(func.count(Mention.id)).where(*base, Mention.sentiment == s))).scalar() or 0
        sentiment_counts[s.value] = c

    avg = (await db.execute(select(func.avg(Mention.sentiment_score)).where(*base))).scalar() or 0.0

    platform_counts = {}
    for p in Platform:
        c = (await db.execute(select(func.count(Mention.id)).where(*base, Mention.platform == p))).scalar() or 0
        if c > 0:
            platform_counts[p.value] = c

    eng = (await db.execute(
        select(func.sum(Mention.likes), func.sum(Mention.shares),
               func.sum(Mention.comments), func.sum(Mention.reach)).where(*base)
    )).one()

    top = await db.execute(
        select(Mention.author_name, Mention.author_handle, Mention.author_followers,
               Mention.platform, func.count(Mention.id).label("cnt"))
        .where(*base)
        .group_by(Mention.author_handle, Mention.author_name, Mention.author_followers, Mention.platform)
        .order_by(func.count(Mention.id).desc()).limit(20)
    )
    top_contributors = [
        {"name": r.author_name, "handle": r.author_handle, "followers": r.author_followers,
         "platform": r.platform, "mentions": r.cnt} for r in top
    ]

    # Keyword frequency
    kw_result = await db.execute(
        select(Mention.matched_keywords).where(*base, Mention.matched_keywords.isnot(None))
    )
    keyword_freq: dict[str, int] = {}
    for row in kw_result.scalars():
        for kw in row.split(","):
            kw = kw.strip()
            if kw:
                keyword_freq[kw] = keyword_freq.get(kw, 0) + 1

    flagged = (await db.execute(
        select(func.count(Mention.id)).where(*base, Mention.is_flagged.is_(True))
    )).scalar() or 0

    influencers = await db.execute(
        select(Mention.author_name, Mention.author_handle, Mention.author_followers,
               Mention.author_profile_url, Mention.platform)
        .where(*base, Mention.author_followers > 1000)
        .distinct(Mention.author_handle)
        .order_by(Mention.author_handle, Mention.author_followers.desc()).limit(10)
    )

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "total_mentions": total,
        "sentiment": {"breakdown": sentiment_counts, "average_score": round(float(avg), 4)},
        "platforms": platform_counts,
        "top_contributors": top_contributors,
        "engagement": {
            "total_likes": eng[0] or 0, "total_shares": eng[1] or 0,
            "total_comments": eng[2] or 0, "total_reach": eng[3] or 0,
        },
        "keyword_frequency": keyword_freq,
        "flagged_mentions": flagged,
        "influencers": [
            {"name": r.author_name, "handle": r.author_handle, "followers": r.author_followers,
             "profile_url": r.author_profile_url, "platform": r.platform}
            for r in influencers
        ],
    }


async def generate_report(session_factory, project_id: int, report_type: str) -> int:
    """Generate a report, store it, optionally create PDF. Returns report ID."""
    now = datetime.utcnow()
    period_map = {"daily": timedelta(days=1), "weekly": timedelta(weeks=1), "monthly": timedelta(days=30)}
    period_start = now - period_map.get(report_type, timedelta(days=1))

    async with session_factory() as db:
        project = await db.get(Project, project_id)
        if not project:
            logger.error(f"Project {project_id} not found")
            return 0

        data = await build_report_data(db, project_id, period_start, now)

        report = Report(
            project_id=project_id,
            report_type=ReportType(report_type),
            title=f"{report_type.capitalize()} Report - {now.strftime('%Y-%m-%d')}",
            period_start=period_start,
            period_end=now,
            data_json=json.dumps(data, default=str),
        )

        # Generate PDF
        pdf_path = generate_pdf(data, report_type, project.name)
        if pdf_path:
            report.file_path = pdf_path

        db.add(report)
        await db.commit()
        await db.refresh(report)

        logger.info(f"Generated {report_type} report #{report.id} for project {project_id}")
        return report.id


def generate_pdf(report_data: dict, report_type: str, project_name: str) -> str | None:
    """Render HTML template and convert to PDF."""
    OUTPUT_DIR.mkdir(exist_ok=True)

    try:
        env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
        template = env.get_template("report.html")
        html = template.render(
            report=report_data, report_type=report_type,
            project_name=project_name,
            generated_at=datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        )

        filename = f"{project_name}_{report_type}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
        filepath = OUTPUT_DIR / filename

        try:
            from weasyprint import HTML
            HTML(string=html).write_pdf(str(filepath))
            return str(filepath)
        except ImportError:
            html_path = filepath.with_suffix(".html")
            html_path.write_text(html, encoding="utf-8")
            return str(html_path)
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        return None


async def listen_for_requests(bus: EventBus, session_factory):
    """Listen for on-demand report generation requests."""
    await bus.ensure_group(STREAM_REPORT_REQUESTS, GROUP_NAME)
    logger.info("Listening for report requests...")

    while True:
        try:
            messages = await bus.consume(
                STREAM_REPORT_REQUESTS, GROUP_NAME, CONSUMER_NAME, block_ms=3000
            )
            for msg_id, data in messages:
                project_id = int(data.get("project_id", 0))
                report_type = data.get("report_type", "daily")
                report_id = await generate_report(session_factory, project_id, report_type)
                if report_id:
                    await bus.publish(STREAM_REPORT_READY, {
                        "project_id": project_id, "report_id": report_id,
                        "report_type": report_type,
                    })
                await bus.ack(STREAM_REPORT_REQUESTS, GROUP_NAME, msg_id)
        except Exception as e:
            logger.error(f"Report request processing error: {e}")
            await asyncio.sleep(1)


async def scheduled_reports(bus: EventBus, session_factory):
    """Generate reports on schedule: daily at 6AM, weekly Monday 7AM, monthly 1st 8AM."""
    while True:
        now = datetime.utcnow()

        # Check what needs to run
        tasks = []
        if now.hour == 6 and now.minute < 5:
            tasks.append("daily")
        if now.hour == 7 and now.minute < 5 and now.weekday() == 0:
            tasks.append("weekly")
        if now.hour == 8 and now.minute < 5 and now.day == 1:
            tasks.append("monthly")

        if tasks:
            async with session_factory() as db:
                result = await db.execute(
                    select(Project).where(Project.status == ProjectStatus.ACTIVE)
                )
                projects = result.scalars().all()

            for report_type in tasks:
                for project in projects:
                    try:
                        await generate_report(session_factory, project.id, report_type)
                    except Exception as e:
                        logger.error(f"Scheduled {report_type} report failed for project {project.id}: {e}")

        await asyncio.sleep(300)  # check every 5 minutes


async def main():
    engine, session_factory = create_db(DATABASE_URL)
    bus = EventBus(REDIS_URL)
    await bus.connect()

    logger.info("Report Service started")
    await asyncio.gather(
        listen_for_requests(bus, session_factory),
        scheduled_reports(bus, session_factory),
    )


if __name__ == "__main__":
    asyncio.run(main())
