"""Shared Pydantic schemas used across services for API contracts."""

from datetime import datetime

from pydantic import BaseModel

# ============================================================
# Auth & Identity
# ============================================================


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    organization_id: int | None = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    avatar_url: str | None
    is_active: bool
    is_superadmin: bool
    last_login_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class SSOConfigRequest(BaseModel):
    provider: str  # saml, oidc
    metadata_url: str
    entity_id: str | None = None


# ============================================================
# Organization / Tenant
# ============================================================


class OrgCreate(BaseModel):
    name: str
    slug: str
    plan: str = "free"


class OrgUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None


class OrgOut(BaseModel):
    id: int
    name: str
    slug: str
    plan: str
    mention_quota: int
    mentions_used: int
    max_projects: int
    max_users: int
    sso_enabled: bool
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class OrgMemberAdd(BaseModel):
    email: str
    role: str = "viewer"


class OrgMemberOut(BaseModel):
    id: int
    user_id: int
    role: str
    joined_at: datetime
    user: UserOut | None = None
    model_config = {"from_attributes": True}


class ApiKeyCreate(BaseModel):
    name: str
    scopes: str = "read"
    rate_limit: int = 1000


class ApiKeyOut(BaseModel):
    id: int
    name: str
    prefix: str
    scopes: str
    rate_limit: int
    is_active: bool
    last_used_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class ApiKeyCreated(ApiKeyOut):
    """Returned only on creation — includes the full key (not stored)."""

    key: str


# ============================================================
# Project & Keywords
# ============================================================


class KeywordCreate(BaseModel):
    term: str
    keyword_type: str = "brand"


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    client_name: str
    organization_id: int | None = None
    platforms: str = "twitter,facebook,instagram,linkedin,youtube"
    keywords: list[KeywordCreate] = []
    competitor_ids: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    platforms: str | None = None
    competitor_ids: str | None = None


class KeywordOut(BaseModel):
    id: int
    term: str
    keyword_type: str
    is_active: bool
    model_config = {"from_attributes": True}


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
    keywords: list[KeywordOut] = []
    model_config = {"from_attributes": True}


# ============================================================
# Mention
# ============================================================


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
    has_media: bool
    media_type: str | None
    author_influence_score: float | None
    author_is_bot: bool | None
    virality_score: float | None
    published_at: datetime | None
    collected_at: datetime
    is_flagged: bool
    model_config = {"from_attributes": True}


class MentionListOut(BaseModel):
    items: list[MentionOut]
    total: int
    page: int
    page_size: int


# ============================================================
# Report
# ============================================================


class ReportOut(BaseModel):
    id: int
    report_type: str
    title: str
    period_start: datetime
    period_end: datetime
    created_at: datetime
    model_config = {"from_attributes": True}


# ============================================================
# Alert
# ============================================================


class AlertRuleCreate(BaseModel):
    name: str
    rule_type: str
    threshold: float = 2.0
    window_minutes: int = 60
    channels: str = "email"
    webhook_url: str | None = None


class AlertRuleOut(BaseModel):
    id: int
    name: str
    rule_type: str
    threshold: float
    window_minutes: int
    channels: str
    is_active: bool
    model_config = {"from_attributes": True}


class AlertLogOut(BaseModel):
    id: int
    project_id: int
    alert_type: str
    severity: str
    title: str
    description: str | None
    acknowledged: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ============================================================
# Search
# ============================================================


class SearchRequest(BaseModel):
    project_id: int
    query: str
    platform: str | None = None
    sentiment: str | None = None
    language: str | None = None
    author: str | None = None
    since: datetime | None = None
    until: datetime | None = None
    page: int = 1
    page_size: int = 50


class SavedSearchCreate(BaseModel):
    project_id: int
    name: str
    query_json: str


class SavedSearchOut(BaseModel):
    id: int
    name: str
    query_json: str
    created_at: datetime
    model_config = {"from_attributes": True}


# ============================================================
# Publishing
# ============================================================


class ScheduledPostCreate(BaseModel):
    project_id: int
    platform: str
    content: str
    media_urls: str | None = None
    scheduled_at: datetime
    reply_to_mention_id: int | None = None


class ScheduledPostOut(BaseModel):
    id: int
    platform: str
    content: str
    status: str
    scheduled_at: datetime
    published_at: datetime | None
    platform_post_id: str | None
    error_message: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ============================================================
# Export
# ============================================================


class ExportCreate(BaseModel):
    project_id: int
    export_format: str = "csv"
    filters_json: str | None = None


class ExportOut(BaseModel):
    id: int
    export_format: str
    status: str
    row_count: int | None
    created_at: datetime
    completed_at: datetime | None
    model_config = {"from_attributes": True}


class IntegrationCreate(BaseModel):
    integration_type: str
    name: str
    config_json: str


class IntegrationOut(BaseModel):
    id: int
    integration_type: str
    name: str
    is_active: bool
    last_sync_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ============================================================
# Competitive Intelligence
# ============================================================


class BenchmarkOut(BaseModel):
    project_id: int
    competitor_project_id: int
    period_start: datetime
    period_end: datetime
    data: dict
    model_config = {"from_attributes": True}


# ============================================================
# Workflow
# ============================================================


class WorkflowCreate(BaseModel):
    project_id: int
    name: str
    trigger_json: str
    actions_json: str


class WorkflowOut(BaseModel):
    id: int
    name: str
    trigger_json: str
    actions_json: str
    status: str
    executions: int
    created_at: datetime
    model_config = {"from_attributes": True}


# ============================================================
# Audit
# ============================================================


class AuditLogOut(BaseModel):
    id: int
    organization_id: int
    user_id: int | None
    action: str
    resource_type: str
    resource_id: int | None
    details_json: str | None
    ip_address: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ============================================================
# Common
# ============================================================


class CollectRequest(BaseModel):
    hours_back: int = 24


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str
    version: str = "0.1.0"
