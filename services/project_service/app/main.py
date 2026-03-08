"""
Project Service -- project and keyword management for KhushFus.

Responsibilities:
- Project CRUD (create, read, update, soft-delete)
- Keyword management per project (add, remove)
- Scoped by organization_id (from X-Org-Id header)

Long-running FastAPI service on port 8020.
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.database import create_db, init_tables
from shared.models import (
    Keyword,
    Project,
    ProjectStatus,
)
from shared.tracing import setup_tracing

setup_tracing("project")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus",
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class KeywordCreate(BaseModel):
    term: str = Field(min_length=1, max_length=255)
    keyword_type: str = "brand"


class KeywordOut(BaseModel):
    id: int
    term: str
    keyword_type: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    client_name: str = Field(min_length=1, max_length=255)
    platforms: str = "twitter,facebook,instagram,linkedin,youtube"
    competitor_ids: str | None = None
    keywords: list[KeywordCreate] = []


class ProjectUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    client_name: str | None = None
    status: str | None = None
    platforms: str | None = None
    competitor_ids: str | None = None


class ProjectOut(BaseModel):
    id: int
    organization_id: int
    name: str
    description: str | None
    client_name: str
    status: str
    platforms: str
    competitor_ids: str | None
    created_at: datetime
    updated_at: datetime
    keywords: list[KeywordOut] = []
    model_config = {"from_attributes": True}


class ProjectListOut(BaseModel):
    items: list[ProjectOut]
    total: int


# ---------------------------------------------------------------------------
# Lifespan & Dependencies
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine, session_factory = create_db(DATABASE_URL)
    app.state.db_session = session_factory
    await init_tables(engine)
    logger.info("Project Service started")
    yield
    await engine.dispose()


app = FastAPI(
    title="KhushFus Project Service",
    description="Project and keyword management for social listening",
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


try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass


async def get_db() -> AsyncSession:
    async with app.state.db_session() as session:
        yield session


def get_org_id(x_org_id: int = Header(..., alias="X-Org-Id")) -> int:
    """Extract organization ID from the X-Org-Id header."""
    return x_org_id


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "service": "project", "version": "0.1.0"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _project_to_out(project: Project, keywords: list[Keyword] | None = None) -> ProjectOut:
    """Convert a Project ORM object to a ProjectOut schema."""
    kw_list = (
        keywords
        if keywords is not None
        else (project.keywords if hasattr(project, "keywords") and project.keywords else [])
    )
    return ProjectOut(
        id=project.id,
        organization_id=project.organization_id,
        name=project.name,
        description=project.description,
        client_name=project.client_name,
        status=project.status.value if hasattr(project.status, "value") else str(project.status),
        platforms=project.platforms or "",
        competitor_ids=project.competitor_ids,
        created_at=project.created_at,
        updated_at=project.updated_at,
        keywords=[
            KeywordOut(
                id=k.id,
                term=k.term,
                keyword_type=k.keyword_type,
                is_active=k.is_active,
                created_at=k.created_at,
            )
            for k in kw_list
        ],
    )


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------


@app.post("/api/v1/projects", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreateRequest,
    org_id: int = Depends(get_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new project with optional keywords. Requires org_id from header."""
    try:
        project = Project(
            organization_id=org_id,
            name=payload.name,
            description=payload.description,
            client_name=payload.client_name,
            platforms=payload.platforms,
            competitor_ids=payload.competitor_ids,
            status=ProjectStatus.ACTIVE,
        )
        db.add(project)
        await db.flush()

        keywords: list[Keyword] = []
        for kw in payload.keywords:
            keyword = Keyword(
                project_id=project.id,
                term=kw.term,
                keyword_type=kw.keyword_type,
                is_active=True,
            )
            db.add(keyword)
            keywords.append(keyword)

        await db.commit()
        await db.refresh(project)
        for k in keywords:
            await db.refresh(k)

        logger.info(f"Created project '{project.name}' (id={project.id}) for org {org_id}")
        return _project_to_out(project, keywords)

    except Exception as e:
        logger.error(f"Failed to create project: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create project")


@app.get("/api/v1/projects", response_model=ProjectListOut)
async def list_projects(
    org_id: int = Depends(get_org_id),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: str | None = Query(None),
):
    """List projects for an organization."""
    try:
        base_filter = [Project.organization_id == org_id]
        if status:
            try:
                base_filter.append(Project.status == ProjectStatus(status))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

        count_q = select(func.count(Project.id)).where(*base_filter)
        total = (await db.execute(count_q)).scalar() or 0

        result = await db.execute(
            select(Project).where(*base_filter).order_by(Project.created_at.desc()).offset(skip).limit(limit)
        )
        projects = result.scalars().all()

        items = []
        for p in projects:
            kw_result = await db.execute(select(Keyword).where(Keyword.project_id == p.id))
            kws = kw_result.scalars().all()
            items.append(_project_to_out(p, kws))

        return ProjectListOut(items=items, total=total)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list projects: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list projects")


@app.get("/api/v1/projects/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    org_id: int = Depends(get_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Get project detail with keywords."""
    try:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Project not found")

        if project.status == ProjectStatus.ARCHIVED:
            raise HTTPException(status_code=404, detail="Project not found")

        kw_result = await db.execute(select(Keyword).where(Keyword.project_id == project.id))
        keywords = kw_result.scalars().all()

        return _project_to_out(project, keywords)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get project")


@app.put("/api/v1/projects/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    payload: ProjectUpdateRequest,
    org_id: int = Depends(get_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Update project fields."""
    try:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Project not found")

        if project.status == ProjectStatus.ARCHIVED:
            raise HTTPException(status_code=400, detail="Cannot update an archived project")

        if payload.name is not None:
            project.name = payload.name
        if payload.description is not None:
            project.description = payload.description
        if payload.client_name is not None:
            project.client_name = payload.client_name
        if payload.platforms is not None:
            project.platforms = payload.platforms
        if payload.competitor_ids is not None:
            project.competitor_ids = payload.competitor_ids
        if payload.status is not None:
            try:
                project.status = ProjectStatus(payload.status)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid status: {payload.status}")

        await db.commit()
        await db.refresh(project)

        kw_result = await db.execute(select(Keyword).where(Keyword.project_id == project.id))
        keywords = kw_result.scalars().all()

        logger.info(f"Updated project {project_id}")
        return _project_to_out(project, keywords)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update project")


@app.delete("/api/v1/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    org_id: int = Depends(get_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a project by setting status to archived."""
    try:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Project not found")

        project.status = ProjectStatus.ARCHIVED
        await db.commit()

        logger.info(f"Archived project {project_id}")
        return Response(status_code=204)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to archive project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to archive project")


# ---------------------------------------------------------------------------
# Keyword Management
# ---------------------------------------------------------------------------


@app.post("/api/v1/projects/{project_id}/keywords", response_model=KeywordOut, status_code=201)
async def add_keyword(
    project_id: int,
    payload: KeywordCreate,
    org_id: int = Depends(get_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Add a keyword to a project."""
    try:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Project not found")

        if project.status == ProjectStatus.ARCHIVED:
            raise HTTPException(status_code=400, detail="Cannot add keywords to an archived project")

        # Check for duplicate keyword
        existing = await db.execute(
            select(Keyword).where(
                Keyword.project_id == project_id,
                Keyword.term == payload.term,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"Keyword '{payload.term}' already exists for this project")

        keyword = Keyword(
            project_id=project_id,
            term=payload.term,
            keyword_type=payload.keyword_type,
            is_active=True,
        )
        db.add(keyword)
        await db.commit()
        await db.refresh(keyword)

        logger.info(f"Added keyword '{keyword.term}' to project {project_id}")
        return KeywordOut(
            id=keyword.id,
            term=keyword.term,
            keyword_type=keyword.keyword_type,
            is_active=keyword.is_active,
            created_at=keyword.created_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add keyword to project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add keyword")


@app.delete("/api/v1/projects/{project_id}/keywords/{keyword_id}", status_code=204)
async def remove_keyword(
    project_id: int,
    keyword_id: int,
    org_id: int = Depends(get_org_id),
    db: AsyncSession = Depends(get_db),
):
    """Remove a keyword from a project."""
    try:
        project = await db.get(Project, project_id)
        if not project or project.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Project not found")

        keyword = await db.get(Keyword, keyword_id)
        if not keyword or keyword.project_id != project_id:
            raise HTTPException(status_code=404, detail="Keyword not found")

        await db.delete(keyword)
        await db.commit()

        logger.info(f"Removed keyword {keyword_id} from project {project_id}")
        return Response(status_code=204)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove keyword {keyword_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to remove keyword")


# ---------------------------------------------------------------------------
# Run with: uvicorn services.project_service.app.main:app --port 8020
# ---------------------------------------------------------------------------
