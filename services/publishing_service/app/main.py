"""
Publishing Service — scheduled content publishing and reply management.

Responsibilities:
1. CRUD for scheduled posts (create, list, approve, delete, publish-now)
2. Reply to mentions via platform APIs
3. Background scheduler: checks for due posts and publishes them
4. Platform publishing via httpx to Twitter API v2, Facebook Graph API,
   LinkedIn API, and Instagram Content Publishing API
5. Consumes from 'publish:request' stream for event-driven publishing
6. Emits audit events on every publish action

Port: 8013
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, select

from shared.database import create_db, init_tables
from shared.events import (
    STREAM_AUDIT,
    STREAM_PUBLISH,
    AuditEvent,
    EventBus,
)
from shared.models import (
    Mention,
    Platform,
    PublishStatus,
    ScheduledPost,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Rate limiter service base URL
RATE_LIMITER_URL = os.getenv("RATE_LIMITER_URL", "http://rate-limiter:8014")

# Platform credentials from environment
TWITTER_BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN", "")
FACEBOOK_PAGE_ACCESS_TOKEN = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN", "")
FACEBOOK_PAGE_ID = os.getenv("FACEBOOK_PAGE_ID", "")
LINKEDIN_ACCESS_TOKEN = os.getenv("LINKEDIN_ACCESS_TOKEN", "")
LINKEDIN_AUTHOR_URN = os.getenv("LINKEDIN_AUTHOR_URN", "")  # urn:li:person:xxx or urn:li:organization:xxx
INSTAGRAM_USER_ID = os.getenv("INSTAGRAM_USER_ID", "")
INSTAGRAM_ACCESS_TOKEN = os.getenv("INSTAGRAM_ACCESS_TOKEN", "")

GROUP_NAME = "publishing-service"
CONSUMER_NAME = f"publisher-{os.getpid()}"

SCHEDULER_INTERVAL_SECONDS = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "15"))


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------


class PostCreate(BaseModel):
    project_id: int
    created_by: int
    platform: str
    content: str
    media_urls: Optional[str] = None
    scheduled_at: datetime
    reply_to_mention_id: Optional[int] = None


class PostOut(BaseModel):
    id: int
    project_id: int
    created_by: int
    platform: str
    content: str
    media_urls: Optional[str]
    scheduled_at: datetime
    published_at: Optional[datetime]
    status: str
    platform_post_id: Optional[str]
    approved_by: Optional[int]
    error_message: Optional[str]
    reply_to_mention_id: Optional[int]
    created_at: datetime
    model_config = {"from_attributes": True}


class ReplyCreate(BaseModel):
    project_id: int
    created_by: int
    mention_id: int
    platform: str
    content: str
    scheduled_at: Optional[datetime] = None


class ApproveRequest(BaseModel):
    approved_by: int


# ---------------------------------------------------------------------------
# Platform Publishers
# ---------------------------------------------------------------------------


async def _acquire_rate_limit(platform: str, endpoint: str) -> dict:
    """Ask the rate limiter service for permission to call a platform API.
    Returns {"allowed": True/False, "wait_seconds": float}.
    On failure (service unreachable), default to allow so publishing isn't blocked."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{RATE_LIMITER_URL}/acquire",
                json={"platform": platform, "endpoint": endpoint},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"Rate limiter unreachable, defaulting to allow: {e}")
    return {"allowed": True, "wait_seconds": 0}


async def publish_to_twitter(content: str, reply_to_id: Optional[str] = None) -> dict:
    """Publish a tweet via Twitter API v2."""
    rate = await _acquire_rate_limit("twitter", "post_tweet")
    if not rate.get("allowed"):
        return {"success": False, "error": f"Rate limited. Retry after {rate.get('wait_seconds', 0)}s"}

    url = "https://api.twitter.com/2/tweets"
    payload: dict = {"text": content}
    if reply_to_id:
        payload["reply"] = {"in_reply_to_tweet_id": reply_to_id}

    headers = {
        "Authorization": f"Bearer {TWITTER_BEARER_TOKEN}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in (200, 201):
                data = resp.json()
                return {"success": True, "platform_post_id": data["data"]["id"]}
            else:
                return {"success": False, "error": f"Twitter API {resp.status_code}: {resp.text}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def publish_to_facebook(content: str, media_urls: Optional[str] = None) -> dict:
    """Publish a post to a Facebook Page via Graph API."""
    rate = await _acquire_rate_limit("facebook", "page_post")
    if not rate.get("allowed"):
        return {"success": False, "error": f"Rate limited. Retry after {rate.get('wait_seconds', 0)}s"}

    url = f"https://graph.facebook.com/v19.0/{FACEBOOK_PAGE_ID}/feed"
    params = {
        "message": content,
        "access_token": FACEBOOK_PAGE_ACCESS_TOKEN,
    }
    if media_urls:
        first_url = media_urls.split(",")[0].strip()
        if first_url:
            params["link"] = first_url

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, data=params)
            if resp.status_code == 200:
                data = resp.json()
                return {"success": True, "platform_post_id": data.get("id", "")}
            else:
                return {"success": False, "error": f"Facebook API {resp.status_code}: {resp.text}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def publish_to_linkedin(content: str) -> dict:
    """Publish an UGC post to LinkedIn."""
    rate = await _acquire_rate_limit("linkedin", "ugc_post")
    if not rate.get("allowed"):
        return {"success": False, "error": f"Rate limited. Retry after {rate.get('wait_seconds', 0)}s"}

    url = "https://api.linkedin.com/v2/ugcPosts"
    headers = {
        "Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
    }
    payload = {
        "author": LINKEDIN_AUTHOR_URN,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": content},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in (200, 201):
                data = resp.json()
                return {"success": True, "platform_post_id": data.get("id", "")}
            else:
                return {"success": False, "error": f"LinkedIn API {resp.status_code}: {resp.text}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def publish_to_instagram(content: str, media_urls: Optional[str] = None) -> dict:
    """Publish to Instagram via Content Publishing API (requires media)."""
    rate = await _acquire_rate_limit("instagram", "media_publish")
    if not rate.get("allowed"):
        return {"success": False, "error": f"Rate limited. Retry after {rate.get('wait_seconds', 0)}s"}

    if not media_urls:
        return {"success": False, "error": "Instagram requires at least one media URL"}

    image_url = media_urls.split(",")[0].strip()
    base = "https://graph.facebook.com/v19.0"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Step 1: Create media container
            create_resp = await client.post(
                f"{base}/{INSTAGRAM_USER_ID}/media",
                data={
                    "image_url": image_url,
                    "caption": content,
                    "access_token": INSTAGRAM_ACCESS_TOKEN,
                },
            )
            if create_resp.status_code != 200:
                return {"success": False, "error": f"IG media create {create_resp.status_code}: {create_resp.text}"}

            container_id = create_resp.json().get("id")
            if not container_id:
                return {"success": False, "error": "No container ID returned from Instagram"}

            # Step 2: Publish the container
            publish_resp = await client.post(
                f"{base}/{INSTAGRAM_USER_ID}/media_publish",
                data={
                    "creation_id": container_id,
                    "access_token": INSTAGRAM_ACCESS_TOKEN,
                },
            )
            if publish_resp.status_code == 200:
                data = publish_resp.json()
                return {"success": True, "platform_post_id": data.get("id", "")}
            else:
                return {"success": False, "error": f"IG publish {publish_resp.status_code}: {publish_resp.text}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


PLATFORM_PUBLISHERS = {
    "twitter": publish_to_twitter,
    "facebook": publish_to_facebook,
    "linkedin": publish_to_linkedin,
    "instagram": publish_to_instagram,
}


async def publish_post(post: ScheduledPost, session_factory, bus: EventBus) -> dict:
    """Execute the actual publish and update the DB record."""
    platform_key = post.platform.value if isinstance(post.platform, Platform) else post.platform
    publisher = PLATFORM_PUBLISHERS.get(platform_key)

    if not publisher:
        return {"success": False, "error": f"Unsupported platform: {platform_key}"}

    # Build kwargs based on platform
    if platform_key == "twitter":
        # For replies, we'd need the source tweet ID from the mention
        reply_source_id = None
        if post.reply_to_mention_id:
            async with session_factory() as db:
                mention = await db.get(Mention, post.reply_to_mention_id)
                if mention and mention.source_id:
                    reply_source_id = mention.source_id
        result = await publisher(post.content, reply_to_id=reply_source_id)
    elif platform_key in ("facebook", "instagram"):
        result = await publisher(post.content, media_urls=post.media_urls)
    else:
        result = await publisher(post.content)

    # Update database record
    async with session_factory() as db:
        db_post = await db.get(ScheduledPost, post.id)
        if not db_post:
            return {"success": False, "error": "Post not found in database"}

        if result.get("success"):
            db_post.status = PublishStatus.PUBLISHED
            db_post.published_at = datetime.now(timezone.utc)
            db_post.platform_post_id = result.get("platform_post_id", "")
            db_post.error_message = None
            logger.info(f"Published post {post.id} to {platform_key}: {db_post.platform_post_id}")
        else:
            db_post.status = PublishStatus.FAILED
            db_post.error_message = result.get("error", "Unknown error")
            logger.error(f"Failed to publish post {post.id}: {db_post.error_message}")

        await db.commit()

    # Emit audit event
    try:
        action = "post.published" if result.get("success") else "post.publish_failed"
        await bus.publish(
            STREAM_AUDIT,
            AuditEvent(
                organization_id=0,
                user_id=post.created_by,
                action=action,
                resource_type="scheduled_post",
                resource_id=post.id,
                details=json.dumps(
                    {
                        "platform": platform_key,
                        "platform_post_id": result.get("platform_post_id", ""),
                        "error": result.get("error", ""),
                    }
                ),
            ),
        )
    except Exception as e:
        logger.warning(f"Failed to emit audit event: {e}")

    return result


# ---------------------------------------------------------------------------
# Background Tasks
# ---------------------------------------------------------------------------


async def scheduler_loop(session_factory, bus: EventBus):
    """Periodically check for scheduled posts that are due and publish them."""
    logger.info("Publishing scheduler started")
    while True:
        try:
            now = datetime.now(timezone.utc)
            async with session_factory() as db:
                result = await db.execute(
                    select(ScheduledPost).where(
                        and_(
                            ScheduledPost.status == PublishStatus.SCHEDULED,
                            ScheduledPost.scheduled_at <= now,
                        )
                    )
                )
                due_posts = result.scalars().all()

            for post in due_posts:
                logger.info(f"Scheduler publishing post {post.id} (due at {post.scheduled_at})")
                await publish_post(post, session_factory, bus)

        except Exception as e:
            logger.error(f"Scheduler loop error: {e}")

        await asyncio.sleep(SCHEDULER_INTERVAL_SECONDS)


async def consume_publish_requests(session_factory, bus: EventBus):
    """Consume event-driven publish requests from Redis stream."""
    await bus.ensure_group(STREAM_PUBLISH, GROUP_NAME)
    logger.info("Listening for publish:request events...")

    while True:
        try:
            messages = await bus.consume(
                STREAM_PUBLISH,
                GROUP_NAME,
                CONSUMER_NAME,
                count=10,
                block_ms=5000,
            )
            for msg_id, data in messages:
                try:
                    post_id = int(data.get("post_id", 0))
                    if post_id:
                        async with session_factory() as db:
                            post = await db.get(ScheduledPost, post_id)
                            if post and post.status in (
                                PublishStatus.DRAFT,
                                PublishStatus.SCHEDULED,
                            ):
                                await publish_post(post, session_factory, bus)
                            else:
                                logger.warning(f"Publish request for post {post_id}: not found or invalid status")
                    else:
                        logger.warning(f"Publish request missing post_id: {data}")
                except Exception as e:
                    logger.error(f"Failed to process publish request {msg_id}: {e}")
                finally:
                    await bus.ack(STREAM_PUBLISH, GROUP_NAME, msg_id)

        except Exception as e:
            logger.error(f"Publish consumer loop error: {e}")
            await asyncio.sleep(1)


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine, session_factory = create_db(DATABASE_URL)
    bus = EventBus(REDIS_URL)
    await init_tables(engine)
    await bus.connect()

    app.state.db_session = session_factory
    app.state.event_bus = bus

    # Launch background tasks
    scheduler_task = asyncio.create_task(scheduler_loop(session_factory, bus))
    consumer_task = asyncio.create_task(consume_publish_requests(session_factory, bus))

    logger.info("Publishing Service started on port 8013")
    yield

    scheduler_task.cancel()
    consumer_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass

    await bus.close()
    await engine.dispose()


app = FastAPI(
    title="KhushFus Publishing Service",
    description="Scheduled content publishing and reply management",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "publishing", "version": "0.1.0"}


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------


@app.post("/posts", response_model=PostOut, status_code=201)
async def create_post(body: PostCreate):
    """Create a new scheduled post (defaults to DRAFT status)."""
    session_factory = app.state.db_session

    async with session_factory() as db:
        post = ScheduledPost(
            project_id=body.project_id,
            created_by=body.created_by,
            platform=Platform(body.platform),
            content=body.content,
            media_urls=body.media_urls,
            scheduled_at=body.scheduled_at,
            status=PublishStatus.DRAFT,
            reply_to_mention_id=body.reply_to_mention_id,
        )
        db.add(post)
        await db.commit()
        await db.refresh(post)

        # Emit audit event
        try:
            await app.state.event_bus.publish(
                STREAM_AUDIT,
                AuditEvent(
                    organization_id=0,
                    user_id=body.created_by,
                    action="post.created",
                    resource_type="scheduled_post",
                    resource_id=post.id,
                    details=json.dumps(
                        {
                            "platform": body.platform,
                            "scheduled_at": body.scheduled_at.isoformat(),
                        }
                    ),
                ),
            )
        except Exception as e:
            logger.warning(f"Failed to emit audit event: {e}")

        return PostOut.model_validate(post)


@app.get("/posts", response_model=list[PostOut])
async def list_posts(
    project_id: int = Query(..., description="Filter by project ID"),
    status: Optional[str] = Query(None, description="Filter by status: draft, scheduled, published, failed"),
    platform: Optional[str] = Query(None, description="Filter by platform"),
):
    """List scheduled posts for a project, with optional status/platform filters."""
    session_factory = app.state.db_session

    async with session_factory() as db:
        stmt = select(ScheduledPost).where(ScheduledPost.project_id == project_id)

        if status:
            stmt = stmt.where(ScheduledPost.status == PublishStatus(status))
        if platform:
            stmt = stmt.where(ScheduledPost.platform == Platform(platform))

        stmt = stmt.order_by(ScheduledPost.scheduled_at.desc())
        result = await db.execute(stmt)
        posts = result.scalars().all()
        return [PostOut.model_validate(p) for p in posts]


@app.patch("/posts/{post_id}/approve", response_model=PostOut)
async def approve_post(post_id: int, body: ApproveRequest):
    """Approve a draft post and move it to SCHEDULED status."""
    session_factory = app.state.db_session

    async with session_factory() as db:
        post = await db.get(ScheduledPost, post_id)
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        if post.status != PublishStatus.DRAFT:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot approve post with status '{post.status.value}'. Only DRAFT posts can be approved.",
            )

        post.status = PublishStatus.SCHEDULED
        post.approved_by = body.approved_by
        await db.commit()
        await db.refresh(post)

        # Emit audit event
        try:
            await app.state.event_bus.publish(
                STREAM_AUDIT,
                AuditEvent(
                    organization_id=0,
                    user_id=body.approved_by,
                    action="post.approved",
                    resource_type="scheduled_post",
                    resource_id=post.id,
                    details=json.dumps({"approved_by": body.approved_by}),
                ),
            )
        except Exception as e:
            logger.warning(f"Failed to emit audit event: {e}")

        return PostOut.model_validate(post)


@app.delete("/posts/{post_id}", status_code=204)
async def delete_post(post_id: int):
    """Cancel and delete a scheduled post. Cannot delete already-published posts."""
    session_factory = app.state.db_session

    async with session_factory() as db:
        post = await db.get(ScheduledPost, post_id)
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        if post.status == PublishStatus.PUBLISHED:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete an already-published post",
            )

        user_id = post.created_by
        await db.delete(post)
        await db.commit()

        # Emit audit event
        try:
            await app.state.event_bus.publish(
                STREAM_AUDIT,
                AuditEvent(
                    organization_id=0,
                    user_id=user_id,
                    action="post.deleted",
                    resource_type="scheduled_post",
                    resource_id=post_id,
                ),
            )
        except Exception as e:
            logger.warning(f"Failed to emit audit event: {e}")

    return None


@app.post("/posts/{post_id}/publish-now", response_model=PostOut)
async def publish_now(post_id: int):
    """Immediately publish a post, bypassing the schedule."""
    session_factory = app.state.db_session
    bus = app.state.event_bus

    async with session_factory() as db:
        post = await db.get(ScheduledPost, post_id)
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        if post.status == PublishStatus.PUBLISHED:
            raise HTTPException(status_code=400, detail="Post is already published")

    result = await publish_post(post, session_factory, bus)

    # Re-fetch to return updated state
    async with session_factory() as db:
        updated = await db.get(ScheduledPost, post_id)
        if not updated:
            raise HTTPException(status_code=404, detail="Post not found after publish attempt")

        if not result.get("success"):
            raise HTTPException(
                status_code=502,
                detail=f"Publishing failed: {result.get('error', 'Unknown error')}",
            )

        return PostOut.model_validate(updated)


@app.post("/reply", response_model=PostOut, status_code=201)
async def create_reply(body: ReplyCreate):
    """Create a reply to a specific mention. Optionally schedule it or draft it."""
    session_factory = app.state.db_session

    # Verify the mention exists
    async with session_factory() as db:
        mention = await db.get(Mention, body.mention_id)
        if not mention:
            raise HTTPException(status_code=404, detail="Mention not found")

    scheduled_at = body.scheduled_at or datetime.now(timezone.utc)

    create_body = PostCreate(
        project_id=body.project_id,
        created_by=body.created_by,
        platform=body.platform,
        content=body.content,
        scheduled_at=scheduled_at,
        reply_to_mention_id=body.mention_id,
    )
    return await create_post(create_body)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8013)
