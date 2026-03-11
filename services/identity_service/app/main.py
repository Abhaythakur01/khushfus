"""
Identity Service -- authentication, SSO, JWT, sessions, and user profiles.

Responsibilities:
- SAML and OIDC SSO endpoints for enterprise identity provider integration
- JWT token issuance, refresh, and validation
- Password-based register/login as fallback when SSO is not configured
- User profile management (view, update, change password)
- Session tracking and revocation
- Publishes audit events to STREAM_AUDIT for login, register, password changes

Long-running FastAPI service on port 8010.
"""

import json
import logging
import os
import secrets
import time as _time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.cors import get_cors_origins
from shared.database import create_db, init_tables
from shared.events import STREAM_AUDIT, AuditEvent, EventBus
from shared.models import Organization, OrgMember, OrgRole, User
from shared.tracing import setup_tracing

setup_tracing("identity")

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
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
SESSION_TTL_SECONDS = REFRESH_TOKEN_EXPIRE_DAYS * 86400

# OIDC / SAML configuration (org-level overrides come from DB)
OIDC_DISCOVERY_SUFFIX = "/.well-known/openid-configuration"

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Auth rate limiting (in-memory sliding window)
# ---------------------------------------------------------------------------

_auth_rate_limits: dict[str, list[datetime]] = defaultdict(list)
MAX_AUTH_ATTEMPTS = int(os.getenv("MAX_AUTH_ATTEMPTS_PER_MINUTE", "10"))


def _check_auth_rate_limit(identifier: str):
    """Check if auth rate limit is exceeded. Raises 429 if too many attempts."""
    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=1)
    _auth_rate_limits[identifier] = [t for t in _auth_rate_limits[identifier] if t > cutoff]
    if len(_auth_rate_limits[identifier]) >= MAX_AUTH_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many authentication attempts")
    _auth_rate_limits[identifier].append(now)


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str
    org_slug: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = ACCESS_TOKEN_EXPIRE_MINUTES * 60


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    avatar_url: str | None = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    avatar_url: str | None
    is_active: bool
    is_superadmin: bool
    last_login_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    session_id: str
    created_at: str
    last_active: str
    ip_address: str
    user_agent: str


class SAMLInitRequest(BaseModel):
    org_slug: str


class OIDCInitRequest(BaseModel):
    org_slug: str


class OIDCCallbackRequest(BaseModel):
    code: str
    state: str


class TokenValidateResponse(BaseModel):
    valid: bool
    user_id: int | None = None
    email: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": now, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    jti = uuid.uuid4().hex
    to_encode.update({"exp": expire, "iat": now, "type": "refresh", "jti": jti})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _user_agent(request: Request) -> str:
    return request.headers.get("user-agent", "unknown")[:256]


# ---------------------------------------------------------------------------
# Session helpers (Redis-backed)
# ---------------------------------------------------------------------------


async def _create_session(
    event_bus: EventBus,
    user_id: int,
    ip: str,
    ua: str,
    refresh_jti: str,
) -> str:
    """Store session in Redis. Key: session:{user_id}:{jti}."""
    r = await event_bus.connect()
    session_id = f"{user_id}:{refresh_jti}"
    key = f"session:{session_id}"
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "user_id": str(user_id),
        "ip_address": ip,
        "user_agent": ua,
        "created_at": now,
        "last_active": now,
    }
    await r.hset(key, mapping=data)
    await r.expire(key, SESSION_TTL_SECONDS)
    return session_id


async def _touch_session(event_bus: EventBus, session_id: str):
    r = await event_bus.connect()
    key = f"session:{session_id}"
    now = datetime.now(timezone.utc).isoformat()
    await r.hset(key, "last_active", now)


async def _revoke_session(event_bus: EventBus, session_id: str):
    r = await event_bus.connect()
    await r.delete(f"session:{session_id}")


async def _get_user_sessions(event_bus: EventBus, user_id: int) -> list[dict]:
    r = await event_bus.connect()
    pattern = f"session:{user_id}:*"
    sessions: list[dict] = []
    async for key in r.scan_iter(match=pattern, count=100):
        data = await r.hgetall(key)
        if data:
            # key is "session:{user_id}:{jti}"
            sid = key.removeprefix("session:") if isinstance(key, str) else key.decode().removeprefix("session:")
            data["session_id"] = sid
            sessions.append(data)
    return sessions


async def _revoke_all_sessions(event_bus: EventBus, user_id: int):
    r = await event_bus.connect()
    async for key in r.scan_iter(match=f"session:{user_id}:*", count=100):
        await r.delete(key)


async def _session_exists(event_bus: EventBus, session_id: str) -> bool:
    r = await event_bus.connect()
    return await r.exists(f"session:{session_id}") > 0


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


async def get_db(request: Request) -> AsyncSession:
    async with request.app.state.db_session() as session:
        yield session


def get_event_bus(request: Request) -> EventBus:
    return request.app.state.event_bus


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    try:
        payload = _decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
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
    logger.info("Identity Service started")
    yield
    await app.state.event_bus.close()
    await engine.dispose()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="KhushFus Identity Service",
    description="Authentication, SSO, JWT, sessions, and user profiles",
    version="0.1.0",
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "Auth", "description": "Password-based registration, login, token refresh, and logout."},
        {"name": "Token", "description": "Token validation for inter-service communication."},
        {"name": "SSO", "description": "SAML and OIDC single sign-on endpoints."},
        {"name": "Profile", "description": "User profile retrieval, update, and password change."},
        {"name": "Sessions", "description": "Session listing and revocation."},
        {"name": "Admin", "description": "Administrative user lookup."},
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

    app.add_middleware(RequestLoggingMiddleware, service_name="identity")
except ImportError:
    logger.debug("RequestLoggingMiddleware not available")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass


@app.get(
    "/health",
    tags=["Health"],
    summary="Identity health check",
    description="Returns the health status of the Identity service and its dependencies.",
)
async def health():
    from shared.health import build_health_response, check_postgres, check_redis

    checks = {
        "postgres": await check_postgres(database_url=DATABASE_URL),
        "redis": await check_redis(REDIS_URL),
    }
    return await build_health_response("identity", checks=checks)


# ===================================================================
# PASSWORD AUTH ENDPOINTS
# ===================================================================


@app.post(
    "/api/v1/auth/register",
    response_model=UserOut,
    status_code=201,
    tags=["Auth"],
    summary="Register a new user",
    description="Create a new user account with email and password. Optionally join an organization by slug.",
)
async def register(
    data: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Register a new user with email/password.  Optionally join an org."""
    _check_auth_rate_limit(request.client.host if request.client else "unknown")
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=_hash_password(data.password),
        full_name=data.full_name,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # If org_slug provided, try to add the user as a viewer
    org_id = 0
    if data.org_slug:
        result = await db.execute(
            select(Organization).where(Organization.slug == data.org_slug, Organization.is_active.is_(True))
        )
        org = result.scalar_one_or_none()
        if org:
            org_id = org.id
            member = OrgMember(organization_id=org.id, user_id=user.id, role=OrgRole.VIEWER)
            db.add(member)
            await db.commit()

    await _audit(bus, user.id, "user.register", "user", user.id, ip=_client_ip(request), org_id=org_id)
    return user


@app.post(
    "/api/v1/auth/login",
    response_model=TokenResponse,
    tags=["Auth"],
    summary="Login with credentials",
    description="Authenticate with email and password to receive JWT access and refresh tokens.",
)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Authenticate with email/password and receive JWT tokens."""
    client_ip = _client_ip(request)
    _check_auth_rate_limit(client_ip)
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password or not _verify_password(data.password, user.hashed_password):
        logger.warning("login_failed email=%s ip=%s reason=invalid_credentials", data.email, client_ip)
        await _audit(bus, 0, "auth.login_failed", "user", details=json.dumps({"email": data.email, "ip": client_ip}))
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        logger.warning("login_failed email=%s ip=%s reason=account_deactivated", data.email, client_ip)
        await _audit(
            bus, user.id, "auth.login_failed", "user", user.id,
            details=json.dumps({"email": data.email, "ip": client_ip, "reason": "deactivated"}),
        )
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # Determine primary org for the token claims
    mem_result = await db.execute(select(OrgMember).where(OrgMember.user_id == user.id).order_by(OrgMember.joined_at))
    membership = mem_result.scalars().first()
    org_id = membership.organization_id if membership else 0
    role = membership.role.value if membership else ""

    token_data = {"sub": user.id, "email": user.email, "org_id": org_id, "role": role}
    access_token = _create_access_token(token_data)
    refresh_token = _create_refresh_token(token_data)

    # Decode refresh to get jti for session tracking
    refresh_payload = _decode_token(refresh_token)
    jti = refresh_payload["jti"]

    await _create_session(bus, user.id, _client_ip(request), _user_agent(request), jti)

    # Update last_login_at
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    await _audit(bus, user.id, "user.login", "user", user.id, ip=_client_ip(request), org_id=org_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@app.post(
    "/api/v1/auth/refresh",
    response_model=TokenResponse,
    tags=["Auth"],
    summary="Refresh tokens",
    description="Exchange a valid refresh token for a new access and refresh token pair with session rotation.",
)
async def refresh_tokens(
    body: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Exchange a refresh token for a new access + refresh token pair."""
    try:
        payload = _decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Not a refresh token")
        user_id = payload["sub"]
        jti = payload.get("jti", "")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Verify session still exists
    session_id = f"{user_id}:{jti}"
    if not await _session_exists(bus, session_id):
        raise HTTPException(status_code=401, detail="Session revoked or expired")

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Rotate: revoke old session, issue new tokens
    await _revoke_session(bus, session_id)

    mem_result = await db.execute(select(OrgMember).where(OrgMember.user_id == user.id).order_by(OrgMember.joined_at))
    membership = mem_result.scalars().first()
    org_id = membership.organization_id if membership else 0
    role = membership.role.value if membership else ""

    token_data = {"sub": user.id, "email": user.email, "org_id": org_id, "role": role}
    new_access = _create_access_token(token_data)
    new_refresh = _create_refresh_token(token_data)

    new_payload = _decode_token(new_refresh)
    await _create_session(bus, user.id, _client_ip(request), _user_agent(request), new_payload["jti"])

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@app.post(
    "/api/v1/auth/logout",
    status_code=204,
    tags=["Auth"],
    summary="Logout",
    description="Revoke all active sessions for the current user, effectively logging out everywhere.",
)
async def logout(
    request: Request,
    user: User = Depends(require_auth),
    bus: EventBus = Depends(get_event_bus),
):
    """Revoke the current session (requires the refresh token's jti via header or we revoke all)."""
    # We revoke all sessions for simplicity when called without specifying a session.
    # A production system might accept the refresh token in the body.
    await _revoke_all_sessions(bus, user.id)
    await _audit(bus, user.id, "user.logout", "user", user.id, ip=_client_ip(request))
    return Response(status_code=204)


# ===================================================================
# TOKEN VALIDATION (internal, for other services)
# ===================================================================


@app.get(
    "/api/v1/auth/validate",
    response_model=TokenValidateResponse,
    tags=["Token"],
    summary="Validate access token",
    description="Validate a Bearer access token and return the associated user ID and email.",
)
async def validate_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
):
    """Validate an access token and return user info. Used by other services."""
    if not credentials:
        return TokenValidateResponse(valid=False)
    try:
        payload = _decode_token(credentials.credentials)
        if payload.get("type") != "access":
            return TokenValidateResponse(valid=False)
        user_id = payload["sub"]
        user = await db.get(User, user_id)
        if not user or not user.is_active:
            return TokenValidateResponse(valid=False)
        return TokenValidateResponse(valid=True, user_id=user.id, email=user.email)
    except JWTError:
        return TokenValidateResponse(valid=False)


# ===================================================================
# SSO: SAML
# ===================================================================


@app.post(
    "/api/v1/sso/saml/init",
    tags=["SSO"],
    summary="Initiate SAML login",
    description="Start a SAML SSO flow by returning the IdP redirect URL for the specified organization.",
)
async def saml_init(
    body: SAMLInitRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Initiate SAML SSO login. Returns the IdP redirect URL.

    The caller must redirect the user's browser to the returned URL.
    The IdP will POST back to /api/v1/sso/saml/acs after authentication.
    """
    result = await db.execute(
        select(Organization).where(
            Organization.slug == body.org_slug,
            Organization.sso_enabled.is_(True),
            Organization.sso_provider == "saml",
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found or SAML SSO not enabled")

    # In production this would use python3-saml to build the AuthnRequest
    # from org.sso_metadata_url and org.sso_entity_id.
    # Here we construct the redirect URL referencing the org's metadata.
    relay_state = secrets.token_urlsafe(32)
    r = await request.app.state.event_bus.connect()
    await r.setex(f"saml_relay:{relay_state}", 600, json.dumps({"org_id": org.id, "slug": org.slug}))

    # The actual SAML AuthnRequest URL would be built from IdP metadata.
    # We return the metadata url + relay state for the gateway/frontend to handle.
    saml_login_url = f"{org.sso_metadata_url}?RelayState={relay_state}"

    return {
        "redirect_url": saml_login_url,
        "relay_state": relay_state,
        "entity_id": org.sso_entity_id,
        "org_slug": org.slug,
    }


@app.post(
    "/api/v1/sso/saml/acs",
    response_model=TokenResponse,
    tags=["SSO"],
    summary="SAML assertion consumer",
    description="Process the SAML assertion from the IdP and issue JWT tokens for the user.",
)
async def saml_acs(
    request: Request,
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """
    SAML Assertion Consumer Service endpoint.

    The IdP POSTs the SAML response here. We validate the assertion,
    extract user attributes, and issue JWT tokens.

    In production this uses python3-saml to validate the XML signature.
    """
    form = await request.form()
    saml_response = form.get("SAMLResponse", "")
    relay_state = form.get("RelayState", "")

    if not saml_response or not relay_state:
        raise HTTPException(status_code=400, detail="Missing SAMLResponse or RelayState")

    # Look up org from relay state
    r = await bus.connect()
    relay_data = await r.get(f"saml_relay:{relay_state}")
    if not relay_data:
        raise HTTPException(status_code=400, detail="Invalid or expired RelayState")
    await r.delete(f"saml_relay:{relay_state}")

    relay = json.loads(relay_data)
    org_id = relay["org_id"]

    org = await db.get(Organization, org_id)
    if not org or not org.sso_enabled:
        raise HTTPException(status_code=400, detail="SSO not enabled for this organization")

    # --- SAML response validation (production: python3-saml) ---
    # In a real deployment, we would:
    #   1. Initialize OneLogin_Saml2_Auth with org's IdP settings
    #   2. Call auth.process_response() to validate signature & conditions
    #   3. Extract NameID and attributes
    #
    # For this implementation, we demonstrate the full flow structure.
    # The SAML response is base64-encoded XML; we'd parse it here.
    # Below we simulate the parsed attributes for the wiring to be complete.

    import base64
    import re as _re

    try:
        decoded_xml = base64.b64decode(saml_response).decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SAMLResponse encoding")

    # Validate SAML conditions (NotBefore/NotOnOrAfter)
    not_before_match = _re.search(r'NotBefore="([^"]+)"', decoded_xml)
    not_on_or_after_match = _re.search(r'NotOnOrAfter="([^"]+)"', decoded_xml)
    if not_before_match:
        nb = datetime.fromisoformat(not_before_match.group(1).replace("Z", "+00:00"))
        if datetime.now(timezone.utc) < nb:
            raise HTTPException(status_code=400, detail="SAML assertion not yet valid")
    if not_on_or_after_match:
        noa = datetime.fromisoformat(not_on_or_after_match.group(1).replace("Z", "+00:00"))
        if datetime.now(timezone.utc) >= noa:
            raise HTTPException(status_code=400, detail="SAML assertion has expired")

    # Validate Issuer matches configured SSO entity ID
    issuer_match = _re.search(r'<(?:saml2?:)?Issuer[^>]*>([^<]+)</(?:saml2?:)?Issuer>', decoded_xml)
    if issuer_match and org.sso_entity_id:
        if issuer_match.group(1) != org.sso_entity_id:
            raise HTTPException(status_code=400, detail="SAML Issuer mismatch")

    # SECURITY: Verify SAML assertion signature
    # In production, python3-saml with want_assertions_signed=True handles this.
    # For now, reject unsigned assertions to prevent forged SAML responses.
    import re as _re_sig
    has_signature = bool(_re_sig.search(r'<(?:ds:)?Signature[\s>]', decoded_xml))
    if not has_signature:
        raise HTTPException(status_code=400, detail="Unsigned SAML assertions are not accepted")
    logger.warning("SAML XML signature present but cryptographic verification requires python3-saml")

    # Extract from SAML assertion (simplified -- production uses python3-saml)
    # These would come from the validated assertion's NameID and Attributes
    # For now we require the IdP to include email and name in standard attribute fields.
    # A real implementation parses the XML via python3-saml.
    email = _extract_saml_attr(decoded_xml, "emailAddress") or _extract_saml_attr(decoded_xml, "NameID")
    full_name = _extract_saml_attr(decoded_xml, "displayName") or ""
    sso_subject = _extract_saml_attr(decoded_xml, "NameID") or email

    if not email:
        raise HTTPException(status_code=400, detail="Could not extract email from SAML assertion")

    # Find or create user
    user = await _find_or_create_sso_user(db, email, full_name, sso_subject, org_id)

    # Issue tokens
    token_data = {"sub": user.id, "email": user.email, "org_id": org_id, "role": ""}
    mem_result = await db.execute(
        select(OrgMember).where(OrgMember.user_id == user.id, OrgMember.organization_id == org_id)
    )
    membership = mem_result.scalar_one_or_none()
    if membership:
        token_data["role"] = membership.role.value

    access_token = _create_access_token(token_data)
    refresh_token = _create_refresh_token(token_data)
    refresh_payload = _decode_token(refresh_token)

    await _create_session(bus, user.id, _client_ip(request), _user_agent(request), refresh_payload["jti"])

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    await _audit(bus, user.id, "user.sso_login", "user", user.id, details="saml", ip=_client_ip(request), org_id=org_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def _extract_saml_attr(xml_str: str, attr_name: str) -> str | None:
    """Naive attribute extraction from SAML XML. Production uses python3-saml."""
    import re

    # Try NameID
    if attr_name == "NameID":
        m = re.search(r"<(?:\w+:)?NameID[^>]*>([^<]+)</(?:\w+:)?NameID>", xml_str)
        return m.group(1).strip() if m else None
    # Try Attribute with Name containing attr_name
    pattern = (
        rf'<(?:\w+:)?Attribute[^>]*Name="[^"]*{re.escape(attr_name)}[^"]*"[^>]*>'
        r".*?<(?:\w+:)?AttributeValue[^>]*>([^<]+)</(?:\w+:)?AttributeValue>"
    )
    m = re.search(pattern, xml_str, re.DOTALL)
    return m.group(1).strip() if m else None


# ===================================================================
# SSO: OIDC
# ===================================================================


@app.post(
    "/api/v1/sso/oidc/init",
    tags=["SSO"],
    summary="Initiate OIDC login",
    description="Start an OIDC SSO flow by returning the authorization URL for the specified organization.",
)
async def oidc_init(
    body: OIDCInitRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """
    Initiate OIDC SSO login. Returns the authorization URL.

    The org must have sso_provider='oidc' and sso_metadata_url pointing to the
    OIDC provider's base URL (we append /.well-known/openid-configuration).
    sso_entity_id stores the client_id.
    """
    result = await db.execute(
        select(Organization).where(
            Organization.slug == body.org_slug,
            Organization.sso_enabled.is_(True),
            Organization.sso_provider == "oidc",
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found or OIDC SSO not enabled")

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(16)
    r = await bus.connect()
    await r.setex(
        f"oidc_state:{state}",
        600,
        json.dumps({"org_id": org.id, "nonce": nonce}),
    )

    # Build authorization URL from org's OIDC configuration
    # In production we'd fetch the discovery doc to get the authorization_endpoint.
    base_url = org.sso_metadata_url.rstrip("/")
    client_id = org.sso_entity_id
    callback_url = os.getenv(
        "OIDC_CALLBACK_URL",
        f"{request.base_url}api/v1/sso/oidc/callback",
    )

    auth_url = (
        f"{base_url}/authorize"
        f"?response_type=code"
        f"&client_id={client_id}"
        f"&redirect_uri={callback_url}"
        f"&scope=openid+email+profile"
        f"&state={state}"
        f"&nonce={nonce}"
    )

    return {"redirect_url": auth_url, "state": state}


_jwks_cache: dict[str, tuple[dict, float]] = {}


async def _fetch_jwks(issuer_url: str) -> dict:
    """Fetch and cache OIDC provider's JWKS for token verification."""
    import httpx

    cache_ttl = 3600
    if issuer_url in _jwks_cache:
        jwks, cached_at = _jwks_cache[issuer_url]
        if _time.time() - cached_at < cache_ttl:
            return jwks
    async with httpx.AsyncClient(timeout=10) as client:
        disco_resp = await client.get(f"{issuer_url}/.well-known/openid-configuration")
        disco_resp.raise_for_status()
        jwks_uri = disco_resp.json()["jwks_uri"]
        jwks_resp = await client.get(jwks_uri)
        jwks_resp.raise_for_status()
        jwks = jwks_resp.json()
    _jwks_cache[issuer_url] = (jwks, _time.time())
    return jwks


@app.get(
    "/api/v1/sso/oidc/callback",
    response_model=TokenResponse,
    tags=["SSO"],
    summary="OIDC callback",
    description="Handle the OIDC authorization code callback, exchange for tokens, and issue KhushFus JWT tokens.",
)
async def oidc_callback(
    code: str = Query(...),
    state: str = Query(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """
    OIDC callback endpoint. Exchanges the authorization code for tokens,
    extracts user info, and issues KhushFus JWT tokens.
    """
    r = await bus.connect()
    state_data = await r.get(f"oidc_state:{state}")
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    await r.delete(f"oidc_state:{state}")

    state_info = json.loads(state_data)
    org_id = state_info["org_id"]
    nonce = state_info["nonce"]

    org = await db.get(Organization, org_id)
    if not org or not org.sso_enabled:
        raise HTTPException(status_code=400, detail="SSO not enabled for this organization")

    base_url = org.sso_metadata_url.rstrip("/")
    client_id = org.sso_entity_id
    client_secret = os.getenv(f"OIDC_CLIENT_SECRET_{org.slug.upper().replace('-', '_')}", "")
    callback_url = os.getenv(
        "OIDC_CALLBACK_URL",
        f"{request.base_url}api/v1/sso/oidc/callback",
    )

    # Exchange code for tokens
    import httpx

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            f"{base_url}/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": callback_url,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            logger.error(f"OIDC token exchange failed: {token_resp.status_code} {token_resp.text}")
            raise HTTPException(status_code=502, detail="OIDC token exchange failed")

        oidc_tokens = token_resp.json()

    # Extract user info from id_token or userinfo endpoint
    id_token = oidc_tokens.get("id_token", "")
    email = ""
    full_name = ""
    sso_subject = ""

    if id_token:
        try:
            jwks = await _fetch_jwks(base_url)
            claims = jwt.decode(
                id_token, jwks, algorithms=["RS256", "RS384", "ES256"],
                audience=client_id, issuer=base_url,
            )
            email = claims.get("email", "")
            full_name = claims.get("name", "")
            sso_subject = claims.get("sub", "")
            token_nonce = claims.get("nonce", "")
            if token_nonce and token_nonce != nonce:
                raise HTTPException(status_code=400, detail="Nonce mismatch")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"OIDC token verification failed: {e}")
            raise HTTPException(status_code=401, detail=f"Invalid id_token: {e}")

    # Fallback: userinfo endpoint
    if not email:
        access_tok = oidc_tokens.get("access_token", "")
        if access_tok:
            async with httpx.AsyncClient(timeout=10) as client:
                ui_resp = await client.get(
                    f"{base_url}/userinfo",
                    headers={"Authorization": f"Bearer {access_tok}"},
                )
                if ui_resp.status_code == 200:
                    ui = ui_resp.json()
                    email = ui.get("email", "")
                    full_name = full_name or ui.get("name", "")
                    sso_subject = sso_subject or ui.get("sub", "")

    if not email:
        raise HTTPException(status_code=400, detail="Could not determine user email from OIDC provider")

    user = await _find_or_create_sso_user(db, email, full_name, sso_subject, org_id)

    # Issue KhushFus tokens
    token_data = {"sub": user.id, "email": user.email, "org_id": org_id, "role": ""}
    mem_result = await db.execute(
        select(OrgMember).where(OrgMember.user_id == user.id, OrgMember.organization_id == org_id)
    )
    membership = mem_result.scalar_one_or_none()
    if membership:
        token_data["role"] = membership.role.value

    access_token = _create_access_token(token_data)
    refresh_token = _create_refresh_token(token_data)
    refresh_payload = _decode_token(refresh_token)

    await _create_session(bus, user.id, _client_ip(request), _user_agent(request), refresh_payload["jti"])

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    await _audit(bus, user.id, "user.sso_login", "user", user.id, details="oidc", ip=_client_ip(request), org_id=org_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def _find_or_create_sso_user(
    db: AsyncSession,
    email: str,
    full_name: str,
    sso_subject: str,
    org_id: int,
) -> User:
    """Find user by email or SSO subject, or create a new one. Ensure org membership."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user and sso_subject:
        result = await db.execute(select(User).where(User.sso_subject == sso_subject))
        user = result.scalar_one_or_none()

    if user:
        # Update SSO subject if not set
        if sso_subject and not user.sso_subject:
            user.sso_subject = sso_subject
            await db.commit()
    else:
        user = User(
            email=email,
            full_name=full_name or email.split("@")[0],
            sso_subject=sso_subject,
            hashed_password=None,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Ensure membership in the org
    mem_result = await db.execute(
        select(OrgMember).where(OrgMember.user_id == user.id, OrgMember.organization_id == org_id)
    )
    if not mem_result.scalar_one_or_none():
        member = OrgMember(organization_id=org_id, user_id=user.id, role=OrgRole.VIEWER)
        db.add(member)
        await db.commit()

    return user


# ===================================================================
# USER PROFILE ENDPOINTS
# ===================================================================


@app.get(
    "/api/v1/users/me",
    response_model=UserOut,
    tags=["Profile"],
    summary="Get current user profile",
    description="Return the authenticated user's profile information.",
)
async def get_profile(user: User = Depends(require_auth)):
    """Get the current authenticated user's profile."""
    return user


@app.patch(
    "/api/v1/users/me",
    response_model=UserOut,
    tags=["Profile"],
    summary="Update user profile",
    description="Update the current user's display name or avatar URL.",
)
async def update_profile(
    data: ProfileUpdateRequest,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Update the current user's profile fields."""
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url
    await db.commit()
    await db.refresh(user)
    await _audit(bus, user.id, "user.profile_update", "user", user.id, ip=_client_ip(request))
    return user


@app.post(
    "/api/v1/users/me/change-password",
    status_code=204,
    tags=["Profile"],
    summary="Change password",
    description="Change the current user's password. Requires current password and revokes all sessions.",
)
async def change_password(
    data: PasswordChangeRequest,
    request: Request,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Change the current user's password. Requires current password confirmation."""
    if not user.hashed_password:
        raise HTTPException(status_code=400, detail="SSO-only users cannot set a password here")
    if not _verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    user.hashed_password = _hash_password(data.new_password)
    await db.commit()

    # Revoke all sessions to force re-login with new password
    await _revoke_all_sessions(bus, user.id)

    await _audit(bus, user.id, "user.password_change", "user", user.id, ip=_client_ip(request))
    return Response(status_code=204)


# ===================================================================
# SESSION MANAGEMENT
# ===================================================================


@app.get(
    "/api/v1/sessions",
    response_model=list[SessionOut],
    tags=["Sessions"],
    summary="List active sessions",
    description="List all active sessions for the current authenticated user.",
)
async def list_sessions(
    user: User = Depends(require_auth),
    bus: EventBus = Depends(get_event_bus),
):
    """List all active sessions for the current user."""
    sessions = await _get_user_sessions(bus, user.id)
    return [
        SessionOut(
            session_id=s.get("session_id", ""),
            created_at=s.get("created_at", ""),
            last_active=s.get("last_active", ""),
            ip_address=s.get("ip_address", ""),
            user_agent=s.get("user_agent", ""),
        )
        for s in sessions
    ]


@app.delete(
    "/api/v1/sessions/{session_id}",
    status_code=204,
    tags=["Sessions"],
    summary="Revoke a session",
    description="Revoke a specific session by ID. Only sessions owned by the current user can be revoked.",
)
async def revoke_session(
    session_id: str,
    request: Request,
    user: User = Depends(require_auth),
    bus: EventBus = Depends(get_event_bus),
):
    """Revoke a specific session. Only sessions owned by the current user."""
    if not session_id.startswith(f"{user.id}:"):
        raise HTTPException(status_code=403, detail="Cannot revoke another user's session")
    await _revoke_session(bus, session_id)
    await _audit(bus, user.id, "user.session_revoke", "session", 0, details=session_id, ip=_client_ip(request))
    return Response(status_code=204)


@app.delete(
    "/api/v1/sessions",
    status_code=204,
    tags=["Sessions"],
    summary="Revoke all sessions",
    description="Revoke all active sessions for the current user, forcing re-authentication on all devices.",
)
async def revoke_all_sessions(
    request: Request,
    user: User = Depends(require_auth),
    bus: EventBus = Depends(get_event_bus),
):
    """Revoke all sessions for the current user (full logout everywhere)."""
    await _revoke_all_sessions(bus, user.id)
    await _audit(bus, user.id, "user.session_revoke_all", "session", 0, ip=_client_ip(request))
    return Response(status_code=204)


# ===================================================================
# Admin: user lookup (for internal use)
# ===================================================================


@app.get(
    "/api/v1/users/{user_id}",
    response_model=UserOut,
    tags=["Admin"],
    summary="Get user by ID",
    description="Retrieve a user by ID. Requires authentication and either superadmin privileges or matching user ID.",
)
async def get_user(
    user_id: int,
    current_user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Get a user by ID. Requires authentication (superadmin or same user)."""
    if current_user.id != user_id and not current_user.is_superadmin:
        raise HTTPException(status_code=403, detail="Forbidden")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# Run with: uvicorn services.identity_service.app.main:app --port 8010
# ---------------------------------------------------------------------------
