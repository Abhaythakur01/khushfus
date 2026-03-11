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
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from jose import jwt as jose_jwt
from pydantic import BaseModel
from sqlalchemy import and_, select

from shared.circuit_breaker import CircuitBreaker, CircuitBreakerError
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
from shared.project_auth import verify_project_access
from shared.request_logging import RequestLoggingMiddleware
from shared.tracing import setup_tracing

setup_tracing("publishing")

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

# ---------------------------------------------------------------------------
# JWT Authentication
# ---------------------------------------------------------------------------

_security = HTTPBearer(auto_error=False)
_JWT_SECRET = os.getenv("JWT_SECRET_KEY", "")
_JWT_ALGO = "HS256"


async def require_auth(cred: HTTPAuthorizationCredentials | None = Depends(_security)) -> dict:
    if not cred:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = jose_jwt.decode(cred.credentials, _JWT_SECRET, algorithms=[_JWT_ALGO])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


GROUP_NAME = "publishing-service"
CONSUMER_NAME = f"publisher-{os.getpid()}"

SCHEDULER_INTERVAL_SECONDS = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "15"))

# ---------------------------------------------------------------------------
# Per-platform circuit breakers for external API calls
# ---------------------------------------------------------------------------

_twitter_breaker = CircuitBreaker("twitter-api", failure_threshold=5, recovery_timeout=60.0)
_facebook_breaker = CircuitBreaker("facebook-api", failure_threshold=5, recovery_timeout=60.0)
_linkedin_breaker = CircuitBreaker("linkedin-api", failure_threshold=5, recovery_timeout=60.0)
_instagram_breaker = CircuitBreaker("instagram-api", failure_threshold=5, recovery_timeout=60.0)


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
                f"{RATE_LIMITER_URL}/api/v1/acquire",
                json={"platform": platform, "endpoint": endpoint},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        logger.warning(f"Rate limiter unreachable, defaulting to deny: {e}")
    return {"allowed": False, "wait_seconds": 5}


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
        async def _call():
            async with httpx.AsyncClient(timeout=30.0) as client:
                return await client.post(url, json=payload, headers=headers)

        resp = await _twitter_breaker.call(_call)
        if resp.status_code in (200, 201):
            data = resp.json()
            return {"success": True, "platform_post_id": data["data"]["id"]}
        else:
            return {"success": False, "error": f"Twitter API {resp.status_code}: {resp.text}"}
    except CircuitBreakerError:
        return {"success": False, "error": "Twitter API circuit breaker is open — too many recent failures"}
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
        async def _call():
            async with httpx.AsyncClient(timeout=30.0) as client:
                return await client.post(url, data=params)

        resp = await _facebook_breaker.call(_call)
        if resp.status_code == 200:
            data = resp.json()
            return {"success": True, "platform_post_id": data.get("id", "")}
        else:
            return {"success": False, "error": f"Facebook API {resp.status_code}: {resp.text}"}
    except CircuitBreakerError:
        return {"success": False, "error": "Facebook API circuit breaker is open — too many recent failures"}
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
        async def _call():
            async with httpx.AsyncClient(timeout=30.0) as client:
                return await client.post(url, json=payload, headers=headers)

        resp = await _linkedin_breaker.call(_call)
        if resp.status_code in (200, 201):
            data = resp.json()
            return {"success": True, "platform_post_id": data.get("id", "")}
        else:
            return {"success": False, "error": f"LinkedIn API {resp.status_code}: {resp.text}"}
    except CircuitBreakerError:
        return {"success": False, "error": "LinkedIn API circuit breaker is open — too many recent failures"}
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
        async def _call():
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
                    raise RuntimeError(f"IG media create {create_resp.status_code}: {create_resp.text}")

                container_id = create_resp.json().get("id")
                if not container_id:
                    raise RuntimeError("No container ID returned from Instagram")

                # Step 2: Publish the container
                publish_resp = await client.post(
                    f"{base}/{INSTAGRAM_USER_ID}/media_publish",
                    data={
                        "creation_id": container_id,
                        "access_token": INSTAGRAM_ACCESS_TOKEN,
                    },
                )
                return create_resp, publish_resp

        create_resp, publish_resp = await _instagram_breaker.call(_call)
        if publish_resp.status_code == 200:
            data = publish_resp.json()
            return {"success": True, "platform_post_id": data.get("id", "")}
        else:
            return {"success": False, "error": f"IG publish {publish_resp.status_code}: {publish_resp.text}"}
    except CircuitBreakerError:
        return {"success": False, "error": "Instagram API circuit breaker is open — too many recent failures"}
    except RuntimeError as e:
        return {"success": False, "error": str(e)}
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

    app.state.engine = engine
    app.state.scheduler_task = scheduler_task
    app.state.consumer_task = consumer_task

    logger.info("Publishing Service started on port 8013")
    yield

    # --- Graceful shutdown ---
    logger.info("Publishing Service shutting down -- cancelling background tasks")

    for task_name, task in [("scheduler", scheduler_task), ("consumer", consumer_task)]:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            logger.debug("Background task '%s' cancelled", task_name)
        except Exception as exc:
            logger.warning("Error stopping background task '%s': %s", task_name, exc)

    try:
        await bus.close()
    except Exception as exc:
        logger.warning("Error closing event bus: %s", exc)

    try:
        await engine.dispose()
    except Exception as exc:
        logger.warning("Error disposing DB engine: %s", exc)

    logger.info("Publishing Service stopped")


app = FastAPI(
    title="KhushFus Publishing Service",
    description="Scheduled content publishing and reply management",
    version="0.1.0",
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "Posts", "description": "Scheduled post CRUD, approval, and immediate publishing."},
        {"name": "Replies", "description": "Reply to social mentions."},
        {"name": "Health", "description": "Service health check."},
    ],
    lifespan=lifespan,
)


app.add_middleware(RequestLoggingMiddleware, service_name="publishing")

try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass

v1_router = APIRouter(prefix="/api/v1")


@app.get(
    "/health",
    tags=["Health"],
    summary="Publishing health check",
    description="Returns the health status of the Publishing service and its dependencies.",
)
async def health():
    from shared.health import build_health_response, check_postgres, check_redis

    checks = {
        "postgres": await check_postgres(database_url=DATABASE_URL),
        "redis": await check_redis(REDIS_URL),
    }
    return await build_health_response("publishing", checks=checks)


# ---------------------------------------------------------------------------
# REST Endpoints
# ---------------------------------------------------------------------------


@v1_router.post(
    "/posts",
    response_model=PostOut,
    status_code=201,
    tags=["Posts"],
    summary="Create a scheduled post",
    description="Create a new post in DRAFT status, scheduled for future publishing to a social platform.",
)
async def create_post(body: PostCreate, user: dict = Depends(require_auth)):
    """Create a new scheduled post (defaults to DRAFT status)."""
    session_factory = app.state.db_session

    async with session_factory() as db:
        await verify_project_access(db, body.project_id, user)
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


@v1_router.get(
    "/posts",
    response_model=list[PostOut],
    tags=["Posts"],
    summary="List scheduled posts",
    description="List scheduled posts for a project with optional status and platform filters.",
)
async def list_posts(
    project_id: int = Query(..., description="Filter by project ID"),
    status: Optional[str] = Query(None, description="Filter by status: draft, scheduled, published, failed"),
    platform: Optional[str] = Query(None, description="Filter by platform"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_auth),
):
    """List scheduled posts for a project, with optional status/platform filters."""
    session_factory = app.state.db_session

    async with session_factory() as db:
        await verify_project_access(db, project_id, user)
        stmt = select(ScheduledPost).where(ScheduledPost.project_id == project_id)

        if status:
            stmt = stmt.where(ScheduledPost.status == PublishStatus(status))
        if platform:
            stmt = stmt.where(ScheduledPost.platform == Platform(platform))

        stmt = stmt.order_by(ScheduledPost.scheduled_at.desc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(stmt)
        posts = result.scalars().all()
        return [PostOut.model_validate(p) for p in posts]


@v1_router.patch(
    "/posts/{post_id}/approve",
    response_model=PostOut,
    tags=["Posts"],
    summary="Approve a draft post",
    description="Approve a draft post and move it to SCHEDULED status for background publishing.",
)
async def approve_post(post_id: int, body: ApproveRequest, user: dict = Depends(require_auth)):
    """Approve a draft post and move it to SCHEDULED status."""
    if user.get("role") not in ("admin", "editor", "manager") and not user.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Approval requires editor role or higher")

    session_factory = app.state.db_session

    async with session_factory() as db:
        post = await db.get(ScheduledPost, post_id)
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        await verify_project_access(db, post.project_id, user)

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


@v1_router.delete(
    "/posts/{post_id}",
    status_code=204,
    tags=["Posts"],
    summary="Delete a scheduled post",
    description="Cancel and delete a scheduled post. Already-published posts cannot be deleted.",
)
async def delete_post(post_id: int, user: dict = Depends(require_auth)):
    """Cancel and delete a scheduled post. Cannot delete already-published posts."""
    session_factory = app.state.db_session

    async with session_factory() as db:
        post = await db.get(ScheduledPost, post_id)
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        await verify_project_access(db, post.project_id, user)

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


@v1_router.post(
    "/posts/{post_id}/publish-now",
    response_model=PostOut,
    tags=["Posts"],
    summary="Publish immediately",
    description="Immediately publish a post to the target platform, bypassing the scheduled time.",
)
async def publish_now(post_id: int, user: dict = Depends(require_auth)):
    """Immediately publish a post, bypassing the schedule."""
    session_factory = app.state.db_session
    bus = app.state.event_bus

    async with session_factory() as db:
        post = await db.get(ScheduledPost, post_id)
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")

        await verify_project_access(db, post.project_id, user)

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


@v1_router.post(
    "/reply",
    response_model=PostOut,
    status_code=201,
    tags=["Replies"],
    summary="Create a reply",
    description="Create a reply to a specific social mention. Can be scheduled or drafted for later publishing.",
)
async def create_reply(body: ReplyCreate, user: dict = Depends(require_auth)):
    """Create a reply to a specific mention. Optionally schedule it or draft it."""
    session_factory = app.state.db_session

    # Verify project access and mention existence
    async with session_factory() as db:
        await verify_project_access(db, body.project_id, user)
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
    return await create_post(create_body, user)


app.include_router(v1_router)

# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8013)
