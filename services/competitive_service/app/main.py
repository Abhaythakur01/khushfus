"""
Competitive Intelligence Service — benchmarking and competitive analysis.

Provides endpoints to compare a project against its competitors:
- Share of voice calculation
- Sentiment comparison across brands
- Engagement metrics comparison
- Trending keywords/topics per brand
- Historical benchmark storage and retrieval

Port: 8016
"""

import json
import logging
import os
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import Depends, FastAPI, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.database import create_db, init_tables
from shared.models import (
    CompetitorBenchmark,
    Mention,
    Project,
    Sentiment,
)
from shared.tracing import setup_tracing

setup_tracing("competitive")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class BrandMetrics(BaseModel):
    project_id: int
    project_name: str
    mention_count: int
    share_of_voice: float
    sentiment_breakdown: dict[str, int]
    avg_sentiment_score: float
    total_likes: int
    total_shares: int
    total_comments: int
    total_reach: int
    trending_keywords: list[dict[str, int]]


class BenchmarkResponse(BaseModel):
    project_id: int
    period_start: str
    period_end: str
    brands: list[BrandMetrics]


class SOVEntry(BaseModel):
    project_id: int
    project_name: str
    mention_count: int
    share_of_voice: float


class SOVResponse(BaseModel):
    project_id: int
    days: int
    period_start: str
    period_end: str
    breakdown: list[SOVEntry]


class SentimentComparisonEntry(BaseModel):
    project_id: int
    project_name: str
    positive: int
    negative: int
    neutral: int
    mixed: int
    avg_score: float


class SentimentComparisonResponse(BaseModel):
    project_id: int
    days: int
    brands: list[SentimentComparisonEntry]


class TrendingEntry(BaseModel):
    project_id: int
    project_name: str
    keywords: list[dict[str, int]]
    topics: list[dict[str, int]]


class TrendingComparisonResponse(BaseModel):
    project_id: int
    brands: list[TrendingEntry]


class BenchmarkRecordOut(BaseModel):
    id: int
    project_id: int
    competitor_project_id: int
    period_start: str
    period_end: str
    data_json: str
    created_at: str
    model_config = {"from_attributes": True}


class GenerateResponse(BaseModel):
    benchmark_ids: list[int]
    message: str


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "competitive-intelligence"
    version: str = "0.1.0"


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine, session_factory = create_db(DATABASE_URL)
    app.state.db_session = session_factory
    await init_tables(engine)
    yield
    await engine.dispose()


app = FastAPI(
    title="KhushFus Competitive Intelligence Service",
    description="Benchmarking and competitive analysis for social listening",
    version="0.1.0",
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "Benchmarks", "description": "Competitive benchmarking and analysis endpoints."},
        {"name": "Health", "description": "Service health check."},
    ],
    lifespan=lifespan,
)


try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass


async def get_db():
    async with app.state.db_session() as session:
        yield session


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_competitor_ids(project: Project) -> list[int]:
    """Parse comma-separated competitor_ids string into list of ints."""
    if not project.competitor_ids:
        return []
    ids = []
    for part in project.competitor_ids.split(","):
        part = part.strip()
        if part.isdigit():
            ids.append(int(part))
    return ids


async def _get_project_or_404(db: AsyncSession, project_id: int) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    return project


async def _aggregate_brand_metrics(
    db: AsyncSession,
    project_id: int,
    project_name: str,
    start: datetime,
    end: datetime,
) -> dict:
    """Build full metrics dict for a single brand/project within a date window."""
    base_filters = [
        Mention.project_id == project_id,
        Mention.collected_at >= start,
        Mention.collected_at <= end,
    ]

    # Mention count
    mention_count = (await db.execute(select(func.count(Mention.id)).where(*base_filters))).scalar() or 0

    # Sentiment breakdown
    sentiment_breakdown: dict[str, int] = {}
    for s in Sentiment:
        cnt = (
            await db.execute(select(func.count(Mention.id)).where(*base_filters, Mention.sentiment == s))
        ).scalar() or 0
        sentiment_breakdown[s.value] = cnt

    # Average sentiment score
    avg_score = (await db.execute(select(func.avg(Mention.sentiment_score)).where(*base_filters))).scalar() or 0.0

    # Engagement totals
    eng = (
        await db.execute(
            select(
                func.coalesce(func.sum(Mention.likes), 0),
                func.coalesce(func.sum(Mention.shares), 0),
                func.coalesce(func.sum(Mention.comments), 0),
                func.coalesce(func.sum(Mention.reach), 0),
            ).where(*base_filters)
        )
    ).one()

    # Keyword frequency (top 20)
    kw_rows = await db.execute(
        select(Mention.matched_keywords).where(*base_filters, Mention.matched_keywords.isnot(None))
    )
    kw_counter: Counter = Counter()
    for row in kw_rows.scalars():
        for kw in row.split(","):
            kw = kw.strip()
            if kw:
                kw_counter[kw] += 1
    trending_keywords = [{kw: cnt} for kw, cnt in kw_counter.most_common(20)]

    # Topics frequency (top 20)
    topic_rows = await db.execute(select(Mention.topics).where(*base_filters, Mention.topics.isnot(None)))
    topic_counter: Counter = Counter()
    for row in topic_rows.scalars():
        for t in row.split(","):
            t = t.strip()
            if t:
                topic_counter[t] += 1
    trending_topics = [{t: cnt} for t, cnt in topic_counter.most_common(20)]

    return {
        "project_id": project_id,
        "project_name": project_name,
        "mention_count": mention_count,
        "sentiment_breakdown": sentiment_breakdown,
        "avg_sentiment_score": round(float(avg_score), 4),
        "total_likes": eng[0],
        "total_shares": eng[1],
        "total_comments": eng[2],
        "total_reach": eng[3],
        "trending_keywords": trending_keywords,
        "trending_topics": trending_topics,
    }


async def _collect_all_brand_metrics(
    db: AsyncSession,
    project: Project,
    competitor_ids: list[int],
    start: datetime,
    end: datetime,
) -> list[dict]:
    """Gather metrics for the main project and all competitors."""
    all_ids = [project.id] + competitor_ids

    # Pre-fetch competitor project names
    name_map: dict[int, str] = {project.id: project.name}
    if competitor_ids:
        result = await db.execute(select(Project.id, Project.name).where(Project.id.in_(competitor_ids)))
        for row in result:
            name_map[row.id] = row.name

    brands: list[dict] = []
    for pid in all_ids:
        pname = name_map.get(pid, f"Project {pid}")
        metrics = await _aggregate_brand_metrics(db, pid, pname, start, end)
        brands.append(metrics)

    # Calculate share of voice
    total_mentions = sum(b["mention_count"] for b in brands)
    for b in brands:
        if total_mentions > 0:
            b["share_of_voice"] = round(b["mention_count"] / total_mentions * 100, 2)
        else:
            b["share_of_voice"] = 0.0

    return brands


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get(
    "/health",
    tags=["Health"],
    summary="Competitive health check",
    description="Returns the health status of the Competitive Intelligence service and its dependencies.",
)
async def health():
    from shared.health import build_health_response, check_postgres

    checks = {"postgres": await check_postgres(database_url=DATABASE_URL)}
    return await build_health_response("competitive-intelligence", checks=checks)


@app.get(
    "/benchmark/{project_id}",
    response_model=BenchmarkResponse,
    tags=["Benchmarks"],
    summary="Full competitive benchmark",
    description="Full competitive benchmark: share of voice, sentiment, engagement, and trending keywords.",
)
async def get_benchmark(
    project_id: int,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """
    Full competitive benchmark: share of voice, sentiment comparison,
    engagement comparison, and trending keywords for the project
    and all its configured competitors.
    """
    project = await _get_project_or_404(db, project_id)
    competitor_ids = _parse_competitor_ids(project)

    end = datetime.utcnow()
    start = end - timedelta(days=days)

    brands = await _collect_all_brand_metrics(db, project, competitor_ids, start, end)

    return BenchmarkResponse(
        project_id=project_id,
        period_start=start.isoformat(),
        period_end=end.isoformat(),
        brands=[
            BrandMetrics(
                project_id=b["project_id"],
                project_name=b["project_name"],
                mention_count=b["mention_count"],
                share_of_voice=b["share_of_voice"],
                sentiment_breakdown=b["sentiment_breakdown"],
                avg_sentiment_score=b["avg_sentiment_score"],
                total_likes=b["total_likes"],
                total_shares=b["total_shares"],
                total_comments=b["total_comments"],
                total_reach=b["total_reach"],
                trending_keywords=b["trending_keywords"],
            )
            for b in brands
        ],
    )


@app.get(
    "/benchmark/{project_id}/share-of-voice",
    response_model=SOVResponse,
    tags=["Benchmarks"],
    summary="Share of voice breakdown",
    description="Calculate share of voice as a percentage of total mentions across the project and its competitors.",
)
async def share_of_voice(
    project_id: int,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Dedicated share-of-voice breakdown across project and competitors."""
    project = await _get_project_or_404(db, project_id)
    competitor_ids = _parse_competitor_ids(project)

    end = datetime.utcnow()
    start = end - timedelta(days=days)

    all_ids = [project.id] + competitor_ids

    # Fetch project names
    name_map: dict[int, str] = {project.id: project.name}
    if competitor_ids:
        result = await db.execute(select(Project.id, Project.name).where(Project.id.in_(competitor_ids)))
        for row in result:
            name_map[row.id] = row.name

    # Mention counts per brand
    counts: list[tuple[int, str, int]] = []
    for pid in all_ids:
        cnt = (
            await db.execute(
                select(func.count(Mention.id)).where(
                    Mention.project_id == pid,
                    Mention.collected_at >= start,
                    Mention.collected_at <= end,
                )
            )
        ).scalar() or 0
        counts.append((pid, name_map.get(pid, f"Project {pid}"), cnt))

    total = sum(c[2] for c in counts)

    breakdown = [
        SOVEntry(
            project_id=pid,
            project_name=pname,
            mention_count=cnt,
            share_of_voice=round(cnt / total * 100, 2) if total > 0 else 0.0,
        )
        for pid, pname, cnt in counts
    ]

    return SOVResponse(
        project_id=project_id,
        days=days,
        period_start=start.isoformat(),
        period_end=end.isoformat(),
        breakdown=breakdown,
    )


@app.get(
    "/benchmark/{project_id}/sentiment-comparison",
    response_model=SentimentComparisonResponse,
    tags=["Benchmarks"],
    summary="Sentiment comparison",
    description="Compare sentiment distribution and average scores across the project and its competitors.",
)
async def sentiment_comparison(
    project_id: int,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Sentiment comparison chart data across project and competitors."""
    project = await _get_project_or_404(db, project_id)
    competitor_ids = _parse_competitor_ids(project)

    end = datetime.utcnow()
    start = end - timedelta(days=days)

    all_ids = [project.id] + competitor_ids

    # Pre-fetch names
    name_map: dict[int, str] = {project.id: project.name}
    if competitor_ids:
        result = await db.execute(select(Project.id, Project.name).where(Project.id.in_(competitor_ids)))
        for row in result:
            name_map[row.id] = row.name

    brands: list[SentimentComparisonEntry] = []
    for pid in all_ids:
        base_filters = [
            Mention.project_id == pid,
            Mention.collected_at >= start,
            Mention.collected_at <= end,
        ]

        sentiment_counts: dict[str, int] = {}
        for s in Sentiment:
            cnt = (
                await db.execute(select(func.count(Mention.id)).where(*base_filters, Mention.sentiment == s))
            ).scalar() or 0
            sentiment_counts[s.value] = cnt

        avg_score = (await db.execute(select(func.avg(Mention.sentiment_score)).where(*base_filters))).scalar() or 0.0

        brands.append(
            SentimentComparisonEntry(
                project_id=pid,
                project_name=name_map.get(pid, f"Project {pid}"),
                positive=sentiment_counts.get("positive", 0),
                negative=sentiment_counts.get("negative", 0),
                neutral=sentiment_counts.get("neutral", 0),
                mixed=sentiment_counts.get("mixed", 0),
                avg_score=round(float(avg_score), 4),
            )
        )

    return SentimentComparisonResponse(
        project_id=project_id,
        days=days,
        brands=brands,
    )


@app.get(
    "/benchmark/{project_id}/trending",
    response_model=TrendingComparisonResponse,
    tags=["Benchmarks"],
    summary="Trending comparison",
    description="Compare trending topics and keywords between the project and its competitors.",
)
async def trending_comparison(
    project_id: int,
    days: int = Query(30, ge=1, le=365),
    top_n: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Trending topics and keywords comparison between brand and competitors."""
    project = await _get_project_or_404(db, project_id)
    competitor_ids = _parse_competitor_ids(project)

    end = datetime.utcnow()
    start = end - timedelta(days=days)

    all_ids = [project.id] + competitor_ids

    # Pre-fetch names
    name_map: dict[int, str] = {project.id: project.name}
    if competitor_ids:
        result = await db.execute(select(Project.id, Project.name).where(Project.id.in_(competitor_ids)))
        for row in result:
            name_map[row.id] = row.name

    brands: list[TrendingEntry] = []
    for pid in all_ids:
        base_filters = [
            Mention.project_id == pid,
            Mention.collected_at >= start,
            Mention.collected_at <= end,
        ]

        # Keywords
        kw_rows = await db.execute(
            select(Mention.matched_keywords).where(*base_filters, Mention.matched_keywords.isnot(None))
        )
        kw_counter: Counter = Counter()
        for row in kw_rows.scalars():
            for kw in row.split(","):
                kw = kw.strip()
                if kw:
                    kw_counter[kw] += 1

        # Topics
        topic_rows = await db.execute(select(Mention.topics).where(*base_filters, Mention.topics.isnot(None)))
        topic_counter: Counter = Counter()
        for row in topic_rows.scalars():
            for t in row.split(","):
                t = t.strip()
                if t:
                    topic_counter[t] += 1

        brands.append(
            TrendingEntry(
                project_id=pid,
                project_name=name_map.get(pid, f"Project {pid}"),
                keywords=[{kw: cnt} for kw, cnt in kw_counter.most_common(top_n)],
                topics=[{t: cnt} for t, cnt in topic_counter.most_common(top_n)],
            )
        )

    return TrendingComparisonResponse(project_id=project_id, brands=brands)


@app.post(
    "/benchmark/{project_id}/generate",
    response_model=GenerateResponse,
    tags=["Benchmarks"],
    summary="Generate benchmark records",
    description="Calculate and store benchmark records for each competitor as a landscape snapshot.",
)
async def generate_benchmark(
    project_id: int,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Generate and store CompetitorBenchmark records for each competitor."""
    project = await _get_project_or_404(db, project_id)
    competitor_ids = _parse_competitor_ids(project)

    if not competitor_ids:
        raise HTTPException(
            status_code=400,
            detail="No competitors configured for this project. Set competitor_ids on the project first.",
        )

    end = datetime.utcnow()
    start = end - timedelta(days=days)

    brands = await _collect_all_brand_metrics(db, project, competitor_ids, start, end)
    brands_by_id = {b["project_id"]: b for b in brands}

    benchmark_ids: list[int] = []
    own_metrics = brands_by_id.get(project_id, {})

    for comp_id in competitor_ids:
        comp_metrics = brands_by_id.get(comp_id, {})

        data = {
            "own": own_metrics,
            "competitor": comp_metrics,
            "share_of_voice": {
                "own": own_metrics.get("share_of_voice", 0),
                "competitor": comp_metrics.get("share_of_voice", 0),
            },
            "sentiment_comparison": {
                "own_avg": own_metrics.get("avg_sentiment_score", 0),
                "competitor_avg": comp_metrics.get("avg_sentiment_score", 0),
                "own_breakdown": own_metrics.get("sentiment_breakdown", {}),
                "competitor_breakdown": comp_metrics.get("sentiment_breakdown", {}),
            },
            "engagement_comparison": {
                "own": {
                    "likes": own_metrics.get("total_likes", 0),
                    "shares": own_metrics.get("total_shares", 0),
                    "comments": own_metrics.get("total_comments", 0),
                    "reach": own_metrics.get("total_reach", 0),
                },
                "competitor": {
                    "likes": comp_metrics.get("total_likes", 0),
                    "shares": comp_metrics.get("total_shares", 0),
                    "comments": comp_metrics.get("total_comments", 0),
                    "reach": comp_metrics.get("total_reach", 0),
                },
            },
        }

        benchmark = CompetitorBenchmark(
            project_id=project_id,
            competitor_project_id=comp_id,
            period_start=start,
            period_end=end,
            data_json=json.dumps(data, default=str),
        )
        db.add(benchmark)
        await db.flush()
        benchmark_ids.append(benchmark.id)

    await db.commit()

    logger.info(f"Generated {len(benchmark_ids)} benchmark records for project {project_id}")
    return GenerateResponse(
        benchmark_ids=benchmark_ids,
        message=f"Generated {len(benchmark_ids)} benchmark records for {days}-day period.",
    )


@app.get(
    "/benchmark/{project_id}/history",
    response_model=list[BenchmarkRecordOut],
    tags=["Benchmarks"],
    summary="Benchmark history",
    description="List past benchmark records for a project, optionally filtered by a specific competitor.",
)
async def benchmark_history(
    project_id: int,
    competitor_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List past benchmark records for a project, optionally filtered by competitor."""
    await _get_project_or_404(db, project_id)

    stmt = (
        select(CompetitorBenchmark)
        .where(CompetitorBenchmark.project_id == project_id)
        .order_by(CompetitorBenchmark.created_at.desc())
    )

    if competitor_id is not None:
        stmt = stmt.where(CompetitorBenchmark.competitor_project_id == competitor_id)

    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        BenchmarkRecordOut(
            id=r.id,
            project_id=r.project_id,
            competitor_project_id=r.competitor_project_id,
            period_start=r.period_start.isoformat(),
            period_end=r.period_end.isoformat(),
            data_json=r.data_json,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]
