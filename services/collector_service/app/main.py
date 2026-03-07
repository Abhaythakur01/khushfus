"""
Collector Service — collects mentions from all social platforms.

Runs as a long-lived async process:
1. Listens to 'collection:request' stream for on-demand collection triggers
2. Runs a periodic scheduler for hourly collection of all active projects
3. For each project, iterates configured platforms, calls collectors
4. Publishes raw mentions to 'mentions:raw' stream for the Analyzer Service
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import select

from shared.database import create_db
from shared.events import EventBus, RawMentionEvent, STREAM_RAW_MENTIONS
from shared.models import Keyword, Project, ProjectStatus

from .collectors import PLATFORM_COLLECTORS

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus"
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
COLLECTION_INTERVAL_SECONDS = int(os.getenv("COLLECTION_INTERVAL", "3600"))  # 1 hour

GROUP_NAME = "collector-service"
CONSUMER_NAME = f"collector-{os.getpid()}"


async def collect_project(bus: EventBus, session_factory, project_id: int, hours_back: int = 1):
    """Collect mentions for a single project and publish to event bus."""
    async with session_factory() as db:
        project = await db.get(Project, project_id)
        if not project or project.status != ProjectStatus.ACTIVE:
            logger.warning(f"Project {project_id} not found or inactive")
            return

        result = await db.execute(
            select(Keyword).where(Keyword.project_id == project_id, Keyword.is_active.is_(True))
        )
        keywords = [kw.term for kw in result.scalars().all()]
        if not keywords:
            logger.warning(f"No active keywords for project {project_id}")
            return

    since = datetime.utcnow() - timedelta(hours=hours_back)
    platforms = [p.strip() for p in project.platforms.split(",")]

    total = 0
    for platform_name in platforms:
        collector_cls = PLATFORM_COLLECTORS.get(platform_name)
        if not collector_cls:
            continue

        collector = collector_cls()
        try:
            raw_mentions = await collector.collect(keywords, since)
            logger.info(f"[{project.name}] {platform_name}: collected {len(raw_mentions)} mentions")

            # Publish each mention to the event bus
            events = []
            for m in raw_mentions:
                matched = [kw for kw in keywords if kw.lower() in m.text.lower()]
                events.append(RawMentionEvent(
                    project_id=project_id,
                    platform=m.platform,
                    source_id=m.source_id,
                    source_url=m.source_url,
                    text=m.text[:5000],
                    author_name=m.author_name,
                    author_handle=m.author_handle,
                    author_followers=m.author_followers,
                    author_profile_url=m.author_profile_url,
                    likes=m.likes,
                    shares=m.shares,
                    comments=m.comments,
                    reach=m.reach,
                    published_at=m.published_at.isoformat() if m.published_at else "",
                    matched_keywords=",".join(matched),
                ))

            if events:
                await bus.publish_batch(STREAM_RAW_MENTIONS, events)
                total += len(events)

        except Exception as e:
            logger.error(f"[{project.name}] {platform_name} failed: {e}")

    logger.info(f"[{project.name}] Published {total} raw mentions to event bus")


async def collect_all_active(bus: EventBus, session_factory):
    """Collect mentions for all active projects."""
    async with session_factory() as db:
        result = await db.execute(
            select(Project).where(Project.status == ProjectStatus.ACTIVE)
        )
        projects = result.scalars().all()

    for project in projects:
        try:
            await collect_project(bus, session_factory, project.id, hours_back=1)
        except Exception as e:
            logger.error(f"Collection failed for project {project.id}: {e}")


async def listen_for_requests(bus: EventBus, session_factory):
    """Listen for on-demand collection requests from the Gateway."""
    await bus.ensure_group("collection:request", GROUP_NAME)
    logger.info("Listening for collection requests...")

    while True:
        try:
            messages = await bus.consume("collection:request", GROUP_NAME, CONSUMER_NAME, block_ms=2000)
            for msg_id, data in messages:
                project_id = int(data.get("project_id", 0))
                hours_back = int(data.get("hours_back", 24))
                logger.info(f"On-demand collection for project {project_id}, {hours_back}h back")
                await collect_project(bus, session_factory, project_id, hours_back)
                await bus.ack("collection:request", GROUP_NAME, msg_id)
        except Exception as e:
            logger.error(f"Error processing collection request: {e}")
            await asyncio.sleep(1)


async def periodic_collection(bus: EventBus, session_factory):
    """Run collection for all projects on a fixed interval."""
    while True:
        logger.info("Starting periodic collection for all active projects")
        try:
            await collect_all_active(bus, session_factory)
        except Exception as e:
            logger.error(f"Periodic collection error: {e}")

        logger.info(f"Next collection in {COLLECTION_INTERVAL_SECONDS}s")
        await asyncio.sleep(COLLECTION_INTERVAL_SECONDS)


async def main():
    engine, session_factory = create_db(DATABASE_URL)
    bus = EventBus(REDIS_URL)
    await bus.connect()

    logger.info("Collector Service started")

    # Run both: on-demand listener + periodic scheduler
    await asyncio.gather(
        listen_for_requests(bus, session_factory),
        periodic_collection(bus, session_factory),
    )


if __name__ == "__main__":
    asyncio.run(main())
