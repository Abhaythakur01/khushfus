from datetime import datetime

from pydantic import BaseModel


# --- Project ---
class KeywordCreate(BaseModel):
    term: str
    keyword_type: str = "brand"


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    client_name: str
    platforms: str = "twitter,facebook,instagram,linkedin,youtube"
    keywords: list[KeywordCreate] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    platforms: str | None = None


class KeywordOut(BaseModel):
    id: int
    term: str
    keyword_type: str
    is_active: bool

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str | None
    client_name: str
    status: str
    platforms: str
    created_at: datetime
    keywords: list[KeywordOut] = []

    model_config = {"from_attributes": True}


# --- Mention ---
class MentionOut(BaseModel):
    id: int
    platform: str
    source_url: str | None
    text: str
    author_name: str | None
    author_handle: str | None
    author_followers: int | None
    likes: int
    shares: int
    comments: int
    reach: int
    sentiment: str
    sentiment_score: float
    language: str | None
    matched_keywords: str | None
    topics: str | None
    published_at: datetime | None
    collected_at: datetime
    is_flagged: bool

    model_config = {"from_attributes": True}


class MentionListOut(BaseModel):
    items: list[MentionOut]
    total: int
    page: int
    page_size: int


# --- Report ---
class ReportOut(BaseModel):
    id: int
    report_type: str
    title: str
    period_start: datetime
    period_end: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Collection trigger ---
class CollectRequest(BaseModel):
    hours_back: int = 24
