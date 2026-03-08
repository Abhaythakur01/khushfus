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

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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

from shared.database import create_db, init_tables
from shared.events import STREAM_AUDIT, EventBus
from shared.models import (
    AuditLog,
    Base,
    Mention,
    OrgMember,
    Project,
    Report,
    User,
)
from shared.tracing import setup_tracing

setup_tracing("audit")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

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


async def audit_consumer(bus: EventBus, session_factory):
    """Consume audit events from STREAM_AUDIT and persist them."""
    await bus.ensure_group(STREAM_AUDIT, GROUP_NAME)
    logger.info("Audit consumer listening on '%s'...", STREAM_AUDIT)

    while True:
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
                except Exception as e:
                    logger.error("Failed to store audit log %s: %s", msg_id, e)
                finally:
                    await bus.ack(STREAM_AUDIT, GROUP_NAME, msg_id)
        except Exception as e:
            logger.error("Audit consumer error: %s", e)
            await asyncio.sleep(1)


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

    # Start background consumer
    consumer_task = asyncio.create_task(audit_consumer(bus, session_factory))

    yield

    consumer_task.cancel()
    try:
        await consumer_task
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass


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


@app.get(
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


@app.get(
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


@app.get(
    "/audit-logs/{log_id}",
    response_model=AuditLogOut,
    tags=["Audit Logs"],
    summary="Get audit log by ID",
    description="Retrieve a single audit log entry by its unique identifier.",
)
async def get_audit_log(
    log_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a single audit log entry by ID."""
    log = await db.get(AuditLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    return AuditLogOut.model_validate(log)


# ============================================================
# Data Retention Endpoints
# ============================================================


@app.post(
    "/data-retention",
    response_model=RetentionPolicyOut,
    tags=["Data Retention"],
    summary="Configure retention policy",
    description="Create or update a retention policy specifying periods for mentions, audit logs, and reports.",
)
async def configure_retention(
    payload: RetentionPolicyCreate,
    db: AsyncSession = Depends(get_db),
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


@app.get(
    "/data-retention",
    response_model=RetentionPolicyOut,
    tags=["Data Retention"],
    summary="Get retention policy",
    description="Get the current data retention policy for an organization.",
)
async def get_retention(
    org_id: int = Query(..., description="Organization ID"),
    db: AsyncSession = Depends(get_db),
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


@app.post(
    "/data-retention/execute",
    response_model=RetentionExecuteOut,
    tags=["Data Retention"],
    summary="Execute retention cleanup",
    description="Delete old mentions, audit logs, and reports per the organization's retention policy.",
)
async def execute_retention(
    org_id: int = Query(..., description="Organization ID"),
    db: AsyncSession = Depends(get_db),
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


@app.get(
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
):
    """GDPR data export: returns all data associated with a user within an organization."""
    # Find the user
    user_result = await db.execute(select(User).where(User.email == user_email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify membership in org
    membership_result = await db.execute(
        select(OrgMember).where(
            OrgMember.organization_id == org_id,
            OrgMember.user_id == user.id,
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
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "is_active": user.is_active,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

    # All memberships across orgs
    memberships_result = await db.execute(select(OrgMember).where(OrgMember.user_id == user.id))
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
            AuditLog.user_id == user.id,
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


@app.delete(
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
):
    """GDPR right to be forgotten: anonymize/delete all user data within the org."""
    # Find the user
    user_result = await db.execute(select(User).where(User.email == user_email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    records_purged = {}

    # Anonymize audit logs (set user_id to None, redact IP)
    audit_q = select(AuditLog).where(
        AuditLog.organization_id == org_id,
        AuditLog.user_id == user.id,
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
        OrgMember.user_id == user.id,
    )
    mem_result = await db.execute(del_membership)
    records_purged["memberships_deleted"] = mem_result.rowcount

    # Check if user has any other org memberships remaining
    remaining = await db.execute(select(func.count(OrgMember.id)).where(OrgMember.user_id == user.id))
    remaining_count = remaining.scalar() or 0

    # If no other memberships, anonymize the user record itself
    if remaining_count == 0:
        user.email = f"deleted-{user.id}@purged.local"
        user.full_name = "Deleted User"
        user.avatar_url = None
        user.hashed_password = None
        user.sso_subject = None
        user.is_active = False
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8018)
