"""
8.21 — Test factories for KhushFus.

Provides pure-Python factory functions for constructing ORM model instances
with sensible defaults.  All factories accept **overrides to customise any
field.  No database connection is required — instances are not persisted here.

Usage
-----
    from tests.factories import make_project, make_mention

    # plain defaults
    project = make_project()

    # override specific fields
    mention = make_mention(project_id=42, sentiment="negative", likes=500)
"""

from __future__ import annotations

import itertools
from datetime import datetime, timedelta, timezone

from shared.models import (
    AlertLog,
    AlertRule,
    AlertSeverity,
    ApiKey,
    AuditLog,
    ExportFormat,
    ExportJob,
    ExportStatus,
    Integration,
    Keyword,
    Mention,
    Organization,
    OrgMember,
    OrgRole,
    PlanTier,
    Platform,
    Project,
    ProjectStatus,
    PublishStatus,
    Report,
    ReportType,
    SavedSearch,
    ScheduledPost,
    Sentiment,
    User,
    Workflow,
    WorkflowStatus,
)

# ---------------------------------------------------------------------------
# Sequence counters — ensure unique IDs / slugs / emails across a test run
# ---------------------------------------------------------------------------

_org_counter = itertools.count(1)
_user_counter = itertools.count(1)
_project_counter = itertools.count(1)
_mention_counter = itertools.count(1)
_rule_counter = itertools.count(1)
_report_counter = itertools.count(1)
_export_counter = itertools.count(1)
_api_key_counter = itertools.count(1)
_keyword_counter = itertools.count(1)
_post_counter = itertools.count(1)
_workflow_counter = itertools.count(1)
_alert_log_counter = itertools.count(1)
_saved_search_counter = itertools.count(1)
_integration_counter = itertools.count(1)
_audit_log_counter = itertools.count(1)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------


def make_organization(**overrides) -> Organization:
    """Create an Organization instance with sensible defaults.

    Parameters
    ----------
    name : str
    slug : str
    plan : PlanTier | str
    mention_quota : int
    mentions_used : int
    max_projects : int
    max_users : int
    sso_enabled : bool
    is_active : bool
    **overrides : Any field on Organization
    """
    seq = next(_org_counter)
    defaults: dict = {
        "id": seq,
        "name": f"Test Organization {seq}",
        "slug": f"test-org-{seq}",
        "plan": PlanTier.FREE,
        "mention_quota": 10_000,
        "mentions_used": 0,
        "max_projects": 3,
        "max_users": 5,
        "sso_enabled": False,
        "sso_provider": None,
        "sso_metadata_url": None,
        "sso_entity_id": None,
        "logo_url": None,
        "primary_color": None,
        "is_active": True,
        "created_at": _now(),
        "updated_at": None,
    }
    defaults.update(overrides)
    return Organization(**defaults)


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------


def make_user(**overrides) -> User:
    """Create a User instance with sensible defaults.

    Parameters
    ----------
    email : str
    full_name : str
    hashed_password : str | None
    is_active : bool
    is_superadmin : bool
    **overrides : Any field on User
    """
    seq = next(_user_counter)
    defaults: dict = {
        "id": seq,
        "email": f"user{seq}@example.com",
        "full_name": f"Test User {seq}",
        "hashed_password": "$2b$12$fakehash",
        "avatar_url": None,
        "sso_subject": None,
        "is_active": True,
        "is_superadmin": False,
        "is_deleted": False,
        "deleted_at": None,
        "last_login_at": None,
        "created_at": _now(),
        "updated_at": None,
    }
    defaults.update(overrides)
    return User(**defaults)


# ---------------------------------------------------------------------------
# OrgMember
# ---------------------------------------------------------------------------


def make_org_member(organization_id: int = 1, user_id: int = 1, **overrides) -> OrgMember:
    """Create an OrgMember tying a user to an organisation."""
    defaults: dict = {
        "organization_id": organization_id,
        "user_id": user_id,
        "role": OrgRole.VIEWER,
        "invited_by": None,
        "joined_at": _now(),
    }
    defaults.update(overrides)
    return OrgMember(**defaults)


# ---------------------------------------------------------------------------
# ApiKey
# ---------------------------------------------------------------------------


def make_api_key(organization_id: int = 1, **overrides) -> ApiKey:
    """Create an ApiKey instance."""
    seq = next(_api_key_counter)
    defaults: dict = {
        "id": seq,
        "organization_id": organization_id,
        "name": f"API Key {seq}",
        "key_hash": f"$2b$12$fakehash{seq}",
        "prefix": f"KF{seq:06d}",
        "scopes": "read",
        "rate_limit": 1000,
        "is_active": True,
        "last_used_at": None,
        "expires_at": None,
        "created_at": _now(),
    }
    defaults.update(overrides)
    return ApiKey(**defaults)


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------


def make_project(organization_id: int = 1, **overrides) -> Project:
    """Create a Project instance with sensible defaults.

    Parameters
    ----------
    organization_id : int
    name : str
    client_name : str
    status : ProjectStatus | str
    platforms : str
    keywords : list  (not set; use make_keyword() separately)
    **overrides : Any field on Project
    """
    seq = next(_project_counter)
    defaults: dict = {
        "id": seq,
        "organization_id": organization_id,
        "name": f"Test Project {seq}",
        "description": None,
        "client_name": f"Test Client {seq}",
        "status": ProjectStatus.ACTIVE,
        "platforms": "twitter,facebook,instagram,linkedin,youtube",
        "competitor_ids": None,
        "created_by": None,
        "updated_by": None,
        "is_deleted": False,
        "deleted_at": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    defaults.update(overrides)
    return Project(**defaults)


# ---------------------------------------------------------------------------
# Keyword
# ---------------------------------------------------------------------------


def make_keyword(project_id: int = 1, **overrides) -> Keyword:
    """Create a Keyword instance."""
    seq = next(_keyword_counter)
    defaults: dict = {
        "id": seq,
        "project_id": project_id,
        "term": f"keyword{seq}",
        "keyword_type": "brand",
        "is_active": True,
        "created_at": _now(),
        "updated_at": None,
    }
    defaults.update(overrides)
    return Keyword(**defaults)


# ---------------------------------------------------------------------------
# Mention
# ---------------------------------------------------------------------------


def make_mention(project_id: int = 1, **overrides) -> Mention:
    """Create a Mention instance with sensible defaults.

    Parameters
    ----------
    project_id : int
    platform : Platform | str
    sentiment : Sentiment | str
    text : str
    sentiment_score : float
    likes : int
    shares : int
    comments : int
    reach : int
    **overrides : Any field on Mention
    """
    seq = next(_mention_counter)
    ts = _now() - timedelta(minutes=seq)
    defaults: dict = {
        "id": seq,
        "project_id": project_id,
        "platform": Platform.TWITTER,
        "source_id": f"src_{seq}",
        "source_url": f"https://twitter.com/status/{seq}",
        "text": f"Sample mention number {seq} about the brand",
        "author_name": f"Author {seq}",
        "author_handle": f"@author{seq}",
        "author_followers": 100 * seq,
        "author_profile_url": None,
        "likes": seq * 5,
        "shares": seq * 2,
        "comments": seq,
        "reach": seq * 1000,
        "sentiment": Sentiment.NEUTRAL,
        "sentiment_score": 0.0,
        "language": "en",
        "matched_keywords": "brand",
        "topics": None,
        "entities": None,
        "has_media": False,
        "media_type": None,
        "media_url": None,
        "media_ocr_text": None,
        "media_labels": None,
        "media_transcript": None,
        "author_influence_score": None,
        "author_is_bot": None,
        "author_org": None,
        "virality_score": None,
        "published_at": ts,
        "collected_at": _now(),
        "is_flagged": False,
        "assigned_to": None,
        "is_deleted": False,
        "deleted_at": None,
    }
    defaults.update(overrides)
    return Mention(**defaults)


# ---------------------------------------------------------------------------
# Alert Rule
# ---------------------------------------------------------------------------


def make_alert_rule(project_id: int = 1, **overrides) -> AlertRule:
    """Create an AlertRule instance.

    Parameters
    ----------
    project_id : int
    name : str
    rule_type : str
    threshold : float
    window_minutes : int
    channels : str
    is_active : bool
    **overrides : Any field on AlertRule
    """
    seq = next(_rule_counter)
    defaults: dict = {
        "id": seq,
        "project_id": project_id,
        "name": f"Alert Rule {seq}",
        "rule_type": "volume_spike",
        "threshold": 2.0,
        "window_minutes": 60,
        "channels": "email",
        "webhook_url": None,
        "is_active": True,
        "created_by": None,
        "updated_by": None,
        "created_at": _now(),
        "updated_at": None,
    }
    defaults.update(overrides)
    return AlertRule(**defaults)


# ---------------------------------------------------------------------------
# Alert Log
# ---------------------------------------------------------------------------


def make_alert_log(project_id: int = 1, **overrides) -> AlertLog:
    """Create an AlertLog instance."""
    seq = next(_alert_log_counter)
    defaults: dict = {
        "id": seq,
        "project_id": project_id,
        "rule_id": None,
        "alert_type": "volume_spike",
        "severity": AlertSeverity.MEDIUM,
        "title": f"Alert {seq}: Volume spike detected",
        "description": "Mention volume increased 3x in the last hour",
        "data_json": None,
        "acknowledged": False,
        "created_at": _now(),
    }
    defaults.update(overrides)
    return AlertLog(**defaults)


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def make_report(project_id: int = 1, **overrides) -> Report:
    """Create a Report instance.

    Parameters
    ----------
    project_id : int
    report_type : ReportType | str
    format : str   ('pdf' or 'pptx')
    **overrides : Any field on Report
    """
    seq = next(_report_counter)
    start = _now() - timedelta(days=7)
    end = _now()
    defaults: dict = {
        "id": seq,
        "project_id": project_id,
        "report_type": ReportType.WEEKLY,
        "title": f"Weekly Report {seq}",
        "period_start": start,
        "period_end": end,
        "format": "pdf",
        "file_path": None,
        "data_json": None,
        "created_by": None,
        "updated_by": None,
        "is_deleted": False,
        "deleted_at": None,
        "created_at": _now(),
        "updated_at": None,
    }
    defaults.update(overrides)
    return Report(**defaults)


# ---------------------------------------------------------------------------
# Scheduled Post
# ---------------------------------------------------------------------------


def make_scheduled_post(project_id: int = 1, created_by: int = 1, **overrides) -> ScheduledPost:
    """Create a ScheduledPost instance."""
    seq = next(_post_counter)
    scheduled = _now() + timedelta(hours=seq)
    defaults: dict = {
        "id": seq,
        "project_id": project_id,
        "created_by": created_by,
        "updated_by": None,
        "platform": Platform.TWITTER,
        "content": f"Scheduled post {seq} — hello from KhushFus!",
        "media_urls": None,
        "scheduled_at": scheduled,
        "published_at": None,
        "status": PublishStatus.SCHEDULED,
        "platform_post_id": None,
        "approved_by": None,
        "error_message": None,
        "reply_to_mention_id": None,
        "created_at": _now(),
        "updated_at": None,
    }
    defaults.update(overrides)
    return ScheduledPost(**defaults)


# ---------------------------------------------------------------------------
# Export Job
# ---------------------------------------------------------------------------


def make_export_job(project_id: int = 1, user_id: int = 1, **overrides) -> ExportJob:
    """Create an ExportJob instance.

    Parameters
    ----------
    project_id : int
    user_id : int
    export_format : ExportFormat | str
    status : ExportStatus | str
    row_count : int | None
    **overrides : Any field on ExportJob
    """
    seq = next(_export_counter)
    defaults: dict = {
        "id": seq,
        "project_id": project_id,
        "user_id": user_id,
        "export_format": ExportFormat.CSV,
        "filters_json": None,
        "status": ExportStatus.PENDING,
        "file_path": None,
        "row_count": None,
        "error_message": None,
        "created_at": _now(),
        "completed_at": None,
        "updated_at": None,
    }
    defaults.update(overrides)
    return ExportJob(**defaults)


# ---------------------------------------------------------------------------
# Saved Search
# ---------------------------------------------------------------------------


def make_saved_search(project_id: int = 1, user_id: int = 1, **overrides) -> SavedSearch:
    """Create a SavedSearch instance."""
    seq = next(_saved_search_counter)
    defaults: dict = {
        "id": seq,
        "project_id": project_id,
        "user_id": user_id,
        "name": f"Saved Search {seq}",
        "query_json": '{"query": "brand mention"}',
        "created_at": _now(),
        "updated_at": None,
    }
    defaults.update(overrides)
    return SavedSearch(**defaults)


# ---------------------------------------------------------------------------
# Workflow
# ---------------------------------------------------------------------------


def make_workflow(project_id: int = 1, **overrides) -> Workflow:
    """Create a Workflow instance."""
    seq = next(_workflow_counter)
    defaults: dict = {
        "id": seq,
        "project_id": project_id,
        "created_by": None,
        "updated_by": None,
        "name": f"Workflow {seq}",
        "trigger_json": '{"type": "negative_influencer", "threshold": 10000}',
        "actions_json": '[{"type": "flag_mention"}, {"type": "notify_slack"}]',
        "status": WorkflowStatus.ACTIVE,
        "executions": 0,
        "created_at": _now(),
        "updated_at": None,
    }
    defaults.update(overrides)
    return Workflow(**defaults)


# ---------------------------------------------------------------------------
# Integration
# ---------------------------------------------------------------------------


def make_integration(organization_id: int = 1, **overrides) -> Integration:
    """Create an Integration instance."""
    seq = next(_integration_counter)
    defaults: dict = {
        "id": seq,
        "organization_id": organization_id,
        "integration_type": "slack",
        "name": f"Slack Integration {seq}",
        "config_json": '{"webhook_url": "https://hooks.slack.com/services/T0/B0/fake"}',
        "is_active": True,
        "last_sync_at": None,
        "created_at": _now(),
        "updated_at": None,
    }
    defaults.update(overrides)
    return Integration(**defaults)


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------


def make_audit_log(organization_id: int = 1, user_id: int = 1, **overrides) -> AuditLog:
    """Create an AuditLog entry."""
    seq = next(_audit_log_counter)
    defaults: dict = {
        "id": seq,
        "organization_id": organization_id,
        "user_id": user_id,
        "action": "project.create",
        "resource_type": "project",
        "resource_id": seq,
        "details_json": None,
        "ip_address": "127.0.0.1",
        "created_at": _now(),
    }
    defaults.update(overrides)
    return AuditLog(**defaults)
