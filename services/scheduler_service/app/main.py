"""
Scheduler / Workflow Service — automation engine for KhushFus.

Responsibilities:
1. CRUD for Workflow definitions (trigger_json + actions_json)
2. Background consumer: listens to STREAM_ANALYZED_MENTIONS
   - Evaluates trigger conditions against each active workflow for the mention's project
   - Executes configured actions (notify_slack, notify_email, flag_mention, auto_reply, escalate)
3. Manages custom report schedules per project
4. Runs scheduled jobs via asyncio background tasks

Port: 8017
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from jose import jwt as jose_jwt
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared.circuit_breaker import CircuitBreaker, CircuitBreakerError
from shared.database import create_db, init_tables
from shared.events import (
    STREAM_ANALYZED_MENTIONS,
    STREAM_REPORT_REQUESTS,
    STREAM_WORKFLOW,
    EventBus,
    ReportRequestEvent,
    WorkflowTriggerEvent,
)
from shared.logging_config import setup_logging
from shared.models import (
    Mention,
    Project,
    ProjectStatus,
    Workflow,
    WorkflowStatus,
)
from shared.tracing import setup_tracing
from shared.url_validator import validate_url

_action_breaker = CircuitBreaker(name="workflow-action")

setup_tracing("scheduler")
setup_logging("scheduler-service")
logger = logging.getLogger(__name__)

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


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

GROUP_NAME = "scheduler-service"
CONSUMER_NAME = f"scheduler-{os.getpid()}"


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class WorkflowCreate(BaseModel):
    project_id: int
    name: str
    trigger_json: dict | list  # e.g. {"type": "sentiment_below", "score": -0.5}
    actions_json: list[dict]  # e.g. [{"type": "notify_slack", "webhook_url": "..."}]


class WorkflowUpdate(BaseModel):
    name: str | None = None
    trigger_json: dict | list | None = None
    actions_json: list[dict] | None = None
    status: str | None = None  # active, paused


class WorkflowOut(BaseModel):
    id: int
    project_id: int
    name: str
    trigger_json: str
    actions_json: str
    status: str
    executions: int
    created_at: str
    model_config = {"from_attributes": True}


class WorkflowStatsOut(BaseModel):
    id: int
    name: str
    executions: int
    status: str
    created_at: str
    last_trigger_time: str | None = None


class ReportScheduleCreate(BaseModel):
    project_id: int
    report_type: str = "custom"  # daily, weekly, monthly, custom
    cron_hours: int = 6  # hour of day (0-23) to run
    cron_weekday: int | None = None  # 0=Monday, None=every day
    cron_monthday: int | None = None  # 1-28, None=ignore
    is_active: bool = True


class ReportScheduleOut(BaseModel):
    project_id: int
    report_type: str
    cron_hours: int
    cron_weekday: int | None
    cron_monthday: int | None
    is_active: bool


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "scheduler-workflow"
    version: str = "0.1.0"


# ---------------------------------------------------------------------------
# In-memory report schedule store
# (In production, persist in a dedicated table; here we keep it lightweight)
# ---------------------------------------------------------------------------

# TODO: Persist to database table for durability across restarts
_report_schedules: dict[int, list[dict]] = {}  # project_id -> list of schedule dicts

# Track last workflow trigger times in-memory
_last_trigger_times: dict[int, datetime] = {}  # workflow_id -> datetime


# ---------------------------------------------------------------------------
# App lifespan & dependencies
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine, session_factory = create_db(DATABASE_URL)
    app.state.db_session = session_factory
    app.state.engine = engine

    bus = EventBus(REDIS_URL)
    await bus.connect()
    app.state.event_bus = bus

    await init_tables(engine)

    shutdown_event = asyncio.Event()
    app.state.shutdown_event = shutdown_event

    # Start background tasks
    consumer_task = asyncio.create_task(mention_consumer_loop(bus, session_factory, shutdown_event))
    scheduler_task = asyncio.create_task(report_scheduler_loop(bus, session_factory, shutdown_event))
    app.state._bg_tasks = [consumer_task, scheduler_task]

    logger.info("Scheduler/Workflow Service started with background tasks")

    yield

    # Shutdown
    shutdown_event.set()
    for t in app.state._bg_tasks:
        t.cancel()
    for t in app.state._bg_tasks:
        try:
            await t
        except asyncio.CancelledError:
            pass
    await bus.close()
    await engine.dispose()


app = FastAPI(
    title="KhushFus Scheduler / Workflow Service",
    description="Automation engine: workflow evaluation, action execution, and report scheduling",
    version="0.1.0",
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "Workflows", "description": "Workflow CRUD and execution statistics."},
        {"name": "Report Schedules", "description": "Custom report schedule management."},
        {"name": "Health", "description": "Service health check."},
    ],
    lifespan=lifespan,
)


try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass

v1_router = APIRouter(prefix="/api/v1")


async def get_db():
    async with app.state.db_session() as session:
        yield session


# ---------------------------------------------------------------------------
# Workflow CRUD endpoints
# ---------------------------------------------------------------------------


@app.get(
    "/health",
    tags=["Health"],
    summary="Scheduler health check",
    description="Returns the health status of the Scheduler/Workflow service and its dependencies.",
)
async def health():
    from shared.health import build_health_response, check_postgres, check_redis

    checks = {
        "postgres": await check_postgres(database_url=DATABASE_URL),
        "redis": await check_redis(REDIS_URL),
    }
    return await build_health_response("scheduler", checks=checks)


@v1_router.post(
    "/workflows",
    response_model=WorkflowOut,
    status_code=201,
    tags=["Workflows"],
    summary="Create a workflow",
    description="Create a new automation workflow with trigger conditions and actions for a project.",
)
async def create_workflow(
    payload: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Create a new workflow with trigger conditions and actions."""
    # Validate project exists
    project = await db.get(Project, payload.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    workflow = Workflow(
        project_id=payload.project_id,
        name=payload.name,
        trigger_json=json.dumps(payload.trigger_json),
        actions_json=json.dumps(payload.actions_json),
        status=WorkflowStatus.ACTIVE,
        executions=0,
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)

    logger.info(f"Created workflow '{workflow.name}' (id={workflow.id}) for project {payload.project_id}")
    return _workflow_to_out(workflow)


@v1_router.get(
    "/workflows",
    response_model=list[WorkflowOut],
    tags=["Workflows"],
    summary="List workflows",
    description="List workflows for a project, optionally filtered by status (active, paused).",
)
async def list_workflows(
    project_id: int = Query(...),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """List workflows for a project, optionally filtered by status."""
    stmt = select(Workflow).where(Workflow.project_id == project_id)
    if status:
        stmt = stmt.where(Workflow.status == WorkflowStatus(status))
    stmt = stmt.order_by(Workflow.created_at.desc())

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_workflow_to_out(w) for w in rows]


@v1_router.patch(
    "/workflows/{workflow_id}",
    response_model=WorkflowOut,
    tags=["Workflows"],
    summary="Update a workflow",
    description="Update a workflow's name, trigger conditions, actions, or status.",
)
async def update_workflow(
    workflow_id: int,
    payload: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Update a workflow's name, triggers, actions, or status."""
    workflow = await db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if payload.name is not None:
        workflow.name = payload.name
    if payload.trigger_json is not None:
        workflow.trigger_json = json.dumps(payload.trigger_json)
    if payload.actions_json is not None:
        workflow.actions_json = json.dumps(payload.actions_json)
    if payload.status is not None:
        workflow.status = WorkflowStatus(payload.status)

    await db.commit()
    await db.refresh(workflow)
    logger.info(f"Updated workflow {workflow_id}")
    return _workflow_to_out(workflow)


@v1_router.delete(
    "/workflows/{workflow_id}",
    status_code=204,
    tags=["Workflows"],
    summary="Delete a workflow",
    description="Permanently delete a workflow by its ID.",
)
async def delete_workflow(
    workflow_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Delete a workflow."""
    workflow = await db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    await db.delete(workflow)
    await db.commit()
    logger.info(f"Deleted workflow {workflow_id}")


@v1_router.get(
    "/workflows/{workflow_id}/stats",
    response_model=WorkflowStatsOut,
    tags=["Workflows"],
    summary="Get workflow stats",
    description="Get execution count and last trigger time for a specific workflow.",
)
async def workflow_stats(
    workflow_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Get execution count and last trigger time for a workflow."""
    workflow = await db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    last_trigger = _last_trigger_times.get(workflow_id)
    return WorkflowStatsOut(
        id=workflow.id,
        name=workflow.name,
        executions=workflow.executions,
        status=workflow.status.value if hasattr(workflow.status, "value") else str(workflow.status),
        created_at=workflow.created_at.isoformat(),
        last_trigger_time=last_trigger.isoformat() if last_trigger else None,
    )


# ---------------------------------------------------------------------------
# Report schedule endpoints
# ---------------------------------------------------------------------------


@v1_router.post(
    "/report-schedules",
    response_model=ReportScheduleOut,
    status_code=201,
    tags=["Report Schedules"],
    summary="Create a report schedule",
    description="Create a custom report schedule for a project with configurable cron-like timing.",
)
async def create_report_schedule(payload: ReportScheduleCreate, user: dict = Depends(require_auth)):
    """Create a custom report schedule for a project."""
    entry = payload.model_dump()
    _report_schedules.setdefault(payload.project_id, []).append(entry)
    logger.info(f"Created report schedule for project {payload.project_id}: {entry}")
    return ReportScheduleOut(**entry)


@v1_router.get(
    "/report-schedules",
    response_model=list[ReportScheduleOut],
    tags=["Report Schedules"],
    summary="List report schedules",
    description="List all custom report schedules for a project.",
)
async def list_report_schedules(project_id: int = Query(...), user: dict = Depends(require_auth)):
    """List custom report schedules for a project."""
    entries = _report_schedules.get(project_id, [])
    return [ReportScheduleOut(**e) for e in entries]


@v1_router.delete(
    "/report-schedules/{project_id}",
    status_code=204,
    tags=["Report Schedules"],
    summary="Delete report schedules",
    description="Delete all custom report schedules for a project.",
)
async def delete_report_schedules(project_id: int, user: dict = Depends(require_auth)):
    """Delete all custom report schedules for a project."""
    _report_schedules.pop(project_id, None)


app.include_router(v1_router)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _workflow_to_out(w: Workflow) -> WorkflowOut:
    return WorkflowOut(
        id=w.id,
        project_id=w.project_id,
        name=w.name,
        trigger_json=w.trigger_json,
        actions_json=w.actions_json,
        status=w.status.value if hasattr(w.status, "value") else str(w.status),
        executions=w.executions,
        created_at=w.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Trigger evaluation engine
# ---------------------------------------------------------------------------


def _evaluate_trigger(trigger: dict, mention_data: dict) -> bool:
    """
    Evaluate a single trigger condition against mention data.

    Supported trigger types:
      - negative_influencer: negative sentiment AND author_followers >= min_followers
      - keyword_match: mention text or matched_keywords contains the keyword
      - sentiment_below: sentiment_score < score
      - sentiment_above: sentiment_score > score
      - platform_match: mention is from a specific platform
      - high_engagement: likes + shares + comments >= threshold
    """
    trigger_type = trigger.get("type", "")

    if trigger_type == "negative_influencer":
        min_followers = int(trigger.get("min_followers", 10000))
        sentiment = mention_data.get("sentiment", "neutral")
        followers = int(mention_data.get("author_followers", 0))
        return sentiment == "negative" and followers >= min_followers

    elif trigger_type == "keyword_match":
        keyword = trigger.get("keyword", "").lower()
        if not keyword:
            return False
        text = mention_data.get("text", "").lower()
        matched = mention_data.get("matched_keywords", "").lower()
        return keyword in text or keyword in matched

    elif trigger_type == "sentiment_below":
        threshold = float(trigger.get("score", -0.5))
        score = float(mention_data.get("sentiment_score", 0.0))
        return score < threshold

    elif trigger_type == "sentiment_above":
        threshold = float(trigger.get("score", 0.5))
        score = float(mention_data.get("sentiment_score", 0.0))
        return score > threshold

    elif trigger_type == "platform_match":
        platform = trigger.get("platform", "").lower()
        mention_platform = mention_data.get("platform", "").lower()
        return platform == mention_platform

    elif trigger_type == "high_engagement":
        threshold = int(trigger.get("threshold", 1000))
        likes = int(mention_data.get("likes", 0))
        shares = int(mention_data.get("shares", 0))
        comments = int(mention_data.get("comments", 0))
        return (likes + shares + comments) >= threshold

    else:
        logger.warning(f"Unknown trigger type: {trigger_type}")
        return False


def _evaluate_triggers(trigger_json_str: str, mention_data: dict) -> bool:
    """
    Parse trigger_json and evaluate conditions.
    Supports a single trigger dict or a list of triggers (all must match = AND logic).
    """
    try:
        parsed = json.loads(trigger_json_str)
    except (json.JSONDecodeError, TypeError):
        return False

    if isinstance(parsed, dict):
        return _evaluate_trigger(parsed, mention_data)
    elif isinstance(parsed, list):
        if not parsed:
            return False
        return all(_evaluate_trigger(t, mention_data) for t in parsed)
    return False


# ---------------------------------------------------------------------------
# Action execution engine
# ---------------------------------------------------------------------------


async def _execute_action(
    action: dict,
    mention_data: dict,
    workflow: Workflow,
    session_factory,
):
    """
    Execute a single workflow action.

    Supported actions:
      - notify_slack: POST to webhook_url with mention details
      - notify_email: log email notification (SMTP stub)
      - flag_mention: mark the mention as flagged in the DB
      - auto_reply: log auto-reply intent (publishing service integration)
      - escalate: POST to escalation webhook or log for supervisor
    """
    action_type = action.get("type", "")
    mention_text = mention_data.get("text", "")[:200]
    author = mention_data.get("author_name", mention_data.get("author_handle", "Unknown"))
    project_id = int(mention_data.get("project_id", 0))

    if action_type == "notify_slack":
        webhook_url = action.get("webhook_url", "")
        if webhook_url:
            try:
                validate_url(webhook_url)
            except ValueError as e:
                logger.warning(f"Blocked unsafe webhook URL: {webhook_url} — {e}")
                return
            try:

                async def _post_slack():
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(
                            webhook_url,
                            json={
                                "text": f"*Workflow Triggered: {workflow.name}*",
                                "blocks": [
                                    {
                                        "type": "header",
                                        "text": {
                                            "type": "plain_text",
                                            "text": f"Workflow: {workflow.name}",
                                        },
                                    },
                                    {
                                        "type": "section",
                                        "text": {
                                            "type": "mrkdwn",
                                            "text": (
                                                f"*Author:* {author}\n"
                                                f"*Platform:* {mention_data.get('platform', 'N/A')}\n"
                                                f"*Sentiment:* {mention_data.get('sentiment', 'N/A')} "
                                                f"({mention_data.get('sentiment_score', 'N/A')})\n"
                                                f"*Text:* {mention_text}"
                                            ),
                                        },
                                    },
                                ],
                            },
                        )

                await _action_breaker.call(_post_slack)
                logger.info(f"Slack notification sent for workflow {workflow.id}")
            except CircuitBreakerError:
                logger.warning(f"Workflow action circuit breaker open, skipping slack for workflow {workflow.id}")
            except Exception as e:
                logger.error(f"Slack notification failed for workflow {workflow.id}: {e}")
        else:
            logger.warning(f"notify_slack action has no webhook_url in workflow {workflow.id}")

    elif action_type == "notify_email":
        recipients = action.get("recipients", [])
        subject = action.get("subject", f"KhushFus Workflow Alert: {workflow.name}")
        logger.info(
            f"Email notification (stub) for workflow {workflow.id}: "
            f"to={recipients}, subject={subject}, mention by {author}"
        )
        # In production: integrate with SMTP / SendGrid / SES

    elif action_type == "flag_mention":
        source_id = mention_data.get("source_id", "")
        platform = mention_data.get("platform", "")
        if source_id and platform:
            try:
                async with session_factory() as db:
                    stmt = (
                        update(Mention)
                        .where(
                            Mention.project_id == project_id,
                            Mention.source_id == source_id,
                            Mention.platform == platform,
                        )
                        .values(is_flagged=True)
                    )
                    await db.execute(stmt)
                    await db.commit()
                logger.info(f"Flagged mention source_id={source_id} for workflow {workflow.id}")
            except Exception as e:
                logger.error(f"Failed to flag mention: {e}")

    elif action_type == "auto_reply":
        reply_text = action.get("reply_text", "Thank you for your feedback.")
        logger.info(
            f"Auto-reply (stub) for workflow {workflow.id}: "
            f"reply_to={author} on {mention_data.get('platform')}, text='{reply_text}'"
        )
        # In production: publish a PublishRequestEvent to the publishing service

    elif action_type == "escalate":
        escalation_url = action.get("webhook_url", "")
        level = action.get("level", "manager")
        if escalation_url:
            try:
                validate_url(escalation_url)
            except ValueError as e:
                logger.warning(f"Blocked unsafe webhook URL: {escalation_url} — {e}")
                return
            try:

                async def _post_escalation():
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(
                            escalation_url,
                            json={
                                "workflow_id": workflow.id,
                                "workflow_name": workflow.name,
                                "escalation_level": level,
                                "project_id": project_id,
                                "author": author,
                                "sentiment": mention_data.get("sentiment"),
                                "sentiment_score": mention_data.get("sentiment_score"),
                                "text": mention_text,
                                "timestamp": datetime.utcnow().isoformat(),
                            },
                        )

                await _action_breaker.call(_post_escalation)
                logger.info(f"Escalation sent for workflow {workflow.id} to level={level}")
            except CircuitBreakerError:
                logger.warning(f"Workflow action circuit breaker open, skipping escalation for workflow {workflow.id}")
            except Exception as e:
                logger.error(f"Escalation failed for workflow {workflow.id}: {e}")
        else:
            logger.info(
                f"Escalation (logged) for workflow {workflow.id}: level={level}, project={project_id}, author={author}"
            )

    else:
        logger.warning(f"Unknown action type '{action_type}' in workflow {workflow.id}")


async def _execute_workflow_actions(
    workflow: Workflow,
    mention_data: dict,
    session_factory,
    bus: EventBus,
):
    """Execute all actions for a triggered workflow and update execution count."""
    try:
        actions = json.loads(workflow.actions_json)
    except (json.JSONDecodeError, TypeError):
        logger.error(f"Invalid actions_json in workflow {workflow.id}")
        return

    if not isinstance(actions, list):
        actions = [actions]

    for action in actions:
        try:
            await _execute_action(action, mention_data, workflow, session_factory)
        except Exception as e:
            logger.error(f"Action '{action.get('type')}' failed in workflow {workflow.id}: {e}")

    # Increment execution counter
    try:
        async with session_factory() as db:
            stmt = update(Workflow).where(Workflow.id == workflow.id).values(executions=Workflow.executions + 1)
            await db.execute(stmt)
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to increment execution count for workflow {workflow.id}: {e}")

    _last_trigger_times[workflow.id] = datetime.utcnow()

    # Emit a WorkflowTriggerEvent for audit / downstream consumers
    try:
        await bus.publish(
            STREAM_WORKFLOW,
            WorkflowTriggerEvent(
                workflow_id=workflow.id,
                project_id=int(mention_data.get("project_id", 0)),
                mention_id=0,  # source_id based; mention_id may not be available yet
                trigger_data=json.dumps(
                    {
                        "source_id": mention_data.get("source_id"),
                        "author": mention_data.get("author_handle"),
                        "sentiment": mention_data.get("sentiment"),
                    }
                ),
            ),
        )
    except Exception as e:
        logger.warning(f"Failed to publish WorkflowTriggerEvent: {e}")


# ---------------------------------------------------------------------------
# Background consumer: listen for analyzed mentions and evaluate workflows
# ---------------------------------------------------------------------------


async def mention_consumer_loop(bus: EventBus, session_factory, shutdown_event: asyncio.Event):
    """
    Continuously consume from STREAM_ANALYZED_MENTIONS.
    For each mention, load active workflows for its project and evaluate triggers.
    """
    await bus.ensure_group(STREAM_ANALYZED_MENTIONS, GROUP_NAME)
    logger.info("Workflow consumer listening on STREAM_ANALYZED_MENTIONS...")

    while not shutdown_event.is_set():
        try:
            messages = await bus.consume(
                STREAM_ANALYZED_MENTIONS,
                GROUP_NAME,
                CONSUMER_NAME,
                count=20,
                block_ms=3000,
            )

            for msg_id, mention_data in messages:
                project_id = int(mention_data.get("project_id", 0))
                if not project_id:
                    await bus.ack(STREAM_ANALYZED_MENTIONS, GROUP_NAME, msg_id)
                    continue

                try:
                    # Load all active workflows for this project
                    async with session_factory() as db:
                        result = await db.execute(
                            select(Workflow).where(
                                Workflow.project_id == project_id,
                                Workflow.status == WorkflowStatus.ACTIVE,
                            )
                        )
                        workflows = result.scalars().all()

                    for wf in workflows:
                        if _evaluate_triggers(wf.trigger_json, mention_data):
                            logger.info(
                                f"Workflow '{wf.name}' (id={wf.id}) triggered by mention "
                                f"source_id={mention_data.get('source_id')}"
                            )
                            await _execute_workflow_actions(wf, mention_data, session_factory, bus)

                except Exception as e:
                    logger.error(f"Error evaluating workflows for project {project_id}: {e}")
                finally:
                    await bus.ack(STREAM_ANALYZED_MENTIONS, GROUP_NAME, msg_id)

        except asyncio.CancelledError:
            logger.info("Mention consumer loop cancelled, shutting down")
            break
        except Exception as e:
            logger.error(f"Mention consumer loop error: {e}")
            await asyncio.sleep(2)


# ---------------------------------------------------------------------------
# Background scheduler: custom report schedules
# ---------------------------------------------------------------------------


async def report_scheduler_loop(bus: EventBus, session_factory, shutdown_event: asyncio.Event):
    """
    Periodically check custom report schedules and trigger report generation.
    Also handles the default daily/weekly/monthly schedules for all active projects.
    Runs every 5 minutes.
    """
    logger.info("Report scheduler started")

    while not shutdown_event.is_set():
        try:
            now = datetime.utcnow()

            # --- Default schedules (all active projects) ---
            default_tasks: list[str] = []
            if now.hour == 6 and now.minute < 5:
                default_tasks.append("daily")
            if now.hour == 7 and now.minute < 5 and now.weekday() == 0:
                default_tasks.append("weekly")
            if now.hour == 8 and now.minute < 5 and now.day == 1:
                default_tasks.append("monthly")

            if default_tasks:
                async with session_factory() as db:
                    result = await db.execute(select(Project.id).where(Project.status == ProjectStatus.ACTIVE))
                    project_ids = [r[0] for r in result]

                for report_type in default_tasks:
                    for pid in project_ids:
                        try:
                            await bus.publish(
                                STREAM_REPORT_REQUESTS,
                                ReportRequestEvent(
                                    project_id=pid,
                                    report_type=report_type,
                                    requested_by="scheduler-service",
                                ),
                            )
                            logger.info(f"Scheduled {report_type} report request for project {pid}")
                        except Exception as e:
                            logger.error(f"Failed to schedule {report_type} report for project {pid}: {e}")

            # --- Custom schedules ---
            for project_id, schedules in _report_schedules.items():
                for sched in schedules:
                    if not sched.get("is_active", True):
                        continue

                    cron_hours = sched.get("cron_hours", 6)
                    cron_weekday = sched.get("cron_weekday")
                    cron_monthday = sched.get("cron_monthday")

                    # Check if current time matches the schedule
                    if now.hour != cron_hours or now.minute >= 5:
                        continue
                    if cron_weekday is not None and now.weekday() != cron_weekday:
                        continue
                    if cron_monthday is not None and now.day != cron_monthday:
                        continue

                    report_type = sched.get("report_type", "custom")
                    try:
                        await bus.publish(
                            STREAM_REPORT_REQUESTS,
                            ReportRequestEvent(
                                project_id=project_id,
                                report_type=report_type,
                                requested_by="scheduler-service-custom",
                            ),
                        )
                        logger.info(f"Custom scheduled {report_type} report for project {project_id}")
                    except Exception as e:
                        logger.error(f"Custom schedule report failed for project {project_id}: {e}")

            await asyncio.sleep(300)  # check every 5 minutes

        except asyncio.CancelledError:
            logger.info("Report scheduler cancelled, shutting down")
            break
        except Exception as e:
            logger.error(f"Report scheduler error: {e}")
            await asyncio.sleep(60)
