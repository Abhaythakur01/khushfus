"""Project-level authorization: verify a user's org owns the requested project.

Usage in any FastAPI service:
    from shared.project_auth import verify_project_access

    @router.get("/projects/{project_id}/data")
    async def get_data(
        project_id: int,
        user: dict = Depends(require_auth),
        db: AsyncSession = Depends(get_db),
    ):
        project = await verify_project_access(db, project_id, user)
        ...
"""

import logging

from fastapi import HTTPException

logger = logging.getLogger(__name__)


async def verify_project_access(db, project_id: int, user: dict):
    """Verify the authenticated user's organization owns the project.

    Args:
        db: AsyncSession
        project_id: The project ID to check
        user: JWT payload dict (must contain 'organization_id' or 'org_id')

    Returns:
        The Project ORM object if access is allowed.

    Raises:
        HTTPException 404 if project not found.
        HTTPException 403 if user's org doesn't match.
    """
    from shared.models import Project

    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Extract user's org from JWT payload
    user_org_id = user.get("organization_id") or user.get("org_id")

    # Superadmins bypass org check
    if user.get("is_superadmin"):
        return project

    if not user_org_id:
        logger.warning(
            "Project access denied: user has no org_id, project=%d", project_id,
        )
        raise HTTPException(status_code=403, detail="Access denied")

    if project.organization_id != int(user_org_id):
        logger.warning(
            "Project access denied: user_org=%s project_org=%s project=%d",
            user_org_id, project.organization_id, project_id,
        )
        raise HTTPException(status_code=403, detail="Access denied")

    return project
