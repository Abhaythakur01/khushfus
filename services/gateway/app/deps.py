"""Shared dependencies for gateway routes."""

import os
import sys
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.database import set_tenant_context
from shared.events import EventBus
from shared.models import OrgMember, User

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
if not SECRET_KEY and os.getenv("ENVIRONMENT") == "production":
    print("FATAL: JWT_SECRET_KEY not set in production", file=sys.stderr)
    sys.exit(1)
if not SECRET_KEY:
    SECRET_KEY = "dev-secret-change-in-production"

ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_db(request: Request) -> AsyncSession:
    async with request.app.state.db_session() as session:
        # RLS tenant context is set by get_current_user after JWT validation,
        # so there is no need to repeat it here.
        yield session


def get_event_bus(request: Request) -> EventBus | None:
    bus = request.app.state.event_bus
    # Return None if the bus exists but has no active Redis connection
    if bus and getattr(bus, "_redis", None) is None:
        return None
    return bus


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Extract and validate JWT. Returns None if no token (for public endpoints)."""
    if not credentials:
        return None

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        raw_sub = payload.get("sub")
        if raw_sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id = int(raw_sub)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Store user on request state for tenant context
    request.state._current_user = user

    # Look up user's primary org for RLS
    membership = (
        await db.execute(
            select(OrgMember.organization_id)
            .where(OrgMember.user_id == user.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if membership:
        request.state._org_id = membership
        await set_tenant_context(db, membership)

    return user


async def require_auth(user: User | None = Depends(get_current_user)) -> User:
    """Require authenticated user."""
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


def get_user_org_id(request: Request) -> int | None:
    """Return the authenticated user's organization_id from request state."""
    return getattr(request.state, "_org_id", None)
