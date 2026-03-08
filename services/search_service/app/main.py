"""
Search Service — FastAPI service for full-text search across mentions via Elasticsearch.

Port: 8012
ES index: 'khushfus-mentions' (created by Query Service)

Endpoints:
  POST /search              — full-text search with filters
  POST /search/advanced     — raw Elasticsearch DSL query
  GET  /search/suggest      — autocomplete for keywords/authors
  POST /saved-searches      — create a saved search
  GET  /saved-searches      — list saved searches for a project
  DELETE /saved-searches/{id}
  GET  /search/trending     — trending topics/keywords in a time window
  GET  /search/facets       — faceted counts by platform, sentiment, language
"""

import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any

from elasticsearch import AsyncElasticsearch
from elasticsearch import NotFoundError as ESNotFoundError
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from shared.database import create_db, init_tables
from shared.models import SavedSearch
from shared.tracing import setup_tracing

setup_tracing("search")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://khushfus:khushfus_dev@postgres:5432/khushfus",
)
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
ES_INDEX = "khushfus-mentions"

# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    """Standard search with filters."""

    query: str = Field("", description="Full-text search query (supports Elasticsearch simple_query_string syntax)")
    project_id: int | None = Field(None, description="Filter by project")
    platform: str | None = Field(None, description="Filter by platform (e.g. twitter)")
    sentiment: str | None = Field(None, description="Filter by sentiment (positive/negative/neutral/mixed)")
    language: str | None = Field(None, description="Filter by language code")
    author: str | None = Field(None, description="Filter by author_name or author_handle")
    date_from: datetime | None = Field(None, description="Start of date range (published_at)")
    date_to: datetime | None = Field(None, description="End of date range (published_at)")
    sort_by: str = Field("published_at", description="Field to sort by")
    sort_order: str = Field("desc", description="asc or desc")
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=200)


class SearchHit(BaseModel):
    id: str
    score: float | None = None
    source: dict[str, Any]


class SearchResponse(BaseModel):
    total: int
    page: int
    page_size: int
    hits: list[SearchHit]


class AdvancedSearchRequest(BaseModel):
    """Raw Elasticsearch DSL query body."""

    body: dict[str, Any] = Field(..., description="Full ES query DSL")
    index: str = Field(ES_INDEX, description="ES index to query")


class SuggestResponse(BaseModel):
    suggestions: list[str]


class SavedSearchCreate(BaseModel):
    project_id: int
    user_id: int = 0
    name: str
    query_json: dict[str, Any] = Field(..., description="Serialised search parameters")


class SavedSearchOut(BaseModel):
    id: int
    project_id: int
    user_id: int
    name: str
    query_json: str
    created_at: datetime
    model_config = {"from_attributes": True}


class TrendingItem(BaseModel):
    term: str
    count: int


class TrendingResponse(BaseModel):
    window_hours: int
    items: list[TrendingItem]


class FacetBucket(BaseModel):
    key: str
    count: int


class FacetsResponse(BaseModel):
    platform: list[FacetBucket]
    sentiment: list[FacetBucket]
    language: list[FacetBucket]


# ---------------------------------------------------------------------------
# Lifespan — init DB + ES connections
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine, session_factory = create_db(DATABASE_URL)
    await init_tables(engine)
    es = AsyncElasticsearch(ELASTICSEARCH_URL)

    app.state.db_session = session_factory
    app.state.es = es

    logger.info("Search Service started — ES=%s, index=%s", ELASTICSEARCH_URL, ES_INDEX)
    yield

    await es.close()
    await engine.dispose()
    logger.info("Search Service stopped")


app = FastAPI(
    title="KhushFus Search Service",
    description="Full-text search and analytics over social mentions",
    version="0.1.0",
    lifespan=lifespan,
)

try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_es_query(req: SearchRequest) -> dict:
    """Translate a SearchRequest into an Elasticsearch query body."""
    must: list[dict] = []
    filters: list[dict] = []

    # Full-text query
    if req.query:
        must.append(
            {
                "simple_query_string": {
                    "query": req.query,
                    "fields": ["text^3", "matched_keywords^2", "author_name", "author_handle", "topics"],
                    "default_operator": "AND",
                }
            }
        )

    # Keyword filters
    if req.project_id is not None:
        filters.append({"term": {"project_id": req.project_id}})
    if req.platform:
        filters.append({"term": {"platform": req.platform.lower()}})
    if req.sentiment:
        filters.append({"term": {"sentiment": req.sentiment.lower()}})
    if req.language:
        filters.append({"term": {"language": req.language.lower()}})

    # Author filter (match either name or handle)
    if req.author:
        filters.append(
            {
                "bool": {
                    "should": [
                        {"term": {"author_name": req.author}},
                        {"term": {"author_handle": req.author}},
                    ],
                    "minimum_should_match": 1,
                }
            }
        )

    # Date range
    date_range: dict[str, str] = {}
    if req.date_from:
        date_range["gte"] = req.date_from.isoformat()
    if req.date_to:
        date_range["lte"] = req.date_to.isoformat()
    if date_range:
        filters.append({"range": {"published_at": date_range}})

    body: dict[str, Any] = {
        "query": {
            "bool": {
                "must": must if must else [{"match_all": {}}],
                "filter": filters,
            }
        },
        "sort": [{req.sort_by: {"order": req.sort_order}}],
        "from": (req.page - 1) * req.page_size,
        "size": req.page_size,
        "track_total_hits": True,
    }
    return body


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "service": "search-service", "version": "0.1.0"}


# ---- Full-text search ----


@app.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest):
    """Full-text search with filters across mentions."""
    es: AsyncElasticsearch = app.state.es
    body = _build_es_query(req)

    try:
        resp = await es.search(index=ES_INDEX, body=body)
    except ESNotFoundError:
        raise HTTPException(status_code=503, detail=f"Index '{ES_INDEX}' not found — has the query service created it?")
    except Exception as exc:
        logger.error("ES search error: %s", exc)
        raise HTTPException(status_code=502, detail="Elasticsearch query failed")

    total = resp["hits"]["total"]["value"] if isinstance(resp["hits"]["total"], dict) else resp["hits"]["total"]
    hits = [
        SearchHit(
            id=hit["_id"],
            score=hit.get("_score"),
            source=hit["_source"],
        )
        for hit in resp["hits"]["hits"]
    ]
    return SearchResponse(total=total, page=req.page, page_size=req.page_size, hits=hits)


# ---- Advanced (raw DSL) search ----


@app.post("/search/advanced")
async def search_advanced(req: AdvancedSearchRequest):
    """Execute a raw Elasticsearch DSL query."""
    es: AsyncElasticsearch = app.state.es
    try:
        resp = await es.search(index=req.index, body=req.body)
        return resp.body
    except ESNotFoundError:
        raise HTTPException(status_code=503, detail=f"Index '{req.index}' not found")
    except Exception as exc:
        logger.error("ES advanced search error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Elasticsearch query failed: {exc}")


# ---- Autocomplete / suggest ----


@app.get("/search/suggest", response_model=SuggestResponse)
async def suggest(
    q: str = Query(..., min_length=1, description="Prefix to autocomplete"),
    field: str = Query("text", description="Field to suggest from: text, author_name, author_handle, topics"),
    project_id: int | None = Query(None),
    size: int = Query(10, ge=1, le=50),
):
    """Autocomplete suggestions for keywords or authors."""
    es: AsyncElasticsearch = app.state.es

    allowed_fields = {"text", "author_name", "author_handle", "topics", "matched_keywords"}
    if field not in allowed_fields:
        raise HTTPException(status_code=400, detail=f"field must be one of {allowed_fields}")

    # Use a match_phrase_prefix for flexible prefix matching
    must: list[dict] = [{"match_phrase_prefix": {field: {"query": q, "max_expansions": 50}}}]
    filters: list[dict] = []
    if project_id is not None:
        filters.append({"term": {"project_id": project_id}})

    body: dict[str, Any] = {
        "query": {"bool": {"must": must, "filter": filters}},
        "size": size,
        "_source": [field],
        "highlight": {"fields": {field: {"fragment_size": 100, "number_of_fragments": 1}}},
    }

    try:
        resp = await es.search(index=ES_INDEX, body=body)
    except ESNotFoundError:
        return SuggestResponse(suggestions=[])
    except Exception as exc:
        logger.error("ES suggest error: %s", exc)
        raise HTTPException(status_code=502, detail="Elasticsearch suggest failed")

    seen: set[str] = set()
    suggestions: list[str] = []
    for hit in resp["hits"]["hits"]:
        val = hit["_source"].get(field, "")
        if isinstance(val, str) and val and val not in seen:
            seen.add(val)
            suggestions.append(val)
    return SuggestResponse(suggestions=suggestions[:size])


# ---- Trending topics ----


@app.get("/search/trending", response_model=TrendingResponse)
async def trending(
    project_id: int | None = Query(None),
    hours: int = Query(24, ge=1, le=720, description="Look-back window in hours"),
    size: int = Query(20, ge=1, le=100),
):
    """Trending topics/keywords in a given time window using ES significant_terms aggregation."""
    es: AsyncElasticsearch = app.state.es

    filters: list[dict] = [
        {"range": {"published_at": {"gte": (datetime.utcnow() - timedelta(hours=hours)).isoformat()}}},
    ]
    if project_id is not None:
        filters.append({"term": {"project_id": project_id}})

    body: dict[str, Any] = {
        "size": 0,
        "query": {"bool": {"filter": filters}},
        "aggs": {
            "trending_topics": {
                "significant_terms": {
                    "field": "topics",
                    "size": size,
                }
            },
            "trending_keywords": {
                "significant_terms": {
                    "field": "matched_keywords",
                    "size": size,
                }
            },
        },
    }

    try:
        resp = await es.search(index=ES_INDEX, body=body)
    except ESNotFoundError:
        return TrendingResponse(window_hours=hours, items=[])
    except Exception as exc:
        logger.error("ES trending error: %s", exc)
        raise HTTPException(status_code=502, detail="Elasticsearch trending query failed")

    # Merge both aggregation results
    items_map: dict[str, int] = {}
    for agg_name in ("trending_topics", "trending_keywords"):
        buckets = resp.get("aggregations", {}).get(agg_name, {}).get("buckets", [])
        for bucket in buckets:
            key = bucket["key"]
            doc_count = bucket["doc_count"]
            items_map[key] = items_map.get(key, 0) + doc_count

    items = sorted(
        [TrendingItem(term=k, count=v) for k, v in items_map.items()],
        key=lambda x: x.count,
        reverse=True,
    )[:size]

    return TrendingResponse(window_hours=hours, items=items)


# ---- Faceted counts ----


@app.get("/search/facets", response_model=FacetsResponse)
async def facets(
    q: str = Query("", description="Optional full-text query to scope facets"),
    project_id: int | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
):
    """Faceted counts by platform, sentiment, and language for a query."""
    es: AsyncElasticsearch = app.state.es

    must: list[dict] = []
    filters: list[dict] = []

    if q:
        must.append({"simple_query_string": {"query": q, "fields": ["text", "matched_keywords", "topics"]}})

    if project_id is not None:
        filters.append({"term": {"project_id": project_id}})

    date_range: dict[str, str] = {}
    if date_from:
        date_range["gte"] = date_from.isoformat()
    if date_to:
        date_range["lte"] = date_to.isoformat()
    if date_range:
        filters.append({"range": {"published_at": date_range}})

    body: dict[str, Any] = {
        "size": 0,
        "query": {
            "bool": {
                "must": must if must else [{"match_all": {}}],
                "filter": filters,
            }
        },
        "aggs": {
            "by_platform": {"terms": {"field": "platform", "size": 30}},
            "by_sentiment": {"terms": {"field": "sentiment", "size": 10}},
            "by_language": {"terms": {"field": "language", "size": 50}},
        },
    }

    try:
        resp = await es.search(index=ES_INDEX, body=body)
    except ESNotFoundError:
        return FacetsResponse(platform=[], sentiment=[], language=[])
    except Exception as exc:
        logger.error("ES facets error: %s", exc)
        raise HTTPException(status_code=502, detail="Elasticsearch facets query failed")

    def _extract_buckets(agg_name: str) -> list[FacetBucket]:
        return [
            FacetBucket(key=b["key"], count=b["doc_count"])
            for b in resp.get("aggregations", {}).get(agg_name, {}).get("buckets", [])
        ]

    return FacetsResponse(
        platform=_extract_buckets("by_platform"),
        sentiment=_extract_buckets("by_sentiment"),
        language=_extract_buckets("by_language"),
    )


# ---- Saved searches (CRUD) ----


@app.post("/saved-searches", response_model=SavedSearchOut, status_code=201)
async def create_saved_search(req: SavedSearchCreate):
    """Create a saved search."""
    session_factory = app.state.db_session
    async with session_factory() as db:
        obj = SavedSearch(
            project_id=req.project_id,
            user_id=req.user_id,
            name=req.name,
            query_json=json.dumps(req.query_json),
        )
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        return obj


@app.get("/saved-searches", response_model=list[SavedSearchOut])
async def list_saved_searches(
    project_id: int = Query(..., description="Project to list saved searches for"),
):
    """List saved searches for a project."""
    session_factory = app.state.db_session
    async with session_factory() as db:
        result = await db.execute(
            select(SavedSearch).where(SavedSearch.project_id == project_id).order_by(SavedSearch.created_at.desc())
        )
        return result.scalars().all()


@app.delete("/saved-searches/{search_id}", status_code=204)
async def delete_saved_search(search_id: int):
    """Delete a saved search by ID."""
    session_factory = app.state.db_session
    async with session_factory() as db:
        result = await db.execute(select(SavedSearch).where(SavedSearch.id == search_id))
        obj = result.scalar_one_or_none()
        if not obj:
            raise HTTPException(status_code=404, detail="Saved search not found")
        await db.execute(delete(SavedSearch).where(SavedSearch.id == search_id))
        await db.commit()
    return None
