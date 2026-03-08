from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.schemas import CollectRequest, ProjectCreate, ProjectOut, ProjectUpdate
from src.config.database import get_db
from src.models.keyword import Keyword
from src.models.project import Project, ProjectStatus
from src.services.worker import collect_project

router = APIRouter()


@router.get("/", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).options(selectinload(Project.keywords)))
    return result.scalars().all()


@router.post("/", response_model=ProjectOut, status_code=201)
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
    await db.refresh(project)

    # Load keywords for response
    result = await db.execute(select(Project).where(Project.id == project.id).options(selectinload(Project.keywords)))
    return result.scalar_one()


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id).options(selectinload(Project.keywords)))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
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


@router.post("/{project_id}/collect")
async def trigger_collection(project_id: int, data: CollectRequest, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    collect_project.delay(project_id, data.hours_back)
    return {"status": "collection_started", "project_id": project_id}


@router.post("/{project_id}/keywords")
async def add_keyword(project_id: int, term: str, keyword_type: str = "brand", db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    keyword = Keyword(project_id=project_id, term=term, keyword_type=keyword_type)
    db.add(keyword)
    await db.commit()
    await db.refresh(keyword)
    return {"id": keyword.id, "term": keyword.term, "keyword_type": keyword.keyword_type}
