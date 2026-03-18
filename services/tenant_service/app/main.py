"""
Tenant Service -- organization management, members, API keys, plans, and quotas.

Responsibilities:
- Organization CRUD (create, update, get, list)
- Org member management: invite, remove, update role (OrgRole enum)
- API key generation and management (create, revoke, list)
- Plan/quota management: tracks mentions_used per org, enforces mention_quota
  and max_projects limits
- Usage statistics endpoint
- Publishes audit events for all org changes

Long-running FastAPI service on port 8011.
"""

import hashlib
import json
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import bcrypt
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.cors import get_cors_origins
from shared.database import create_db, init_tables
from shared.events import STREAM_AUDIT, AuditEvent, EventBus
from shared.internal_auth import verify_internal_token
from shared.models import (
    ApiKey,
    Organization,
    OrgMember,
    OrgRole,
    PlanTier,
    Project,
    User,
)
from shared.tracing import setup_tracing

setup_tracing("tenant")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
if not SECRET_KEY and os.getenv("ENVIRONMENT", "development") == "production":
    raise RuntimeError("FATAL: JWT_SECRET_KEY must be set in production")
if not SECRET_KEY:
    SECRET_KEY = "change-me-in-production"  # Dev-only default
ALGORITHM = "HS256"

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

# Plan defaults
PLAN_DEFAULTS: dict[str, dict] = {
    "free": {"mention_quota": 10_000, "max_projects": 3, "max_users": 5},
    "starter": {"mention_quota": 50_000, "max_projects": 10, "max_users": 15},
    "professional": {"mention_quota": 250_000, "max_projects": 50, "max_users": 50},
    "enterprise": {"mention_quota": 1_000_000, "max_projects": 500, "max_users": 500},
}

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class OrgCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    plan: str = "free"
    logo_url: str | None = None
    primary_color: str | None = None


class OrgUpdateRequest(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None
    sso_enabled: bool | None = None
    sso_provider: str | None = None
    sso_metadata_url: str | None = None
    sso_entity_id: str | None = None


class OrgOut(BaseModel):
    id: int
    name: str
    slug: str
    plan: str
    mention_quota: int
    mentions_used: int
    max_projects: int
    max_users: int
    sso_enabled: bool
    sso_provider: str | None
    logo_url: str | None
    primary_color: str | None
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class OrgListOut(BaseModel):
    items: list[OrgOut]
    total: int


class MemberInviteRequest(BaseModel):
    user_id: int
    role: str = "viewer"


class MemberUpdateRoleRequest(BaseModel):
    role: str


class MemberOut(BaseModel):
    id: int
    organization_id: int
    user_id: int
    role: str
    invited_by: int | None
    joined_at: datetime
    user_email: str | None = None
    user_name: str | None = None
    model_config = {"from_attributes": True}


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scopes: str = "read"
    rate_limit: int = 1000
    expires_in_days: int | None = None


class ApiKeyOut(BaseModel):
    id: int
    organization_id: int
    name: str
    prefix: str
    scopes: str
    rate_limit: int
    is_active: bool
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class ApiKeyCreatedOut(ApiKeyOut):
    """Returned only at creation time -- includes the raw key."""

    raw_key: str


class PlanUpdateRequest(BaseModel):
    plan: str
    mention_quota: int | None = None
    max_projects: int | None = None
    max_users: int | None = None


class UsageOut(BaseModel):
    organization_id: int
    name: str
    plan: str
    mention_quota: int
    mentions_used: int
    mentions_remaining: int
    mention_usage_pct: float
    max_projects: int
    projects_used: int
    max_users: int
    users_count: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _hash_api_key(raw_key: str) -> str:
    """Hash an API key with bcrypt for secure storage."""
    return bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt()).decode()


def _verify_api_key(raw_key: str, hashed: str) -> bool:
    """Verify a raw API key against its bcrypt hash."""
    try:
        return bcrypt.checkpw(raw_key.encode(), hashed.encode())
    except Exception:
        # Fall back to SHA256 check for keys created before bcrypt migration
        return hashlib.sha256(raw_key.encode()).hexdigest() == hashed


async def _audit(
    event_bus: EventBus,
    user_id: int,
    action: str,
    resource_type: str,
    resource_id: int = 0,
    details: str = "",
    ip: str = "",
    org_id: int = 0,
):
    try:
        await event_bus.publish(
            STREAM_AUDIT,
            AuditEvent(
                organization_id=org_id,
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                details=details,
                ip_address=ip,
            ),
        )
    except Exception as e:
        logger.warning(f"Failed to publish audit event: {e}")


async def _require_org_role(
    db: AsyncSession,
    user_id: int,
    org_id: int,
    min_roles: list[OrgRole],
) -> OrgMember:
    """Ensure user has one of the given roles in the org. Returns the membership."""
    result = await db.execute(
        select(OrgMember).where(
            OrgMember.user_id == user_id,
            OrgMember.organization_id == org_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    if member.role not in min_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Requires one of: {[r.value for r in min_roles]}; you have: {member.role.value}",
        )
    return member


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


async def get_db(request: Request) -> AsyncSession:
    async with request.app.state.db_session() as session:
        yield session


def get_event_bus(request: Request) -> EventBus:
    return request.app.state.event_bus


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


async def require_auth(user: User | None = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine, session_factory = create_db(DATABASE_URL)
    app.state.db_session = session_factory
    app.state.event_bus = EventBus(REDIS_URL)
    await init_tables(engine)
    await app.state.event_bus.connect()
    logger.info("Tenant Service started")
    yield
    await app.state.event_bus.close()
    await engine.dispose()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="KhushFus Tenant Service",
    description="Organization management, members, API keys, plans, and quotas",
    version="0.1.0",
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "Organizations", "description": "Organization CRUD operations."},
        {"name": "Members", "description": "Organization member management."},
        {"name": "API Keys", "description": "API key generation, listing, and revocation."},
        {"name": "Plans", "description": "Plan and quota management."},
        {"name": "Usage", "description": "Usage statistics and quota checks."},
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
    from shared.request_logging import RequestLoggingMiddleware

    app.add_middleware(RequestLoggingMiddleware, service_name="tenant")
except ImportError:
    logger.debug("RequestLoggingMiddleware not available")


try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass


@app.get(
    "/health",
    tags=["Health"],
    summary="Tenant health check",
    description="Returns the health status of the Tenant service and its dependencies.",
)
async def health():
    from shared.health import build_health_response, check_postgres, check_redis

    checks = {
        "postgres": await check_postgres(database_url=DATABASE_URL),
        "redis": await check_redis(REDIS_URL),
    }
    return await build_health_response("tenant", checks=checks)


# ===================================================================
# ORGANIZATION CRUD
# ===================================================================


@app.post(
    "/api/v1/orgs",
    response_model=OrgOut,
    status_code=201,
    tags=["Organizations"],
    summary="Create an organization",
    description="Create a new organization. The creating user becomes the owner with plan defaults applied.",
)
async def create_org(
    data: OrgCreateRequest,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Create a new organization. The creating user becomes the owner."""
    # Check slug uniqueness
    existing = await db.execute(select(Organization).where(Organization.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Organization slug already taken")

    plan_key = data.plan if data.plan in PLAN_DEFAULTS else "free"
    defaults = PLAN_DEFAULTS[plan_key]

    org = Organization(
        name=data.name,
        slug=data.slug,
        plan=PlanTier(plan_key),
        mention_quota=defaults["mention_quota"],
        max_projects=defaults["max_projects"],
        max_users=defaults["max_users"],
        mentions_used=0,
        logo_url=data.logo_url,
        primary_color=data.primary_color,
        is_active=True,
    )
    db.add(org)
    await db.flush()

    # Add creator as owner
    owner = OrgMember(
        organization_id=org.id,
        user_id=user.id,
        role=OrgRole.OWNER,
    )
    db.add(owner)
    await db.commit()
    await db.refresh(org)

    await _audit(
        bus,
        user.id,
        "org.create",
        "organization",
        org.id,
        details=json.dumps({"name": org.name, "slug": org.slug, "plan": plan_key}),
        ip=_client_ip(request),
        org_id=org.id,
    )
    return org


@app.get(
    "/api/v1/orgs",
    response_model=OrgListOut,
    tags=["Organizations"],
    summary="List organizations",
    description="List organizations the current user belongs to. Superadmins see all organizations.",
)
async def list_orgs(
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """List organizations the current user belongs to."""
    # Superadmins see all orgs
    if user.is_superadmin:
        count_q = select(func.count(Organization.id)).where(Organization.is_active.is_(True))
        total = (await db.execute(count_q)).scalar() or 0
        result = await db.execute(
            select(Organization)
            .where(Organization.is_active.is_(True))
            .order_by(Organization.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
    else:
        # Only orgs the user is a member of
        member_org_ids = select(OrgMember.organization_id).where(OrgMember.user_id == user.id)
        count_q = select(func.count(Organization.id)).where(
            Organization.id.in_(member_org_ids), Organization.is_active.is_(True)
        )
        total = (await db.execute(count_q)).scalar() or 0
        result = await db.execute(
            select(Organization)
            .where(Organization.id.in_(member_org_ids), Organization.is_active.is_(True))
            .order_by(Organization.created_at.desc())
            .offset(skip)
            .limit(limit)
        )

    orgs = result.scalars().all()
    return OrgListOut(items=orgs, total=total)


@app.get(
    "/api/v1/orgs/{org_id}",
    response_model=OrgOut,
    tags=["Organizations"],
    summary="Get organization details",
    description="Retrieve organization details. User must be a member or superadmin.",
)
async def get_org(
    org_id: int,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Get organization details. User must be a member (or superadmin)."""
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    if not user.is_superadmin:
        mem = await db.execute(
            select(OrgMember).where(OrgMember.user_id == user.id, OrgMember.organization_id == org_id)
        )
        if not mem.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a member of this organization")

    return org


@app.patch(
    "/api/v1/orgs/{org_id}",
    response_model=OrgOut,
    tags=["Organizations"],
    summary="Update organization",
    description="Update organization fields (name, logo, branding, SSO). Requires owner or admin.",
)
async def update_org(
    org_id: int,
    data: OrgUpdateRequest,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Update organization details. Requires owner or admin role."""
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    await _require_org_role(db, user.id, org_id, [OrgRole.OWNER, OrgRole.ADMIN])

    changes: dict = {}
    if data.name is not None:
        org.name = data.name
        changes["name"] = data.name
    if data.logo_url is not None:
        org.logo_url = data.logo_url
        changes["logo_url"] = data.logo_url
    if data.primary_color is not None:
        org.primary_color = data.primary_color
        changes["primary_color"] = data.primary_color
    if data.sso_enabled is not None:
        org.sso_enabled = data.sso_enabled
        changes["sso_enabled"] = data.sso_enabled
    if data.sso_provider is not None:
        if data.sso_provider not in ("saml", "oidc", ""):
            raise HTTPException(status_code=400, detail="sso_provider must be 'saml', 'oidc', or empty")
        org.sso_provider = data.sso_provider or None
        changes["sso_provider"] = data.sso_provider
    if data.sso_metadata_url is not None:
        org.sso_metadata_url = data.sso_metadata_url or None
        changes["sso_metadata_url"] = data.sso_metadata_url
    if data.sso_entity_id is not None:
        org.sso_entity_id = data.sso_entity_id or None
        changes["sso_entity_id"] = data.sso_entity_id

    await db.commit()
    await db.refresh(org)

    await _audit(
        bus,
        user.id,
        "org.update",
        "organization",
        org.id,
        details=json.dumps(changes),
        ip=_client_ip(request),
        org_id=org.id,
    )
    return org


# ===================================================================
# MEMBER MANAGEMENT
# ===================================================================


@app.get(
    "/api/v1/orgs/{org_id}/members",
    response_model=list[MemberOut],
    tags=["Members"],
    summary="List organization members",
    description="List all members of an organization. Any member of the organization can view the member list.",
)
async def list_members(
    org_id: int,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """List all members of an organization."""
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Any member can list other members
    await _require_org_role(
        db,
        user.id,
        org_id,
        [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MANAGER, OrgRole.ANALYST, OrgRole.VIEWER],
    )

    result = await db.execute(
        select(OrgMember, User)
        .join(User, OrgMember.user_id == User.id)
        .where(OrgMember.organization_id == org_id)
        .order_by(OrgMember.joined_at)
    )
    rows = result.all()
    members = []
    for mem, u in rows:
        members.append(
            MemberOut(
                id=mem.id,
                organization_id=mem.organization_id,
                user_id=mem.user_id,
                role=mem.role.value,
                invited_by=mem.invited_by,
                joined_at=mem.joined_at,
                user_email=u.email,
                user_name=u.full_name,
            )
        )
    return members


@app.post(
    "/api/v1/orgs/{org_id}/members",
    response_model=MemberOut,
    status_code=201,
    tags=["Members"],
    summary="Invite a member",
    description="Invite a user to the organization with a specified role. Enforces max_users quota.",
)
async def invite_member(
    org_id: int,
    data: MemberInviteRequest,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Invite a user to the organization. Requires owner, admin, or manager role."""
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    await _require_org_role(db, user.id, org_id, [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MANAGER])

    # Validate role
    try:
        role = OrgRole(data.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {data.role}")

    # Only owners can invite other owners
    if role == OrgRole.OWNER:
        await _require_org_role(db, user.id, org_id, [OrgRole.OWNER])

    # Check max_users
    member_count = (
        await db.execute(select(func.count(OrgMember.id)).where(OrgMember.organization_id == org_id))
    ).scalar() or 0
    if member_count >= org.max_users:
        raise HTTPException(status_code=409, detail=f"Organization has reached its user limit ({org.max_users})")

    # Check target user exists
    target_user = await db.get(User, data.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check not already a member
    existing = await db.execute(
        select(OrgMember).where(
            OrgMember.organization_id == org_id,
            OrgMember.user_id == data.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    member = OrgMember(
        organization_id=org_id,
        user_id=data.user_id,
        role=role,
        invited_by=user.id,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    await _audit(
        bus,
        user.id,
        "org.member_invite",
        "org_member",
        member.id,
        details=json.dumps({"target_user_id": data.user_id, "role": role.value}),
        ip=_client_ip(request),
        org_id=org_id,
    )

    return MemberOut(
        id=member.id,
        organization_id=member.organization_id,
        user_id=member.user_id,
        role=member.role.value,
        invited_by=member.invited_by,
        joined_at=member.joined_at,
        user_email=target_user.email,
        user_name=target_user.full_name,
    )


@app.patch(
    "/api/v1/orgs/{org_id}/members/{member_user_id}",
    response_model=MemberOut,
    tags=["Members"],
    summary="Update member role",
    description="Change a member's role. Only owners can promote to owner; cannot demote the last owner.",
)
async def update_member_role(
    org_id: int,
    member_user_id: int,
    data: MemberUpdateRoleRequest,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Update a member's role. Owners/admins can change roles; only owners can promote to owner."""
    await _require_org_role(db, user.id, org_id, [OrgRole.OWNER, OrgRole.ADMIN])

    try:
        new_role = OrgRole(data.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {data.role}")

    if new_role == OrgRole.OWNER:
        await _require_org_role(db, user.id, org_id, [OrgRole.OWNER])

    result = await db.execute(
        select(OrgMember).where(
            OrgMember.organization_id == org_id,
            OrgMember.user_id == member_user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Cannot demote the last owner
    if member.role == OrgRole.OWNER and new_role != OrgRole.OWNER:
        owner_count = (
            await db.execute(
                select(func.count(OrgMember.id)).where(
                    OrgMember.organization_id == org_id,
                    OrgMember.role == OrgRole.OWNER,
                )
            )
        ).scalar() or 0
        if owner_count <= 1:
            raise HTTPException(status_code=409, detail="Cannot demote the last owner")

    old_role = member.role.value
    member.role = new_role
    await db.commit()
    await db.refresh(member)

    # Load user info for response
    target_user = await db.get(User, member_user_id)

    await _audit(
        bus,
        user.id,
        "org.member_role_update",
        "org_member",
        member.id,
        details=json.dumps({"target_user_id": member_user_id, "old_role": old_role, "new_role": new_role.value}),
        ip=_client_ip(request),
        org_id=org_id,
    )

    return MemberOut(
        id=member.id,
        organization_id=member.organization_id,
        user_id=member.user_id,
        role=member.role.value,
        invited_by=member.invited_by,
        joined_at=member.joined_at,
        user_email=target_user.email if target_user else None,
        user_name=target_user.full_name if target_user else None,
    )


@app.delete(
    "/api/v1/orgs/{org_id}/members/{member_user_id}",
    status_code=204,
    tags=["Members"],
    summary="Remove a member",
    description="Remove a member from the organization. Users can remove themselves; owner/admin can remove others.",
)
async def remove_member(
    org_id: int,
    member_user_id: int,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Remove a member from the organization. Owner/admin can remove others; users can remove themselves."""
    # Users can remove themselves
    if member_user_id != user.id:
        await _require_org_role(db, user.id, org_id, [OrgRole.OWNER, OrgRole.ADMIN])

    result = await db.execute(
        select(OrgMember).where(
            OrgMember.organization_id == org_id,
            OrgMember.user_id == member_user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Cannot remove the last owner
    if member.role == OrgRole.OWNER:
        owner_count = (
            await db.execute(
                select(func.count(OrgMember.id)).where(
                    OrgMember.organization_id == org_id,
                    OrgMember.role == OrgRole.OWNER,
                )
            )
        ).scalar() or 0
        if owner_count <= 1:
            raise HTTPException(status_code=409, detail="Cannot remove the last owner")

    await db.delete(member)
    await db.commit()

    await _audit(
        bus,
        user.id,
        "org.member_remove",
        "org_member",
        0,
        details=json.dumps({"target_user_id": member_user_id}),
        ip=_client_ip(request),
        org_id=org_id,
    )
    return Response(status_code=204)


# ===================================================================
# API KEY MANAGEMENT
# ===================================================================


@app.post(
    "/api/v1/orgs/{org_id}/api-keys",
    response_model=ApiKeyCreatedOut,
    status_code=201,
    tags=["API Keys"],
    summary="Create an API key",
    description="Generate an API key with configurable scopes and expiration. Raw key returned once.",
)
async def create_api_key(
    org_id: int,
    data: ApiKeyCreateRequest,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Generate a new API key for the organization. Requires owner or admin role."""
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    await _require_org_role(db, user.id, org_id, [OrgRole.OWNER, OrgRole.ADMIN])

    # Validate scopes
    valid_scopes = {"read", "write", "admin"}
    requested_scopes = {s.strip() for s in data.scopes.split(",")}
    if not requested_scopes.issubset(valid_scopes):
        raise HTTPException(status_code=400, detail=f"Invalid scopes. Allowed: {valid_scopes}")

    # Generate key: kf_{random 48 chars}
    raw_key = f"kf_{secrets.token_urlsafe(36)}"
    prefix = raw_key[:10]
    key_hash = _hash_api_key(raw_key)

    expires_at = None
    if data.expires_in_days:
        from datetime import timedelta

        expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)

    api_key = ApiKey(
        organization_id=org_id,
        name=data.name,
        key_hash=key_hash,
        prefix=prefix,
        scopes=data.scopes,
        rate_limit=data.rate_limit,
        is_active=True,
        expires_at=expires_at,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    await _audit(
        bus,
        user.id,
        "org.api_key_create",
        "api_key",
        api_key.id,
        details=json.dumps({"name": data.name, "prefix": prefix, "scopes": data.scopes}),
        ip=_client_ip(request),
        org_id=org_id,
    )

    return ApiKeyCreatedOut(
        id=api_key.id,
        organization_id=api_key.organization_id,
        name=api_key.name,
        prefix=api_key.prefix,
        scopes=api_key.scopes,
        rate_limit=api_key.rate_limit,
        is_active=api_key.is_active,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
        created_at=api_key.created_at,
        raw_key=raw_key,
    )


@app.get(
    "/api/v1/orgs/{org_id}/api-keys",
    response_model=list[ApiKeyOut],
    tags=["API Keys"],
    summary="List API keys",
    description="List all API keys for the organization, sorted by creation date. Requires owner or admin role.",
)
async def list_api_keys(
    org_id: int,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """List all API keys for the organization. Requires owner or admin role."""
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    await _require_org_role(db, user.id, org_id, [OrgRole.OWNER, OrgRole.ADMIN])

    result = await db.execute(select(ApiKey).where(ApiKey.organization_id == org_id).order_by(ApiKey.created_at.desc()))
    return result.scalars().all()


@app.delete(
    "/api/v1/orgs/{org_id}/api-keys/{key_id}",
    status_code=204,
    tags=["API Keys"],
    summary="Revoke an API key",
    description="Deactivate an API key so it can no longer be used for authentication.",
)
async def revoke_api_key(
    org_id: int,
    key_id: int,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Revoke (deactivate) an API key. Requires owner or admin role."""
    await _require_org_role(db, user.id, org_id, [OrgRole.OWNER, OrgRole.ADMIN])

    api_key = await db.get(ApiKey, key_id)
    if not api_key or api_key.organization_id != org_id:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.is_active = False
    await db.commit()

    await _audit(
        bus,
        user.id,
        "org.api_key_revoke",
        "api_key",
        key_id,
        details=json.dumps({"prefix": api_key.prefix}),
        ip=_client_ip(request),
        org_id=org_id,
    )
    return Response(status_code=204)


# ===================================================================
# API KEY VALIDATION (internal, for gateway / other services)
# ===================================================================


@app.get(
    "/api/v1/api-keys/validate",
    tags=["API Keys"],
    summary="Validate an API key",
    description="Validate a raw API key and return the associated organization info and scopes.",
)
async def validate_api_key(
    key: str = Query(..., description="The raw API key to validate"),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate an API key and return org info + scopes.
    Used internally by the gateway for API-key-authenticated requests.
    """
    # Look up by prefix (first 10 chars), then verify with bcrypt
    prefix = key[:10] if len(key) >= 10 else key
    result = await db.execute(select(ApiKey).where(ApiKey.prefix == prefix))
    candidates = result.scalars().all()

    api_key = None
    for candidate in candidates:
        if _verify_api_key(key, candidate.key_hash):
            api_key = candidate
            break

    if not api_key or not api_key.is_active:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")

    # Check expiry
    if api_key.expires_at and api_key.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="API key has expired")

    # Update last_used_at
    api_key.last_used_at = datetime.now(timezone.utc)
    await db.commit()

    org = await db.get(Organization, api_key.organization_id)

    # Audit log for API key validation
    logger.info(
        "API key validated: org=%s key_id=%s prefix=%s",
        api_key.organization_id,
        api_key.id,
        api_key.prefix,
    )

    return {
        "valid": True,
        "organization_id": api_key.organization_id,
        "org_slug": org.slug if org else "",
        "scopes": api_key.scopes,
        "rate_limit": api_key.rate_limit,
    }


# ===================================================================
# PLAN / QUOTA MANAGEMENT
# ===================================================================


@app.patch(
    "/api/v1/orgs/{org_id}/plan",
    response_model=OrgOut,
    tags=["Plans"],
    summary="Update organization plan",
    description="Change an organization's subscription plan and adjust quotas. Requires owner role or superadmin.",
)
async def update_plan(
    org_id: int,
    data: PlanUpdateRequest,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """
    Update an organization's plan and quotas.
    Requires owner role or superadmin.
    """
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    if not user.is_superadmin:
        await _require_org_role(db, user.id, org_id, [OrgRole.OWNER])

    try:
        new_plan = PlanTier(data.plan)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {data.plan}")

    old_plan = org.plan.value
    defaults = PLAN_DEFAULTS.get(new_plan.value, PLAN_DEFAULTS["free"])

    org.plan = new_plan
    org.mention_quota = data.mention_quota if data.mention_quota is not None else defaults["mention_quota"]
    org.max_projects = data.max_projects if data.max_projects is not None else defaults["max_projects"]
    org.max_users = data.max_users if data.max_users is not None else defaults["max_users"]

    await db.commit()
    await db.refresh(org)

    await _audit(
        bus,
        user.id,
        "org.plan_update",
        "organization",
        org.id,
        details=json.dumps(
            {
                "old_plan": old_plan,
                "new_plan": new_plan.value,
                "mention_quota": org.mention_quota,
                "max_projects": org.max_projects,
            }
        ),
        ip=_client_ip(request),
        org_id=org_id,
    )
    return org


@app.post(
    "/api/v1/orgs/{org_id}/mentions/increment",
    tags=["Usage"],
    summary="Increment mentions counter",
    description="Increment the mentions_used counter for an organization when new mentions are stored.",
)
async def increment_mentions_used(
    org_id: int,
    count: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_internal_token),
):
    """
    Increment the mentions_used counter for an org.
    Called internally by the collector/query service when new mentions are stored.
    Returns whether the org is within quota.
    """
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    new_used = org.mentions_used + count
    within_quota = new_used <= org.mention_quota

    org.mentions_used = new_used
    await db.commit()

    return {
        "organization_id": org_id,
        "mentions_used": new_used,
        "mention_quota": org.mention_quota,
        "within_quota": within_quota,
    }


@app.post(
    "/api/v1/orgs/{org_id}/mentions/reset",
    status_code=200,
    tags=["Usage"],
    summary="Reset mentions counter",
    description="Reset the monthly mentions_used counter to zero. Requires owner role or superadmin.",
)
async def reset_mentions_used(
    org_id: int,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Reset the monthly mentions_used counter. Requires owner or superadmin."""
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    if not user.is_superadmin:
        await _require_org_role(db, user.id, org_id, [OrgRole.OWNER])

    old_used = org.mentions_used
    org.mentions_used = 0
    await db.commit()

    await _audit(
        bus,
        user.id,
        "org.mentions_reset",
        "organization",
        org.id,
        details=json.dumps({"old_mentions_used": old_used}),
        ip=_client_ip(request),
        org_id=org_id,
    )
    return {"organization_id": org_id, "mentions_used": 0}


@app.get(
    "/api/v1/orgs/{org_id}/quota-check",
    tags=["Usage"],
    summary="Check project quota",
    description="Check whether the organization can create a new project and is within quota.",
)
async def check_project_quota(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_internal_token),
):
    """
    Check whether the org can create a new project.
    Used internally before project creation.
    """
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    project_count = (
        await db.execute(select(func.count(Project.id)).where(Project.organization_id == org_id))
    ).scalar() or 0

    return {
        "organization_id": org_id,
        "max_projects": org.max_projects,
        "projects_used": project_count,
        "can_create": project_count < org.max_projects,
        "mention_quota": org.mention_quota,
        "mentions_used": org.mentions_used,
        "within_mention_quota": org.mentions_used < org.mention_quota,
    }


# ===================================================================
# USAGE STATISTICS
# ===================================================================


@app.get(
    "/api/v1/orgs/{org_id}/usage",
    response_model=UsageOut,
    tags=["Usage"],
    summary="Get usage statistics",
    description="Current usage statistics: mention consumption, project count, and user count.",
)
async def get_usage(
    org_id: int,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Get usage statistics for an organization."""
    org = await db.get(Organization, org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=404, detail="Organization not found")

    if not user.is_superadmin:
        await _require_org_role(
            db,
            user.id,
            org_id,
            [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MANAGER, OrgRole.ANALYST, OrgRole.VIEWER],
        )

    project_count = (
        await db.execute(select(func.count(Project.id)).where(Project.organization_id == org_id))
    ).scalar() or 0

    user_count = (
        await db.execute(select(func.count(OrgMember.id)).where(OrgMember.organization_id == org_id))
    ).scalar() or 0

    remaining = max(0, org.mention_quota - org.mentions_used)
    pct = (org.mentions_used / org.mention_quota * 100) if org.mention_quota > 0 else 0.0

    return UsageOut(
        organization_id=org.id,
        name=org.name,
        plan=org.plan.value,
        mention_quota=org.mention_quota,
        mentions_used=org.mentions_used,
        mentions_remaining=remaining,
        mention_usage_pct=round(pct, 2),
        max_projects=org.max_projects,
        projects_used=project_count,
        max_users=org.max_users,
        users_count=user_count,
    )


# ---------------------------------------------------------------------------
# Run with: uvicorn services.tenant_service.app.main:app --port 8011
# ---------------------------------------------------------------------------
