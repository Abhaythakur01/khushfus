"""
Redis Streams-based event bus for inter-service communication.

Streams:
  - mentions:raw       Collector → Analyzer (raw collected mentions)
  - mentions:analyzed  Analyzer → Storage/Notification (analyzed mentions)
  - alerts:trigger     Analyzer → Notification (spike/anomaly alerts)
  - reports:request    API → Report Service (on-demand report requests)
  - reports:ready      Report Service → API (report generation complete)

Each service uses a consumer group so multiple instances can share the load.
"""

import json
import logging
from dataclasses import asdict, dataclass

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)


# --- Event Definitions ---


@dataclass
class RawMentionEvent:
    """Emitted by Collector Service after collecting a mention."""

    project_id: int
    platform: str
    source_id: str
    source_url: str
    text: str
    author_name: str
    author_handle: str
    author_followers: int = 0
    author_profile_url: str = ""
    likes: int = 0
    shares: int = 0
    comments: int = 0
    reach: int = 0
    published_at: str = ""  # ISO format string
    matched_keywords: str = ""  # comma-separated


@dataclass
class AnalyzedMentionEvent:
    """Emitted by Analyzer Service after NLP processing."""

    project_id: int
    platform: str
    source_id: str
    source_url: str
    text: str
    author_name: str
    author_handle: str
    author_followers: int = 0
    author_profile_url: str = ""
    likes: int = 0
    shares: int = 0
    comments: int = 0
    reach: int = 0
    published_at: str = ""
    matched_keywords: str = ""
    # NLP results
    sentiment: str = "neutral"
    sentiment_score: float = 0.0
    language: str = "en"
    topics: str = ""  # comma-separated
    entities: str = ""  # JSON string
    emotions: str = ""  # JSON string: {"joy": 0.9, "anger": 0.01, ...}
    entities_json: str = ""  # JSON string: {"persons": [...], "organizations": [...], ...}
    aspects_json: str = ""  # JSON string: [{"aspect": ..., "sentiment": ..., "score": ...}]
    sarcasm: bool = False
    sentiment_tier: str = "vader"  # vader, transformer, claude


@dataclass
class AlertEvent:
    """Emitted when an anomaly or threshold breach is detected."""

    project_id: int
    alert_type: str  # spike, negative_surge, volume_drop, influencer_mention
    severity: str  # low, medium, high, critical
    title: str
    description: str
    data: str = ""  # JSON string of relevant data
    timestamp: str = ""


@dataclass
class ReportRequestEvent:
    """Request to generate a report."""

    project_id: int
    report_type: str  # daily, weekly, monthly, custom
    requested_by: str = ""


@dataclass
class MediaAnalysisEvent:
    """Request to analyze media (image/video/audio) attached to a mention."""

    mention_id: int
    project_id: int
    media_url: str
    media_type: str  # image, video, audio
    source_platform: str = ""


@dataclass
class MediaResultEvent:
    """Result of media analysis."""

    mention_id: int
    ocr_text: str = ""
    labels: str = ""  # JSON: detected objects, logos, scenes
    transcript: str = ""  # video/audio transcript
    logo_detected: str = ""  # comma-separated brand logos


@dataclass
class EnrichmentEvent:
    """Request to enrich author data for a mention."""

    mention_id: int
    project_id: int
    author_handle: str
    author_platform: str
    author_followers: int = 0


@dataclass
class EnrichmentResultEvent:
    """Result of author enrichment."""

    mention_id: int
    influence_score: float = 0.0
    is_bot: bool = False
    org_name: str = ""
    virality_score: float = 0.0


@dataclass
class ExportRequestEvent:
    """Request to export data."""

    export_job_id: int
    project_id: int
    export_format: str
    filters_json: str = ""


@dataclass
class PublishRequestEvent:
    """Request to publish content to a platform."""

    post_id: int
    project_id: int
    platform: str
    content: str
    media_urls: str = ""
    reply_to_mention_id: int = 0


@dataclass
class WorkflowTriggerEvent:
    """A workflow has been triggered by a mention matching its conditions."""

    workflow_id: int
    project_id: int
    mention_id: int
    trigger_data: str = ""  # JSON


@dataclass
class AuditEvent:
    """An auditable action occurred."""

    organization_id: int
    user_id: int
    action: str
    resource_type: str
    resource_id: int = 0
    details: str = ""
    ip_address: str = ""


# --- Stream Names ---

STREAM_RAW_MENTIONS = "mentions:raw"
STREAM_ANALYZED_MENTIONS = "mentions:analyzed"
STREAM_ALERTS = "alerts:trigger"
STREAM_REPORT_REQUESTS = "reports:request"
STREAM_REPORT_READY = "reports:ready"
STREAM_MEDIA_ANALYSIS = "media:analyze"
STREAM_MEDIA_RESULTS = "media:results"
STREAM_ENRICHMENT = "enrichment:request"
STREAM_ENRICHMENT_RESULTS = "enrichment:results"
STREAM_EXPORT = "export:request"
STREAM_PUBLISH = "publish:request"
STREAM_WORKFLOW = "workflow:trigger"
STREAM_AUDIT = "audit:log"
STREAM_COLLECTION_REQUEST = "collection:request"


# --- Event Bus ---


class EventBus:
    """Async Redis Streams event bus for microservice communication."""

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self._redis: aioredis.Redis | None = None

    async def connect(self):
        if not self._redis:
            self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
        return self._redis

    async def close(self):
        if self._redis:
            await self._redis.aclose()
            self._redis = None

    async def publish(self, stream: str, event) -> str:
        """Publish an event to a stream. Returns the message ID."""
        r = await self.connect()
        data = asdict(event) if hasattr(event, "__dataclass_fields__") else event
        # Redis streams need flat string values
        flat = {k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) for k, v in data.items()}
        msg_id = await r.xadd(stream, flat)
        logger.debug(f"Published to {stream}: {msg_id}")
        return msg_id

    async def ensure_group(self, stream: str, group: str):
        """Create a consumer group if it doesn't exist."""
        r = await self.connect()
        try:
            await r.xgroup_create(stream, group, id="0", mkstream=True)
        except aioredis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise

    async def consume(
        self,
        stream: str,
        group: str,
        consumer: str,
        count: int = 10,
        block_ms: int = 5000,
    ) -> list[tuple[str, dict]]:
        """Read messages from a consumer group. Returns list of (msg_id, data)."""
        r = await self.connect()
        results = await r.xreadgroup(group, consumer, {stream: ">"}, count=count, block=block_ms)
        messages = []
        for stream_name, entries in results:
            for msg_id, data in entries:
                messages.append((msg_id, data))
        return messages

    async def ack(self, stream: str, group: str, msg_id: str):
        """Acknowledge a processed message."""
        r = await self.connect()
        await r.xack(stream, group, msg_id)

    async def publish_batch(self, stream: str, events: list) -> list[str]:
        """Publish multiple events efficiently using pipeline."""
        r = await self.connect()
        pipe = r.pipeline()
        for event in events:
            data = asdict(event) if hasattr(event, "__dataclass_fields__") else event
            flat = {k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) for k, v in data.items()}
            pipe.xadd(stream, flat)
        return await pipe.execute()
