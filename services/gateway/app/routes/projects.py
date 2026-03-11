import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.events import EventBus
from shared.models import Keyword, Project, ProjectStatus
from shared.schemas import CollectRequest, ProjectCreate, ProjectOut, ProjectUpdate

from ..collect_pipeline import run_direct_collection
from ..deps import get_db, get_event_bus, get_user_org_id, require_auth

logger = logging.getLogger(__name__)

RESERVED_PROJECT_NAMES = {"admin", "api", "system", "health", "internal", "test"}

router = APIRouter()


@router.get(
    "/",
    response_model=list[ProjectOut],
    summary="List all projects",
    description="Retrieve all projects with their associated keywords (filtered by organization).",
)
async def list_projects(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    org_id = get_user_org_id(request)
    query = select(Project).options(selectinload(Project.keywords))
    if org_id:
        query = query.where(Project.organization_id == org_id)
    query = query.order_by(Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/",
    response_model=ProjectOut,
    status_code=201,
    summary="Create a project",
    description="Create a new social listening project with keywords and target platforms.",
)
async def create_project(
    request: Request, data: ProjectCreate,
    user=Depends(require_auth), db: AsyncSession = Depends(get_db),
):
    org_id = get_user_org_id(request)
    if data.name.strip().lower() in RESERVED_PROJECT_NAMES:
        raise HTTPException(status_code=400, detail=f"Project name '{data.name.strip()}' is reserved")
    project = Project(
        name=data.name,
        description=data.description,
        client_name=data.client_name,
        platforms=data.platforms,
        organization_id=org_id or data.organization_id or 0,
    )
    db.add(project)
    await db.flush()

    for kw in data.keywords:
        db.add(Keyword(project_id=project.id, term=kw.term, keyword_type=kw.keyword_type))

    await db.commit()
    result = await db.execute(select(Project).where(Project.id == project.id).options(selectinload(Project.keywords)))
    return result.scalar_one()


@router.get(
    "/{project_id}",
    response_model=ProjectOut,
    summary="Get project by ID",
    description="Retrieve a single project and its keywords by project ID.",
)
async def get_project(
    project_id: int, request: Request,
    user=Depends(require_auth), db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id).options(selectinload(Project.keywords)))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    org_id = get_user_org_id(request)
    if org_id and project.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch(
    "/{project_id}",
    response_model=ProjectOut,
    summary="Update a project",
    description="Partially update project fields such as name, description, status, or platforms.",
)
async def update_project(
    project_id: int, data: ProjectUpdate, request: Request,
    user=Depends(require_auth), db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    org_id = get_user_org_id(request)
    if org_id and project.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Project not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "status":
            value = ProjectStatus(value)
        setattr(project, field, value)

    await db.commit()
    result = await db.execute(select(Project).where(Project.id == project_id).options(selectinload(Project.keywords)))
    return result.scalar_one()


@router.post(
    "/{project_id}/collect",
    summary="Trigger data collection",
    description="Publish a collection request event so the Collector Service gathers mentions. "
    "Falls back to direct collection (inline in the gateway) when Redis is unavailable.",
)
async def trigger_collection(
    project_id: int,
    data: CollectRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    org_id = get_user_org_id(request)
    if org_id and project.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Project not found")

    # Try Redis event bus first (microservice mode)
    if bus._redis is not None:
        try:
            await bus.publish(
                "collection:request",
                {
                    "project_id": project_id,
                    "hours_back": data.hours_back,
                },
            )
            return {"status": "collection_started", "project_id": project_id, "mode": "distributed"}
        except Exception as e:
            logger.warning(f"Redis publish failed, falling back to direct collection: {e}")

    # Fallback: run collection inline as a background task
    session_factory = request.app.state.db_session
    background_tasks.add_task(
        _run_collection_async,
        session_factory,
        project_id,
        data.hours_back,
    )
    return {"status": "collection_started", "project_id": project_id, "mode": "direct"}


async def _run_collection_async(session_factory, project_id: int, hours_back: int):
    """Wrapper to run the async collection pipeline from a background task."""
    try:
        await run_direct_collection(session_factory, project_id, hours_back)
    except Exception as e:
        logger.error(f"Direct collection failed for project {project_id}: {e}")


@router.post(
    "/{project_id}/keywords",
    summary="Add a keyword",
    description="Add a tracking keyword to a project for social mention collection.",
)
async def add_keyword(
    project_id: int,
    term: str = Query(min_length=1, max_length=200),
    keyword_type: str = Query(default="brand", max_length=50),
    user=Depends(require_auth),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    org_id = get_user_org_id(request)
    if org_id and project.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Project not found")

    keyword = Keyword(project_id=project_id, term=term, keyword_type=keyword_type)
    db.add(keyword)
    await db.commit()
    await db.refresh(keyword)
    return {"id": keyword.id, "term": keyword.term, "keyword_type": keyword.keyword_type}
