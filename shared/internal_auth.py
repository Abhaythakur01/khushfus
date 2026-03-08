"""
Inter-service authentication via shared secret token.

Services that expose internal-only endpoints can use ``verify_internal_token``
as a FastAPI dependency to require a valid ``X-Internal-Token`` header.

Usage in a FastAPI router::

    from fastapi import APIRouter, Depends
    from shared.internal_auth import verify_internal_token

    router = APIRouter()

    @router.post("/internal/reindex", dependencies=[Depends(verify_internal_token)])
    async def reindex():
        ...

When making outbound requests to another service, include the header::

    import httpx
    from shared.internal_auth import INTERNAL_TOKEN

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "http://search:8012/internal/reindex",
            headers={"X-Internal-Token": INTERNAL_TOKEN},
        )
"""

import os

from fastapi import Header, HTTPException

INTERNAL_TOKEN: str = os.getenv("INTERNAL_SERVICE_TOKEN", "dev-internal-token")


async def verify_internal_token(x_internal_token: str = Header(...)) -> None:
    """Validate that the caller supplied the correct internal service token."""
    if x_internal_token != INTERNAL_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid internal token")
