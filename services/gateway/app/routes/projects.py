from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from shared.events import EventBus
from shared.models import Keyword, Project, ProjectStatus
from shared.schemas import CollectRequest, ProjectCreate, ProjectOut, ProjectUpdate

from ..deps import get_db, get_event_bus

router = APIRouter()


@router.get(
    "/",
    response_model=list[ProjectOut],
    summary="List all projects",
    description="Retrieve all projects with their associated keywords.",
)
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).options(selectinload(Project.keywords)))
    return result.scalars().all()


@router.post(
    "/",
    response_model=ProjectOut,
    status_code=201,
    summary="Create a project",
    description="Create a new social listening project with keywords and target platforms.",
)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(
        name=data.name,
        description=data.description,
        client_name=data.client_name,
        platforms=data.platforms,
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
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id).options(selectinload(Project.keywords)))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch(
    "/{project_id}",
    response_model=ProjectOut,
    summary="Update a project",
    description="Partially update project fields such as name, description, status, or platforms.",
)
async def update_project(project_id: int, data: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
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
    description="Publish a collection request event so the Collector Service gathers mentions.",
)
async def trigger_collection(
    project_id: int,
    data: CollectRequest,
    db: AsyncSession = Depends(get_db),
    bus: EventBus = Depends(get_event_bus),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Publish collection request event — Collector Service picks it up
    await bus.publish(
        "collection:request",
        {
            "project_id": project_id,
            "hours_back": data.hours_back,
        },
    )
    return {"status": "collection_started", "project_id": project_id}


@router.post(
    "/{project_id}/keywords",
    summary="Add a keyword",
    description="Add a tracking keyword to a project for social mention collection.",
)
async def add_keyword(project_id: int, term: str, keyword_type: str = "brand", db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    keyword = Keyword(project_id=project_id, term=term, keyword_type=keyword_type)
    db.add(keyword)
    await db.commit()
    await db.refresh(keyword)
    return {"id": keyword.id, "term": keyword.term, "keyword_type": keyword.keyword_type}
