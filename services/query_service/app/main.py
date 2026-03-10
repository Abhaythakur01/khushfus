"""
Query Service — stores analyzed mentions and indexes them in OpenSearch.

Consumes from 'mentions:analyzed' stream:
1. Deduplicates by (source_id, platform, project_id)
2. Stores in PostgreSQL
3. Indexes in OpenSearch for full-text search
4. Emits alert events if anomalies detected (volume spikes, negative surges)
"""

import asyncio
import logging
import os
import signal
from datetime import datetime

from opensearchpy import AsyncOpenSearch
from sqlalchemy import select

from shared.database import create_db
from shared.events import (
    STREAM_ANALYZED_MENTIONS,
    EventBus,
)
from shared.models import Mention, Platform, Sentiment

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://opensearch:9200")

GROUP_NAME = "query-service"
CONSUMER_NAME = f"query-{os.getpid()}"
ES_INDEX = "khushfus-mentions"


async def init_elasticsearch(es: AsyncOpenSearch):
    """Create the OpenSearch index with proper mappings."""
    if not await es.indices.exists(index=ES_INDEX):
        await es.indices.create(
            index=ES_INDEX,
            body={
                "mappings": {
                    "properties": {
                        "project_id": {"type": "integer"},
                        "platform": {"type": "keyword"},
                        "text": {"type": "text", "analyzer": "standard"},
                        "author_name": {"type": "keyword"},
                        "author_handle": {"type": "keyword"},
                        "sentiment": {"type": "keyword"},
                        "sentiment_score": {"type": "float"},
                        "language": {"type": "keyword"},
                        "matched_keywords": {"type": "text"},
                        "topics": {"type": "keyword"},
                        "likes": {"type": "integer"},
                        "shares": {"type": "integer"},
                        "comments": {"type": "integer"},
                        "reach": {"type": "integer"},
                        "published_at": {"type": "date"},
                        "collected_at": {"type": "date"},
                    }
                }
            },
        )
        logger.info(f"Created OpenSearch index: {ES_INDEX}")


async def store_mention(db_session, es: AsyncOpenSearch, data: dict) -> bool:
    """Store an analyzed mention in PostgreSQL and OpenSearch. Returns True if new."""
    project_id = int(data.get("project_id", 0))
    source_id = data.get("source_id", "")
    platform = data.get("platform", "other")

    async with db_session() as db:
        # Deduplicate
        existing = await db.execute(
            select(Mention).where(
                Mention.project_id == project_id,
                Mention.source_id == source_id,
                Mention.platform == platform,
            )
        )
        if existing.scalar_one_or_none():
            return False

        # Parse published_at
        published_at = None
        pub_str = data.get("published_at", "")
        if pub_str:
            try:
                published_at = datetime.fromisoformat(pub_str)
            except Exception:
                pass

        mention = Mention(
            project_id=project_id,
            platform=Platform(platform),
            source_id=source_id,
            source_url=data.get("source_url", ""),
            text=data.get("text", ""),
            author_name=data.get("author_name", ""),
            author_handle=data.get("author_handle", ""),
            author_followers=int(data.get("author_followers", 0)),
            author_profile_url=data.get("author_profile_url", ""),
            likes=int(data.get("likes", 0)),
            shares=int(data.get("shares", 0)),
            comments=int(data.get("comments", 0)),
            reach=int(data.get("reach", 0)),
            sentiment=Sentiment(data.get("sentiment", "neutral")),
            sentiment_score=float(data.get("sentiment_score", 0.0)),
            language=data.get("language", "en"),
            matched_keywords=data.get("matched_keywords", ""),
            topics=data.get("topics", ""),
            entities=data.get("entities", ""),
            published_at=published_at,
        )
        db.add(mention)
        await db.commit()
        await db.refresh(mention)

        # Index in OpenSearch
        try:
            await es.index(
                index=ES_INDEX,
                id=str(mention.id),
                document={
                    "project_id": mention.project_id,
                    "platform": mention.platform.value,
                    "text": mention.text,
                    "author_name": mention.author_name,
                    "author_handle": mention.author_handle,
                    "sentiment": mention.sentiment.value,
                    "sentiment_score": mention.sentiment_score,
                    "language": mention.language,
                    "matched_keywords": mention.matched_keywords,
                    "topics": mention.topics,
                    "likes": mention.likes,
                    "shares": mention.shares,
                    "comments": mention.comments,
                    "reach": mention.reach,
                    "published_at": mention.published_at.isoformat() if mention.published_at else None,
                    "collected_at": mention.collected_at.isoformat() if mention.collected_at else None,
                },
            )
        except Exception as e:
            logger.warning(f"ES indexing failed for mention {mention.id}: {e}")

        return True


async def process_loop(bus: EventBus, db_session, es: AsyncOpenSearch, shutdown_event: asyncio.Event):
    """Main loop: consume analyzed mentions, store, index."""
    await bus.ensure_group(STREAM_ANALYZED_MENTIONS, GROUP_NAME)
    logger.info("Query Service listening for analyzed mentions...")

    while not shutdown_event.is_set():
        try:
            messages = await bus.consume(
                STREAM_ANALYZED_MENTIONS,
                GROUP_NAME,
                CONSUMER_NAME,
                count=50,
                block_ms=3000,
            )

            if not messages:
                continue

            stored = 0
            for msg_id, data in messages:
                try:
                    is_new = await store_mention(db_session, es, data)
                    if is_new:
                        stored += 1
                except Exception as e:
                    logger.error(f"Failed to store mention {msg_id}: {e}")
                finally:
                    await bus.ack(STREAM_ANALYZED_MENTIONS, GROUP_NAME, msg_id)

            if stored:
                logger.info(f"Stored {stored} new mentions (of {len(messages)} received)")

        except Exception as e:
            logger.error(f"Query service loop error: {e}")
            await asyncio.sleep(1)


shutdown_event = asyncio.Event()


async def main():
    engine, session_factory = create_db(DATABASE_URL)
    bus = EventBus(REDIS_URL)
    await bus.connect()

    es = AsyncOpenSearch(hosts=[ELASTICSEARCH_URL])
    await init_elasticsearch(es)

    loop = asyncio.get_running_loop()
    try:
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, shutdown_event.set)
    except NotImplementedError:
        # Windows does not support add_signal_handler
        pass

    logger.info("Query Service started")
    try:
        await process_loop(bus, session_factory, es, shutdown_event)
    finally:
        logger.info("Query Service shutting down gracefully")
        await es.close()
        await bus.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
