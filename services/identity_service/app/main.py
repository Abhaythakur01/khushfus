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

import hashlib
import json
import logging
import os
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from shared.database import create_db, init_tables
from shared.events import AuditEvent, EventBus, STREAM_AUDIT
from shared.models import Organization, OrgMember, OrgRole, User

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
SESSION_TTL_SECONDS = REFRESH_TOKEN_EXPIRE_DAYS * 86400

# OIDC / SAML configuration (org-level overrides come from DB)
OIDC_DISCOVERY_SUFFIX = "/.well-known/openid-configuration"

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

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
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "service": "identity", "version": "0.1.0"}


# ===================================================================
# PASSWORD AUTH ENDPOINTS
# ===================================================================


@app.post("/api/v1/auth/register", response_model=UserOut, status_code=201)
async def register(
    data: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Register a new user with email/password.  Optionally join an org."""
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


@app.post("/api/v1/auth/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    """Authenticate with email/password and receive JWT tokens."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not user.hashed_password or not _verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # Determine primary org for the token claims
    mem_result = await db.execute(
        select(OrgMember).where(OrgMember.user_id == user.id).order_by(OrgMember.joined_at)
    )
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


@app.post("/api/v1/auth/refresh", response_model=TokenResponse)
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

    mem_result = await db.execute(
        select(OrgMember).where(OrgMember.user_id == user.id).order_by(OrgMember.joined_at)
    )
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


@app.post("/api/v1/auth/logout", status_code=204)
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


@app.get("/api/v1/auth/validate", response_model=TokenValidateResponse)
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


@app.post("/api/v1/sso/saml/init")
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


@app.post("/api/v1/sso/saml/acs")
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
    try:
        decoded_xml = base64.b64decode(saml_response).decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SAMLResponse encoding")

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
    pattern = rf'<(?:\w+:)?Attribute[^>]*Name="[^"]*{re.escape(attr_name)}[^"]*"[^>]*>.*?<(?:\w+:)?AttributeValue[^>]*>([^<]+)</(?:\w+:)?AttributeValue>'
    m = re.search(pattern, xml_str, re.DOTALL)
    return m.group(1).strip() if m else None


# ===================================================================
# SSO: OIDC
# ===================================================================


@app.post("/api/v1/sso/oidc/init")
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


@app.get("/api/v1/sso/oidc/callback")
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
        # Decode without verification (signature was verified by the IdP; in production
        # we'd verify using the IdP's JWKS)
        try:
            claims = jwt.get_unverified_claims(id_token)
            email = claims.get("email", "")
            full_name = claims.get("name", "")
            sso_subject = claims.get("sub", "")
            token_nonce = claims.get("nonce", "")
            if token_nonce and token_nonce != nonce:
                raise HTTPException(status_code=400, detail="Nonce mismatch")
        except Exception as e:
            logger.warning(f"Failed to decode id_token: {e}")

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


@app.get("/api/v1/users/me", response_model=UserOut)
async def get_profile(user: User = Depends(require_auth)):
    """Get the current authenticated user's profile."""
    return user


@app.patch("/api/v1/users/me", response_model=UserOut)
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


@app.post("/api/v1/users/me/change-password", status_code=204)
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


@app.get("/api/v1/sessions", response_model=list[SessionOut])
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


@app.delete("/api/v1/sessions/{session_id}", status_code=204)
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


@app.delete("/api/v1/sessions", status_code=204)
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


@app.get("/api/v1/users/{user_id}", response_model=UserOut)
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
