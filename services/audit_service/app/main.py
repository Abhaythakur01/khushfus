"""
Audit/Compliance Service — audit logging, data retention, and GDPR compliance.

Responsibilities:
1. Background consumer: listens to STREAM_AUDIT ('audit:log'), stores AuditLog records
2. REST endpoints for querying audit logs with filters and pagination
3. Summary statistics (actions per user, per type, activity timeline)
4. Data retention policy management per organization
5. GDPR compliance: data export and right-to-be-forgotten purge

Port: 8018
Consumer group: audit-service
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from jose import jwt as jose_jwt
from pydantic import BaseModel
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Text,
    delete,
    func,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from shared.cors import get_cors_origins
from shared.database import create_db, init_tables
from shared.events import STREAM_AUDIT, EventBus
from shared.logging_config import setup_logging
from shared.models import (
    AuditLog,
    Base,
    Mention,
    OrgMember,
    Project,
    Report,
    User,
)
from shared.service_utils import ConsumerMetrics
from shared.tracing import setup_tracing

setup_tracing("audit")
setup_logging("audit-service")
logger = logging.getLogger(__name__)

metrics = ConsumerMetrics("audit-service")

# ---------------------------------------------------------------------------
# JWT Authentication
# ---------------------------------------------------------------------------

_security = HTTPBearer(auto_error=False)
_JWT_SECRET = os.getenv("JWT_SECRET_KEY", "dev-secret-change-in-production")

# Enforce a real secret in production
if os.getenv("ENVIRONMENT") == "production" and _JWT_SECRET in ("", "dev-secret-change-in-production"):
    import sys
    print("FATAL: JWT_SECRET_KEY must be set to a secure value in production", file=sys.stderr)
    sys.exit(1)
_JWT_ALGO = "HS256"


async def require_auth(cred: HTTPAuthorizationCredentials | None = Depends(_security)) -> dict:
    if not cred:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = jose_jwt.decode(cred.credentials, _JWT_SECRET, algorithms=[_JWT_ALGO])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_admin(user: dict = Depends(require_auth)) -> dict:
    role = user.get("role", "")
    if role not in ("admin", "superadmin") and not user.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
RETENTION_CHECK_INTERVAL = int(os.getenv("RETENTION_CHECK_INTERVAL_SECONDS", str(24 * 60 * 60)))  # default: daily
DEFAULT_RETENTION_DAYS = int(os.getenv("DEFAULT_RETENTION_DAYS", "90"))

GROUP_NAME = "audit-service"
CONSUMER_NAME = f"audit-{os.getpid()}"


# ============================================================
# Retention Policy Model (stored in its own table)
# ============================================================


class RetentionPolicy(Base):
    __tablename__ = "retention_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"), unique=True, index=True)
    mentions_retention_days: Mapped[int] = mapped_column(Integer, default=365)
    audit_logs_retention_days: Mapped[int] = mapped_column(Integer, default=730)
    reports_retention_days: Mapped[int] = mapped_column(Integer, default=365)
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ============================================================
# Pydantic Schemas
# ============================================================


class AuditLogOut(BaseModel):
    id: int
    organization_id: int
    user_id: int | None
    action: str
    resource_type: str
    resource_id: int | None
    details_json: str | None
    ip_address: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class AuditLogListOut(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int


class AuditSummaryOut(BaseModel):
    actions_per_user: dict[str, int]
    actions_per_type: dict[str, int]
    activity_timeline: list[dict]
    total_actions: int


class RetentionPolicyCreate(BaseModel):
    organization_id: int
    mentions_retention_days: int = 365
    audit_logs_retention_days: int = 730
    reports_retention_days: int = 365
    config_json: str = "{}"


class RetentionPolicyOut(BaseModel):
    id: int
    organization_id: int
    mentions_retention_days: int
    audit_logs_retention_days: int
    reports_retention_days: int
    config_json: str
    updated_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class RetentionExecuteOut(BaseModel):
    organization_id: int
    mentions_deleted: int
    audit_logs_deleted: int
    reports_deleted: int


class GDPRExportOut(BaseModel):
    organization_id: int
    user_email: str
    user_data: dict
    memberships: list[dict]
    audit_logs: list[dict]
    exported_at: str


class GDPRPurgeOut(BaseModel):
    organization_id: int
    user_email: str
    records_purged: dict
    purged_at: str


# ============================================================
# Background Consumer
# ============================================================


async def audit_consumer(bus: EventBus, session_factory, shutdown_event: asyncio.Event):
    """Consume audit events from STREAM_AUDIT and persist them."""
    await bus.ensure_group(STREAM_AUDIT, GROUP_NAME)
    logger.info("Audit consumer listening on '%s'...", STREAM_AUDIT)

    while not shutdown_event.is_set():
        try:
            messages = await bus.consume(
                STREAM_AUDIT,
                GROUP_NAME,
                CONSUMER_NAME,
                count=50,
                block_ms=3000,
            )
            for msg_id, data in messages:
                try:
                    log = AuditLog(
                        organization_id=int(data.get("organization_id", 0)),
                        user_id=int(data.get("user_id", 0)) or None,
                        action=data.get("action", ""),
                        resource_type=data.get("resource_type", ""),
                        resource_id=int(data.get("resource_id", 0)) or None,
                        details_json=data.get("details", ""),
                        ip_address=data.get("ip_address", ""),
                    )
                    async with session_factory() as db:
                        db.add(log)
                        await db.commit()
                    metrics.record_processed()
                except Exception as e:
                    metrics.record_failed()
                    logger.error("Failed to store audit log %s: %s", msg_id, e)
                finally:
                    await bus.ack(STREAM_AUDIT, GROUP_NAME, msg_id)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Audit consumer error: %s", e)
            await asyncio.sleep(1)


# ============================================================
# Retention Enforcement
# ============================================================


class RetentionEnforcementOut(BaseModel):
    organizations_processed: int
    total_audit_logs_deleted: int
    total_mentions_deleted: int
    total_reports_deleted: int
    details: list[dict]


async def enforce_retention_cleanup(session_factory) -> dict:
    """Delete audit logs (and related records) older than each org's retention policy.

    Organizations without an explicit policy use DEFAULT_RETENTION_DAYS for audit logs.
    Returns a summary dict of what was purged.
    """
    summary: dict = {
        "organizations_processed": 0,
        "total_audit_logs_deleted": 0,
        "total_mentions_deleted": 0,
        "total_reports_deleted": 0,
        "details": [],
    }
    now = datetime.utcnow()

    async with session_factory() as db:
        # Fetch all retention policies
        result = await db.execute(select(RetentionPolicy))
        policies = result.scalars().all()

        for policy in policies:
            org_id = policy.organization_id
            org_detail: dict = {
                "organization_id": org_id, "audit_logs_deleted": 0,
                "mentions_deleted": 0, "reports_deleted": 0,
            }

            # Delete old audit logs
            audit_cutoff = now - timedelta(days=policy.audit_logs_retention_days)
            del_audit = delete(AuditLog).where(
                AuditLog.organization_id == org_id,
                AuditLog.created_at < audit_cutoff,
            )
            audit_result = await db.execute(del_audit)
            org_detail["audit_logs_deleted"] = audit_result.rowcount

            # Delete old mentions and reports via project IDs
            project_q = select(Project.id).where(Project.organization_id == org_id)
            project_result = await db.execute(project_q)
            project_ids = [r[0] for r in project_result]

            if project_ids:
                mention_cutoff = now - timedelta(days=policy.mentions_retention_days)
                del_mentions = delete(Mention).where(
                    Mention.project_id.in_(project_ids),
                    Mention.collected_at < mention_cutoff,
                )
                mention_result = await db.execute(del_mentions)
                org_detail["mentions_deleted"] = mention_result.rowcount

                report_cutoff = now - timedelta(days=policy.reports_retention_days)
                del_reports = delete(Report).where(
                    Report.project_id.in_(project_ids),
                    Report.created_at < report_cutoff,
                )
                report_result = await db.execute(del_reports)
                org_detail["reports_deleted"] = report_result.rowcount

            summary["organizations_processed"] += 1
            summary["total_audit_logs_deleted"] += org_detail["audit_logs_deleted"]
            summary["total_mentions_deleted"] += org_detail["mentions_deleted"]
            summary["total_reports_deleted"] += org_detail["reports_deleted"]
            summary["details"].append(org_detail)

        # For orgs without a policy, apply default retention to audit logs only
        policy_org_ids_q = select(RetentionPolicy.organization_id)
        policy_org_ids_result = await db.execute(policy_org_ids_q)
        policy_org_ids = {r[0] for r in policy_org_ids_result}

        default_cutoff = now - timedelta(days=DEFAULT_RETENTION_DAYS)
        if policy_org_ids:
            del_default = delete(AuditLog).where(
                AuditLog.organization_id.notin_(policy_org_ids),
                AuditLog.created_at < default_cutoff,
            )
        else:
            del_default = delete(AuditLog).where(
                AuditLog.created_at < default_cutoff,
            )
        default_result = await db.execute(del_default)
        default_deleted = default_result.rowcount
        if default_deleted > 0:
            summary["total_audit_logs_deleted"] += default_deleted
            summary["details"].append({
                "organization_id": None,
                "note": "default retention policy applied",
                "audit_logs_deleted": default_deleted,
            })

        await db.commit()

    logger.info(
        "Retention enforcement complete: orgs=%d, audit_logs=%d, mentions=%d, reports=%d",
        summary["organizations_processed"],
        summary["total_audit_logs_deleted"],
        summary["total_mentions_deleted"],
        summary["total_reports_deleted"],
    )
    return summary


async def retention_enforcement_loop(session_factory, shutdown_event: asyncio.Event):
    """Background loop that enforces retention on a configurable interval."""
    logger.info(
        "Retention enforcement loop started (interval=%ds, default_days=%d)",
        RETENTION_CHECK_INTERVAL, DEFAULT_RETENTION_DAYS,
    )
    while not shutdown_event.is_set():
        try:
            await enforce_retention_cleanup(session_factory)
            await asyncio.sleep(RETENTION_CHECK_INTERVAL)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Retention enforcement error: %s", e)
            await asyncio.sleep(60)


# ============================================================
# FastAPI Application
# ============================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine, session_factory = create_db(DATABASE_URL)
    bus = EventBus(REDIS_URL)
    await bus.connect()
    await init_tables(engine)

    app.state.db_session = session_factory
    app.state.event_bus = bus

    shutdown_event = asyncio.Event()
    app.state.shutdown_event = shutdown_event

    # Start background consumer
    consumer_task = asyncio.create_task(audit_consumer(bus, session_factory, shutdown_event))
    retention_task = asyncio.create_task(retention_enforcement_loop(session_factory, shutdown_event))

    yield

    shutdown_event.set()
    retention_task.cancel()
    consumer_task.cancel()
    for task in (consumer_task, retention_task):
        try:
            await task
        except asyncio.CancelledError:
            pass
    await bus.close()
    await engine.dispose()


app = FastAPI(
    title="KhushFus Audit/Compliance Service",
    description="Audit logging, data retention policies, and GDPR compliance",
    version="0.1.0",
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "Audit Logs", "description": "Query and retrieve audit log entries."},
        {"name": "Data Retention", "description": "Configure and execute data retention policies."},
        {"name": "GDPR", "description": "GDPR compliance: data export and right-to-be-forgotten."},
        {"name": "Health", "description": "Service health check."},
    ],
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass

v1_router = APIRouter(prefix="/api/v1")


async def get_db():
    """FastAPI dependency for database sessions."""
    async with app.state.db_session() as session:
        yield session


# ============================================================
# Health
# ============================================================


@app.get(
    "/health",
    tags=["Health"],
    summary="Audit health check",
    description="Returns the health status of the Audit/Compliance service and its dependencies.",
)
async def health():
    from shared.health import build_health_response, check_postgres, check_redis

    checks = {
        "postgres": await check_postgres(database_url=DATABASE_URL),
        "redis": await check_redis(REDIS_URL),
    }
    return await build_health_response("audit-service", checks=checks)


# ============================================================
# Audit Log Endpoints
# ============================================================


@v1_router.get(
    "/audit-logs",
    response_model=AuditLogListOut,
    tags=["Audit Logs"],
    summary="List audit logs",
    description="List audit logs with optional filters for user, action, resource type, and date range.",
)
async def list_audit_logs(
    org_id: int = Query(..., description="Organization ID"),
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """List audit logs for an organization with optional filters and pagination."""
    conditions = [AuditLog.organization_id == org_id]
    if user_id is not None:
        conditions.append(AuditLog.user_id == user_id)
    if action:
        conditions.append(AuditLog.action == action)
    if resource_type:
        conditions.append(AuditLog.resource_type == resource_type)
    if date_from:
        conditions.append(AuditLog.created_at >= date_from)
    if date_to:
        conditions.append(AuditLog.created_at <= date_to)

    # Total count
    total_q = select(func.count(AuditLog.id)).where(*conditions)
    total = (await db.execute(total_q)).scalar() or 0

    # Paginated results
    offset = (page - 1) * page_size
    items_q = select(AuditLog).where(*conditions).order_by(AuditLog.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(items_q)
    items = result.scalars().all()

    return AuditLogListOut(
        items=[AuditLogOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@v1_router.get(
    "/audit-logs/summary",
    response_model=AuditSummaryOut,
    tags=["Audit Logs"],
    summary="Audit summary statistics",
    description="Get summary statistics including actions per user, actions per type, and daily activity timeline.",
)
async def audit_summary(
    org_id: int = Query(..., description="Organization ID"),
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Summary statistics: actions per user, per type, and activity timeline."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    base_conditions = [
        AuditLog.organization_id == org_id,
        AuditLog.created_at >= cutoff,
    ]

    # Actions per user
    user_q = (
        select(AuditLog.user_id, func.count(AuditLog.id).label("cnt"))
        .where(*base_conditions)
        .group_by(AuditLog.user_id)
        .order_by(func.count(AuditLog.id).desc())
    )
    user_result = await db.execute(user_q)
    actions_per_user = {str(r.user_id or "system"): r.cnt for r in user_result}

    # Actions per type
    type_q = (
        select(AuditLog.action, func.count(AuditLog.id).label("cnt"))
        .where(*base_conditions)
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
    )
    type_result = await db.execute(type_q)
    actions_per_type = {r.action: r.cnt for r in type_result}

    # Activity timeline (group by date)
    timeline_q = (
        select(
            func.date_trunc("day", AuditLog.created_at).label("day"),
            func.count(AuditLog.id).label("cnt"),
        )
        .where(*base_conditions)
        .group_by(func.date_trunc("day", AuditLog.created_at))
        .order_by(func.date_trunc("day", AuditLog.created_at))
    )
    timeline_result = await db.execute(timeline_q)
    activity_timeline = [{"date": r.day.isoformat() if r.day else "", "count": r.cnt} for r in timeline_result]

    # Total
    total = (await db.execute(select(func.count(AuditLog.id)).where(*base_conditions))).scalar() or 0

    return AuditSummaryOut(
        actions_per_user=actions_per_user,
        actions_per_type=actions_per_type,
        activity_timeline=activity_timeline,
        total_actions=total,
    )


@v1_router.get(
    "/audit-logs/{log_id}",
    response_model=AuditLogOut,
    tags=["Audit Logs"],
    summary="Get audit log by ID",
    description="Retrieve a single audit log entry by its unique identifier.",
)
async def get_audit_log(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Retrieve a single audit log entry by ID."""
    log = await db.get(AuditLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return AuditLogOut.model_validate(log)


# ============================================================
# Data Retention Endpoints
# ============================================================


@v1_router.post(
    "/data-retention",
    response_model=RetentionPolicyOut,
    tags=["Data Retention"],
    summary="Configure retention policy",
    description="Create or update a retention policy specifying periods for mentions, audit logs, and reports.",
)
async def configure_retention(
    payload: RetentionPolicyCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """Create or update a data retention policy for an organization."""
    result = await db.execute(select(RetentionPolicy).where(RetentionPolicy.organization_id == payload.organization_id))
    policy = result.scalar_one_or_none()

    if policy:
        policy.mentions_retention_days = payload.mentions_retention_days
        policy.audit_logs_retention_days = payload.audit_logs_retention_days
        policy.reports_retention_days = payload.reports_retention_days
        policy.config_json = payload.config_json
    else:
        policy = RetentionPolicy(
            organization_id=payload.organization_id,
            mentions_retention_days=payload.mentions_retention_days,
            audit_logs_retention_days=payload.audit_logs_retention_days,
            reports_retention_days=payload.reports_retention_days,
            config_json=payload.config_json,
        )
        db.add(policy)

    await db.commit()
    await db.refresh(policy)
    return RetentionPolicyOut.model_validate(policy)


@v1_router.get(
    "/data-retention",
    response_model=RetentionPolicyOut,
    tags=["Data Retention"],
    summary="Get retention policy",
    description="Get the current data retention policy for an organization.",
)
async def get_retention(
    org_id: int = Query(..., description="Organization ID"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth),
):
    """Get the current data retention policy for an organization."""
    result = await db.execute(select(RetentionPolicy).where(RetentionPolicy.organization_id == org_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(
            status_code=404,
            detail="No retention policy configured for this organization",
        )
    return RetentionPolicyOut.model_validate(policy)


@v1_router.post(
    "/data-retention/execute",
    response_model=RetentionExecuteOut,
    tags=["Data Retention"],
    summary="Execute retention cleanup",
    description="Delete old mentions, audit logs, and reports per the organization's retention policy.",
)
async def execute_retention(
    org_id: int = Query(..., description="Organization ID"),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_admin),
):
    """Execute data retention cleanup: delete old data according to the org's policy."""
    result = await db.execute(select(RetentionPolicy).where(RetentionPolicy.organization_id == org_id))
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(
            status_code=404,
            detail="No retention policy configured for this organization",
        )

    now = datetime.utcnow()

    # Get project IDs belonging to this organization
    project_q = select(Project.id).where(Project.organization_id == org_id)
    project_result = await db.execute(project_q)
    project_ids = [r[0] for r in project_result]

    mentions_deleted = 0
    audit_deleted = 0
    reports_deleted = 0

    if project_ids:
        # Delete old mentions
        mention_cutoff = now - timedelta(days=policy.mentions_retention_days)
        del_mentions = delete(Mention).where(
            Mention.project_id.in_(project_ids),
            Mention.collected_at < mention_cutoff,
        )
        mention_result = await db.execute(del_mentions)
        mentions_deleted = mention_result.rowcount

        # Delete old reports
        report_cutoff = now - timedelta(days=policy.reports_retention_days)
        del_reports = delete(Report).where(
            Report.project_id.in_(project_ids),
            Report.created_at < report_cutoff,
        )
        report_result = await db.execute(del_reports)
        reports_deleted = report_result.rowcount

    # Delete old audit logs
    audit_cutoff = now - timedelta(days=policy.audit_logs_retention_days)
    del_audit = delete(AuditLog).where(
        AuditLog.organization_id == org_id,
        AuditLog.created_at < audit_cutoff,
    )
    audit_result = await db.execute(del_audit)
    audit_deleted = audit_result.rowcount

    await db.commit()

    logger.info(
        "Retention cleanup org=%d: mentions=%d, audit=%d, reports=%d",
        org_id,
        mentions_deleted,
        audit_deleted,
        reports_deleted,
    )

    return RetentionExecuteOut(
        organization_id=org_id,
        mentions_deleted=mentions_deleted,
        audit_logs_deleted=audit_deleted,
        reports_deleted=reports_deleted,
    )


# ============================================================
# GDPR Compliance Endpoints
# ============================================================


@v1_router.get(
    "/compliance/export",
    response_model=GDPRExportOut,
    tags=["GDPR"],
    summary="GDPR data export",
    description="Export all data associated with a user within an organization for GDPR data portability compliance.",
)
async def gdpr_export(
    org_id: int = Query(..., description="Organization ID"),
    user_email: str = Query(..., description="User email address"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_auth),
):
    """GDPR data export: returns all data associated with a user within an organization."""
    # Find the target user
    user_result = await db.execute(select(User).where(User.email == user_email))
    target_user = user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify membership in org
    membership_result = await db.execute(
        select(OrgMember).where(
            OrgMember.organization_id == org_id,
            OrgMember.user_id == target_user.id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=404,
            detail="User is not a member of this organization",
        )

    # Collect user profile data
    user_data = {
        "id": target_user.id,
        "email": target_user.email,
        "full_name": target_user.full_name,
        "avatar_url": target_user.avatar_url,
        "is_active": target_user.is_active,
        "last_login_at": target_user.last_login_at.isoformat() if target_user.last_login_at else None,
        "created_at": target_user.created_at.isoformat() if target_user.created_at else None,
    }

    # All memberships across orgs
    memberships_result = await db.execute(select(OrgMember).where(OrgMember.user_id == target_user.id))
    memberships = [
        {
            "organization_id": m.organization_id,
            "role": m.role.value if hasattr(m.role, "value") else str(m.role),
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        }
        for m in memberships_result.scalars().all()
    ]

    # Audit logs for this user within the org
    audit_result = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.organization_id == org_id,
            AuditLog.user_id == target_user.id,
        )
        .order_by(AuditLog.created_at.desc())
        .limit(10000)
    )
    audit_logs = [
        {
            "id": a.id,
            "action": a.action,
            "resource_type": a.resource_type,
            "resource_id": a.resource_id,
            "details_json": a.details_json,
            "ip_address": a.ip_address,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in audit_result.scalars().all()
    ]

    return GDPRExportOut(
        organization_id=org_id,
        user_email=user_email,
        user_data=user_data,
        memberships=memberships,
        audit_logs=audit_logs,
        exported_at=datetime.utcnow().isoformat(),
    )


@v1_router.delete(
    "/compliance/purge",
    response_model=GDPRPurgeOut,
    tags=["GDPR"],
    summary="GDPR data purge",
    description="Right to be forgotten: anonymize and delete all user data for GDPR compliance.",
)
async def gdpr_purge(
    org_id: int = Query(..., description="Organization ID"),
    user_email: str = Query(..., description="User email address"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """GDPR right to be forgotten: anonymize/delete all user data within the org."""
    # Find the target user
    user_result = await db.execute(select(User).where(User.email == user_email))
    target_user = user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    records_purged = {}

    # Anonymize audit logs (set user_id to None, redact IP)
    audit_q = select(AuditLog).where(
        AuditLog.organization_id == org_id,
        AuditLog.user_id == target_user.id,
    )
    audit_result = await db.execute(audit_q)
    audit_logs = audit_result.scalars().all()
    for log in audit_logs:
        log.user_id = None
        log.ip_address = None
        log.details_json = json.dumps({"purged": True, "purged_at": datetime.utcnow().isoformat()})
    records_purged["audit_logs_anonymized"] = len(audit_logs)

    # Remove org membership
    del_membership = delete(OrgMember).where(
        OrgMember.organization_id == org_id,
        OrgMember.user_id == target_user.id,
    )
    mem_result = await db.execute(del_membership)
    records_purged["memberships_deleted"] = mem_result.rowcount

    # Check if user has any other org memberships remaining
    remaining = await db.execute(select(func.count(OrgMember.id)).where(OrgMember.user_id == target_user.id))
    remaining_count = remaining.scalar() or 0

    # If no other memberships, anonymize the user record itself
    if remaining_count == 0:
        target_user.email = f"deleted-{target_user.id}@purged.local"
        target_user.full_name = "Deleted User"
        target_user.avatar_url = None
        target_user.hashed_password = None
        target_user.sso_subject = None
        target_user.is_active = False
        records_purged["user_anonymized"] = True
    else:
        records_purged["user_anonymized"] = False
        records_purged["remaining_memberships"] = remaining_count

    await db.commit()

    logger.info(
        "GDPR purge completed: org=%d user=%s records=%s",
        org_id,
        user_email,
        records_purged,
    )

    return GDPRPurgeOut(
        organization_id=org_id,
        user_email=user_email,
        records_purged=records_purged,
        purged_at=datetime.utcnow().isoformat(),
    )


# ============================================================
# Admin: Manual Retention Enforcement
# ============================================================


@v1_router.post(
    "/admin/enforce-retention",
    response_model=RetentionEnforcementOut,
    tags=["Data Retention"],
    summary="Manually enforce retention cleanup",
    description="Trigger retention enforcement across all organizations. "
    "Deletes audit logs, mentions, and reports older than each org's configured retention policy. "
    "Organizations without an explicit policy use the default retention period.",
)
async def admin_enforce_retention(user: dict = Depends(require_admin)):
    """Manually trigger retention enforcement across all organizations."""
    result = await enforce_retention_cleanup(app.state.db_session)
    return RetentionEnforcementOut(**result)


app.include_router(v1_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8018)
