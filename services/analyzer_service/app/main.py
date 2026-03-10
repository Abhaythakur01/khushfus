"""
Analyzer Service -- NLP processing pipeline.

Consumes raw mentions from 'mentions:raw' stream, performs:
1. Tiered sentiment analysis (VADER -> Transformer -> Claude)
2. Language detection
3. Topic extraction
4. Entity extraction (mentions, hashtags, NER)
5. Emotion detection
6. Aspect-based sentiment (for high-engagement mentions)
7. Sarcasm detection

Then publishes analyzed mentions to 'mentions:analyzed' stream
for the storage pipeline and Notification Service.

This service can be deployed on GPU nodes for transformer inference.
"""

import asyncio
import json
import logging
import os
import signal

from shared.events import (
    STREAM_ANALYZED_MENTIONS,
    STREAM_RAW_MENTIONS,
    AnalyzedMentionEvent,
    EventBus,
)
from src.nlp.analyzer import SentimentAnalyzer

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
GROUP_NAME = "analyzer-service"
CONSUMER_NAME = f"analyzer-{os.getpid()}"
BATCH_SIZE = int(os.getenv("ANALYZER_BATCH_SIZE", "20"))
HIGH_ENGAGEMENT_THRESHOLD = int(os.getenv("HIGH_ENGAGEMENT_THRESHOLD", "100"))

analyzer = SentimentAnalyzer()


def analyze_mention(data: dict) -> AnalyzedMentionEvent:
    """Run NLP analysis on a raw mention and produce an analyzed event."""
    text = data.get("text", "")

    # Calculate engagement for tiered sentiment decisions
    likes = int(data.get("likes", 0))
    shares = int(data.get("shares", 0))
    comments = int(data.get("comments", 0))
    engagement = likes + shares + comments

    # Run full NLP pipeline
    result = analyzer.analyze(
        text,
        engagement=engagement,
        high_engagement_threshold=HIGH_ENGAGEMENT_THRESHOLD,
    )

    return AnalyzedMentionEvent(
        project_id=int(data.get("project_id", 0)),
        platform=data.get("platform", ""),
        source_id=data.get("source_id", ""),
        source_url=data.get("source_url", ""),
        text=text,
        author_name=data.get("author_name", ""),
        author_handle=data.get("author_handle", ""),
        author_followers=int(data.get("author_followers", 0)),
        author_profile_url=data.get("author_profile_url", ""),
        likes=likes,
        shares=shares,
        comments=comments,
        reach=int(data.get("reach", 0)),
        published_at=data.get("published_at", ""),
        matched_keywords=data.get("matched_keywords", ""),
        # NLP results
        sentiment=result.sentiment,
        sentiment_score=result.sentiment_score,
        language=result.language,
        topics=",".join(result.topics),
        entities=json.dumps(result.entities),
        emotions=json.dumps(result.emotions),
        entities_json=json.dumps(result.ner_entities),
        aspects_json=json.dumps(result.aspects),
        sarcasm=result.sarcasm,
        sentiment_tier=result.sentiment_tier,
    )


async def process_loop(bus: EventBus, shutdown_event: asyncio.Event):
    """Main processing loop: consume raw mentions, analyze, publish."""
    await bus.ensure_group(STREAM_RAW_MENTIONS, GROUP_NAME)
    logger.info("Analyzer Service listening for raw mentions...")

    while not shutdown_event.is_set():
        try:
            messages = await bus.consume(
                STREAM_RAW_MENTIONS,
                GROUP_NAME,
                CONSUMER_NAME,
                count=BATCH_SIZE,
                block_ms=3000,
            )

            if not messages:
                continue

            analyzed_events = []
            ack_ids = []

            for msg_id, data in messages:
                try:
                    loop = asyncio.get_running_loop()
                    event = await loop.run_in_executor(None, analyze_mention, data)
                    analyzed_events.append(event)
                    ack_ids.append(msg_id)
                except Exception as e:
                    logger.error(f"Failed to analyze mention {msg_id}: {e}")
                    ack_ids.append(msg_id)  # ack anyway to avoid stuck messages

            # Publish analyzed mentions
            if analyzed_events:
                await bus.publish_batch(STREAM_ANALYZED_MENTIONS, analyzed_events)
                logger.info(f"Analyzed and published {len(analyzed_events)} mentions")

            # Acknowledge all processed messages
            for mid in ack_ids:
                await bus.ack(STREAM_RAW_MENTIONS, GROUP_NAME, mid)

        except Exception as e:
            logger.error(f"Analyzer loop error: {e}")
            await asyncio.sleep(1)


shutdown_event = asyncio.Event()


async def main():
    bus = EventBus(REDIS_URL)
    await bus.connect()

    loop = asyncio.get_running_loop()
    try:
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, shutdown_event.set)
    except NotImplementedError:
        # Windows does not support add_signal_handler
        pass

    logger.info("Analyzer Service started")
    try:
        await process_loop(bus, shutdown_event)
    finally:
        logger.info("Analyzer Service shutting down gracefully")
        await bus.close()


if __name__ == "__main__":
    asyncio.run(main())
