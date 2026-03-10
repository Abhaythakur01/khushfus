"""Reusable FastAPI authentication dependencies for all services."""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from shared.jwt_config import JWT_ALGORITHM, JWT_SECRET_KEY

_security = HTTPBearer(auto_error=False)


async def get_token_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
) -> dict | None:
    """Decode and return JWT payload, or None if no credentials provided."""
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_token(payload: dict | None = Depends(get_token_payload)) -> dict:
    """Require a valid JWT token. Returns the payload or raises 401."""
    if not payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    return payload


def require_role(*allowed_roles: str):
    """Factory for a dependency that checks the user has one of the allowed roles."""
    async def _check_role(payload: dict = Depends(require_token)) -> dict:
        user_role = payload.get("role", "")
        is_superadmin = payload.get("is_superadmin", False)
        if is_superadmin:
            return payload
        if user_role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return payload
    return _check_role
