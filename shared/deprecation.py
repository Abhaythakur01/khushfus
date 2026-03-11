"""Deprecation header utilities for API versioning.

Adds RFC 8594 ``Deprecation`` and ``Sunset`` headers to responses for
endpoints that are scheduled for removal.

Usage as a FastAPI dependency::

    from shared.deprecation import deprecation_headers

    @router.get("/old-endpoint", dependencies=[Depends(deprecation_headers("2026-06-01", "2026-12-01"))])
    async def old_endpoint():
        ...
"""

from fastapi import Response
from fastapi.params import Depends


def deprecation_headers(deprecated_date: str, sunset_date: str):
    """Return a FastAPI dependency that sets Deprecation and Sunset headers.

    Args:
        deprecated_date: ISO-8601 date when the endpoint was deprecated (e.g. ``"2026-06-01"``).
        sunset_date: ISO-8601 date after which the endpoint will be removed (e.g. ``"2026-12-01"``).
    """

    async def _add_deprecation_headers(response: Response):
        response.headers["Deprecation"] = deprecated_date
        response.headers["Sunset"] = sunset_date
        response.headers["Link"] = '</api/v2/>; rel="successor-version"'

    return Depends(_add_deprecation_headers)
