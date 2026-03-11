"""
Search Service — FastAPI service for full-text search across mentions via OpenSearch.

Port: 8012
ES index: 'khushfus-mentions' (created by Query Service)

Endpoints:
  POST /search              — full-text search with filters
  POST /search/advanced     — raw OpenSearch DSL query
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

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from jose import jwt as jose_jwt
from opensearchpy import AsyncOpenSearch
from opensearchpy import NotFoundError as ESNotFoundError
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from shared.database import create_db, init_tables
from shared.models import Mention, SavedSearch
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
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://opensearch:9200")
ES_INDEX = "khushfus-mentions"

# ---------------------------------------------------------------------------
# JWT Authentication
# ---------------------------------------------------------------------------

_security = HTTPBearer(auto_error=False)
_JWT_SECRET = os.getenv("JWT_SECRET_KEY", "")
_JWT_ALGO = "HS256"


async def require_auth(cred: HTTPAuthorizationCredentials | None = Depends(_security)) -> dict:
    if not cred:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = jose_jwt.decode(cred.credentials, _JWT_SECRET, algorithms=[_JWT_ALGO])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    """Standard search with filters."""

    query: str = Field("", description="Full-text search query (supports OpenSearch simple_query_string syntax)")
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
    """Raw OpenSearch DSL query body."""

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
    es = AsyncOpenSearch(hosts=[ELASTICSEARCH_URL])

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
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "Search", "description": "Full-text and advanced OpenSearch queries."},
        {"name": "Suggest", "description": "Autocomplete and suggestion endpoints."},
        {"name": "Analytics", "description": "Trending topics and faceted counts."},
        {"name": "Saved Searches", "description": "CRUD for saved search configurations."},
        {"name": "Health", "description": "Service health check."},
    ],
    lifespan=lifespan,
)

try:
    from shared.request_logging import RequestLoggingMiddleware

    app.add_middleware(RequestLoggingMiddleware, service_name="search")
except ImportError:
    pass

try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass

v1_router = APIRouter(prefix="/api/v1")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_es_query(req: SearchRequest) -> dict:
    """Translate a SearchRequest into an OpenSearch query body."""
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
# Postgres fallback for basic text search when OpenSearch is unavailable
# ---------------------------------------------------------------------------


async def _postgres_text_search(req: SearchRequest, session_factory) -> SearchResponse:
    """Fall back to SQL LIKE queries on the mentions table when OpenSearch index is missing."""
    from sqlalchemy import and_, func, or_

    conditions = []
    if req.query:
        like_pat = f"%{req.query}%"
        conditions.append(
            or_(
                Mention.text.ilike(like_pat),
                Mention.matched_keywords.ilike(like_pat),
                Mention.author_name.ilike(like_pat),
                Mention.author_handle.ilike(like_pat),
            )
        )
    if req.project_id is not None:
        conditions.append(Mention.project_id == req.project_id)
    if req.platform:
        conditions.append(Mention.platform == req.platform.lower())
    if req.sentiment:
        conditions.append(Mention.sentiment == req.sentiment.lower())
    if req.language:
        conditions.append(Mention.language == req.language.lower())
    if req.author:
        conditions.append(
            or_(Mention.author_name == req.author, Mention.author_handle == req.author)
        )
    if req.date_from:
        conditions.append(Mention.published_at >= req.date_from)
    if req.date_to:
        conditions.append(Mention.published_at <= req.date_to)

    where_clause = and_(*conditions) if conditions else True

    async with session_factory() as db:
        count_result = await db.execute(select(func.count(Mention.id)).where(where_clause))
        total = count_result.scalar() or 0

        sort_col = getattr(Mention, req.sort_by, Mention.published_at)
        order = sort_col.desc() if req.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(Mention)
            .where(where_clause)
            .order_by(order)
            .offset((req.page - 1) * req.page_size)
            .limit(req.page_size)
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()

    hits = [
        SearchHit(
            id=str(row.id),
            score=None,
            source={
                "text": row.text,
                "platform": row.platform.value if hasattr(row.platform, "value") else str(row.platform),
                "sentiment": row.sentiment.value if hasattr(row.sentiment, "value") else str(row.sentiment),
                "author_name": row.author_name,
                "author_handle": row.author_handle,
                "published_at": row.published_at.isoformat() if row.published_at else None,
            },
        )
        for row in rows
    ]
    return SearchResponse(total=total, page=req.page, page_size=req.page_size, hits=hits)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get(
    "/health",
    tags=["Health"],
    summary="Search health check",
    description="Returns the health status of the Search service and its dependencies.",
)
async def health():
    from shared.health import build_health_response, check_elasticsearch, check_postgres

    checks = {
        "postgres": await check_postgres(database_url=DATABASE_URL),
        "elasticsearch": await check_elasticsearch(ELASTICSEARCH_URL),
    }
    return await build_health_response("search-service", checks=checks)


# ---- Full-text search ----


@v1_router.post(
    "/search",
    response_model=SearchResponse,
    tags=["Search"],
    summary="Full-text search",
    description="Search mentions with full-text queries and filters for platform, sentiment, and more.",
)
async def search(req: SearchRequest, user: dict = Depends(require_auth)):
    """Full-text search with filters across mentions."""
    user_id = user.get("sub", user.get("user_id", "unknown"))
    logger.info(
        "search_query user_id=%s query=%r project_id=%s platform=%s sentiment=%s",
        user_id, req.query, req.project_id, req.platform, req.sentiment,
    )
    es: AsyncOpenSearch = app.state.es
    body = _build_es_query(req)

    try:
        resp = await es.search(index=ES_INDEX, body=body)
    except ESNotFoundError:
        logger.warning("OpenSearch index '%s' not found — falling back to Postgres text search", ES_INDEX)
        return await _postgres_text_search(req, app.state.db_session)
    except Exception as exc:
        logger.error("ES search error: %s", exc)
        raise HTTPException(status_code=502, detail="OpenSearch query failed")

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


@v1_router.post(
    "/search/advanced",
    tags=["Search"],
    summary="Advanced DSL search",
    description="Execute a raw OpenSearch DSL query for maximum flexibility.",
)
async def search_advanced(req: AdvancedSearchRequest, user: dict = Depends(require_auth)):
    """Execute a raw OpenSearch DSL query."""
    user_id = user.get("sub", user.get("user_id", "unknown"))
    logger.info("advanced_search_query user_id=%s body_keys=%s", user_id, list(req.body.keys()))
    # Hardcode index to prevent OpenSearch DSL injection
    index = "khushfus-mentions"

    # Validate body size to prevent abuse
    body_str = json.dumps(req.body)
    if len(body_str) > 10000:
        raise HTTPException(status_code=400, detail="Query body too large")

    # Block dangerous keys in DSL body
    _dangerous_keys = {"script", "script_fields", "scripted_metric", "runtime_mappings"}
    def _check_dangerous(obj: Any, depth: int = 0) -> None:
        if depth > 20:
            raise HTTPException(status_code=400, detail="Query body too deeply nested")
        if isinstance(obj, dict):
            for key in obj:
                if key in _dangerous_keys:
                    raise HTTPException(status_code=400, detail=f"Disallowed query key: {key}")
                _check_dangerous(obj[key], depth + 1)
        elif isinstance(obj, list):
            for item in obj:
                _check_dangerous(item, depth + 1)

    _check_dangerous(req.body)

    es: AsyncOpenSearch = app.state.es
    try:
        resp = await es.search(index=index, body=req.body)
        return resp.body
    except ESNotFoundError:
        raise HTTPException(status_code=503, detail=f"Index '{index}' not found")
    except Exception as exc:
        logger.error("ES advanced search error: %s", exc)
        raise HTTPException(status_code=502, detail="OpenSearch query failed")


# ---- Autocomplete / suggest ----


@v1_router.get(
    "/search/suggest",
    response_model=SuggestResponse,
    tags=["Suggest"],
    summary="Autocomplete suggestions",
    description="Get autocomplete suggestions for keywords, authors, or topics based on a prefix query.",
)
async def suggest(
    q: str = Query(..., min_length=1, description="Prefix to autocomplete"),
    field: str = Query("text", description="Field to suggest from: text, author_name, author_handle, topics"),
    project_id: int | None = Query(None),
    size: int = Query(10, ge=1, le=50),
    user: dict = Depends(require_auth),
):
    """Autocomplete suggestions for keywords or authors."""
    es: AsyncOpenSearch = app.state.es

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
        raise HTTPException(status_code=502, detail="OpenSearch suggest failed")

    seen: set[str] = set()
    suggestions: list[str] = []
    for hit in resp["hits"]["hits"]:
        val = hit["_source"].get(field, "")
        if isinstance(val, str) and val and val not in seen:
            seen.add(val)
            suggestions.append(val)
    return SuggestResponse(suggestions=suggestions[:size])


# ---- Trending topics ----


@v1_router.get(
    "/search/trending",
    response_model=TrendingResponse,
    tags=["Analytics"],
    summary="Trending topics",
    description="Trending topics and keywords via OpenSearch significant_terms aggregation.",
)
async def trending(
    project_id: int | None = Query(None),
    hours: int = Query(24, ge=1, le=720, description="Look-back window in hours"),
    size: int = Query(20, ge=1, le=100),
    user: dict = Depends(require_auth),
):
    """Trending topics/keywords in a given time window using ES significant_terms aggregation."""
    es: AsyncOpenSearch = app.state.es

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
        raise HTTPException(status_code=502, detail="OpenSearch trending query failed")

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


@v1_router.get(
    "/search/facets",
    response_model=FacetsResponse,
    tags=["Analytics"],
    summary="Faceted counts",
    description="Faceted aggregation counts by platform, sentiment, and language with optional filters.",
)
async def facets(
    q: str = Query("", description="Optional full-text query to scope facets"),
    project_id: int | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    user: dict = Depends(require_auth),
):
    """Faceted counts by platform, sentiment, and language for a query."""
    es: AsyncOpenSearch = app.state.es

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
        raise HTTPException(status_code=502, detail="OpenSearch facets query failed")

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


@v1_router.post(
    "/saved-searches",
    response_model=SavedSearchOut,
    status_code=201,
    tags=["Saved Searches"],
    summary="Create a saved search",
    description="Save a search configuration with filters for quick re-use later.",
)
async def create_saved_search(req: SavedSearchCreate, user: dict = Depends(require_auth)):
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


@v1_router.get(
    "/saved-searches",
    response_model=list[SavedSearchOut],
    tags=["Saved Searches"],
    summary="List saved searches",
    description="List all saved searches for a project, sorted by creation date descending.",
)
async def list_saved_searches(
    project_id: int = Query(..., description="Project to list saved searches for"),
    user: dict = Depends(require_auth),
):
    """List saved searches for a project."""
    session_factory = app.state.db_session
    async with session_factory() as db:
        result = await db.execute(
            select(SavedSearch).where(SavedSearch.project_id == project_id).order_by(SavedSearch.created_at.desc())
        )
        return result.scalars().all()


@v1_router.delete(
    "/saved-searches/{search_id}",
    status_code=204,
    tags=["Saved Searches"],
    summary="Delete a saved search",
    description="Remove a saved search by its ID.",
)
async def delete_saved_search(search_id: int, user: dict = Depends(require_auth)):
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


app.include_router(v1_router)
