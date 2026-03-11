"""
8.6 — API contract tests.

Validates:
- Shared Pydantic schemas match expected field names and types (no DB needed).
- Event dataclasses have all required fields for each consumer.
- Pydantic schema serialisation / deserialisation round-trips.
- Schema field constraints are enforced (min_length, ge, le, etc.).
- OpenAPI schema extraction from the FastAPI gateway app.
"""

from __future__ import annotations

import dataclasses
from datetime import datetime

import pytest
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Import everything we want to verify
# ---------------------------------------------------------------------------
from shared.events import (
    AlertEvent,
    AnalyzedMentionEvent,
    AuditEvent,
    EnrichmentEvent,
    EnrichmentResultEvent,
    ExportRequestEvent,
    MediaAnalysisEvent,
    MediaResultEvent,
    PublishRequestEvent,
    RawMentionEvent,
    ReportRequestEvent,
    WorkflowTriggerEvent,
)
from shared.schemas import (
    AlertRuleCreate,
    AlertRuleOut,
    ApiKeyCreate,
    ApiKeyOut,
    AuditLogOut,
    CollectRequest,
    ErrorResponse,
    ExportCreate,
    ExportOut,
    HealthResponse,
    KeywordCreate,
    KeywordOut,
    LoginRequest,
    MentionListOut,
    MentionOut,
    OrgCreate,
    OrgMemberAdd,
    OrgMemberOut,
    OrgOut,
    OrgUpdate,
    PaginatedResponse,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    RegisterRequest,
    SavedSearchOut,
    ScheduledPostCreate,
    ScheduledPostOut,
    SearchRequest,
    TokenResponse,
    ValidationErrorDetail,
    ValidationErrorResponse,
    WorkflowCreate,
    WorkflowOut,
)

# ===========================================================================
# Schema field contract tests (no DB needed)
# ===========================================================================


class TestAuthSchemaContracts:
    """RegisterRequest, LoginRequest, TokenResponse."""

    def test_register_request_has_expected_fields(self):
        fields = RegisterRequest.model_fields
        assert "email" in fields
        assert "password" in fields
        assert "full_name" in fields

    def test_register_request_password_min_length_enforced(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", password="short", full_name="N")

    def test_register_request_full_name_max_length_enforced(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@b.com", password="longpass1", full_name="x" * 201)

    def test_login_request_requires_email_and_password(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="a@b.com")  # missing password

    def test_token_response_defaults(self):
        resp = TokenResponse(access_token="tok", user_id=1)
        assert resp.token_type == "bearer"
        assert resp.organization_id is None

    def test_token_response_roundtrip(self):
        resp = TokenResponse(access_token="tok123", user_id=5, organization_id=2)
        data = resp.model_dump()
        restored = TokenResponse(**data)
        assert restored.access_token == resp.access_token
        assert restored.user_id == resp.user_id
        assert restored.organization_id == resp.organization_id


class TestOrgSchemaContracts:
    """OrgCreate, OrgUpdate, OrgOut, OrgMemberAdd, OrgMemberOut."""

    def test_org_create_slug_pattern_enforced(self):
        """Slug must be lowercase alphanumeric with hyphens, not starting/ending with hyphen."""
        with pytest.raises(ValidationError):
            OrgCreate(name="Test", slug="-bad-slug-")

    def test_org_create_valid_slug_accepts_hyphens(self):
        org = OrgCreate(name="Test", slug="my-org-slug")
        assert org.slug == "my-org-slug"

    def test_org_create_plan_default_is_free(self):
        org = OrgCreate(name="X", slug="x-org")
        assert org.plan == "free"

    def test_org_create_invalid_plan_rejected(self):
        with pytest.raises(ValidationError):
            OrgCreate(name="X", slug="x-org", plan="diamond")  # type: ignore[arg-type]

    def test_org_out_has_all_required_fields(self):
        fields = OrgOut.model_fields
        required = {"id", "name", "slug", "plan", "mention_quota", "mentions_used",
                    "max_projects", "max_users", "sso_enabled", "is_active", "created_at"}
        assert required.issubset(fields.keys())

    def test_org_update_all_fields_optional(self):
        # All fields optional means empty dict is valid
        upd = OrgUpdate()
        assert upd.name is None
        assert upd.logo_url is None

    def test_org_member_add_default_role_is_viewer(self):
        member = OrgMemberAdd(email="new@example.com")
        assert member.role == "viewer"

    def test_org_member_out_has_user_field(self):
        assert "user" in OrgMemberOut.model_fields


class TestProjectSchemaContracts:
    """ProjectCreate, ProjectUpdate, ProjectOut, KeywordCreate, KeywordOut."""

    def test_project_create_requires_name_and_client_name(self):
        with pytest.raises(ValidationError):
            ProjectCreate(name="", client_name="Client")  # min_length=1 on name

    def test_project_create_name_max_length_enforced(self):
        with pytest.raises(ValidationError):
            ProjectCreate(name="n" * 201, client_name="C")

    def test_project_create_keyword_list_empty_by_default(self):
        proj = ProjectCreate(name="P", client_name="C")
        assert proj.keywords == []

    def test_project_create_default_platforms_set(self):
        proj = ProjectCreate(name="P", client_name="C")
        expected_platforms = "twitter,facebook,instagram,linkedin,youtube"
        assert proj.platforms == expected_platforms

    def test_keyword_create_requires_term(self):
        with pytest.raises(ValidationError):
            KeywordCreate(term="")  # min_length=1

    def test_keyword_create_default_type_is_brand(self):
        kw = KeywordCreate(term="mybrand")
        assert kw.keyword_type == "brand"

    def test_project_out_roundtrip(self):
        now = datetime.utcnow()
        proj = ProjectOut(
            id=1,
            organization_id=1,
            name="Test",
            description=None,
            client_name="Client",
            status="active",
            platforms="twitter",
            competitor_ids=None,
            created_at=now,
            keywords=[],
        )
        data = proj.model_dump()
        restored = ProjectOut(**data)
        assert restored.id == proj.id
        assert restored.status == proj.status

    def test_project_update_all_fields_optional(self):
        upd = ProjectUpdate()
        assert upd.name is None
        assert upd.status is None

    def test_keyword_out_has_is_active_field(self):
        assert "is_active" in KeywordOut.model_fields


class TestMentionSchemaContracts:
    """MentionOut and MentionListOut."""

    def _mention_kwargs(self):
        return {
            "id": 1,
            "platform": "twitter",
            "text": "Hello",
            "likes": 0,
            "shares": 0,
            "comments": 0,
            "reach": 0,
            "sentiment": "positive",
            "sentiment_score": 0.8,
            "has_media": False,
            "is_flagged": False,
            "collected_at": datetime.utcnow(),
            "source_url": None,
            "author_name": None,
            "author_handle": None,
            "author_followers": None,
            "language": None,
            "matched_keywords": None,
            "topics": None,
            "media_type": None,
            "author_influence_score": None,
            "author_is_bot": None,
            "virality_score": None,
            "published_at": None,
        }

    def test_mention_out_fields_present(self):
        mention = MentionOut(**self._mention_kwargs())
        assert mention.platform == "twitter"
        assert mention.sentiment == "positive"

    def test_mention_out_roundtrip(self):
        mention = MentionOut(**self._mention_kwargs())
        data = mention.model_dump()
        restored = MentionOut(**data)
        assert restored.id == mention.id
        assert restored.sentiment == mention.sentiment

    def test_mention_list_out_structure(self):
        mention = MentionOut(**self._mention_kwargs())
        listing = MentionListOut(items=[mention], total=1, page=1, page_size=20)
        assert listing.total == 1
        assert len(listing.items) == 1

    def test_mention_out_has_required_fields(self):
        fields = MentionOut.model_fields
        for field in ("id", "platform", "text", "sentiment", "sentiment_score",
                      "has_media", "is_flagged", "collected_at"):
            assert field in fields, f"Expected field {field!r} in MentionOut"


class TestAlertSchemaContracts:
    """AlertRuleCreate, AlertRuleOut."""

    def test_alert_rule_create_defaults(self):
        rule = AlertRuleCreate(name="Spike Alert", rule_type="volume_spike")
        assert rule.threshold == 2.0
        assert rule.window_minutes == 60
        assert rule.channels == "email"
        assert rule.webhook_url is None

    def test_alert_rule_create_threshold_ge_zero(self):
        with pytest.raises(ValidationError):
            AlertRuleCreate(name="R", rule_type="t", threshold=-1.0)

    def test_alert_rule_create_window_minutes_ge_one(self):
        with pytest.raises(ValidationError):
            AlertRuleCreate(name="R", rule_type="t", window_minutes=0)

    def test_alert_rule_create_window_minutes_le_10080(self):
        with pytest.raises(ValidationError):
            AlertRuleCreate(name="R", rule_type="t", window_minutes=10081)

    def test_alert_rule_out_roundtrip(self):
        rule_out = AlertRuleOut(
            id=1,
            name="Test",
            rule_type="spike",
            threshold=3.0,
            window_minutes=30,
            channels="slack",
            is_active=True,
        )
        data = rule_out.model_dump()
        restored = AlertRuleOut(**data)
        assert restored.threshold == 3.0


class TestSearchSchemaContracts:
    """SearchRequest, SavedSearchCreate, SavedSearchOut."""

    def test_search_request_defaults(self):
        req = SearchRequest(project_id=1, query="test")
        assert req.page == 1
        assert req.page_size == 20
        assert req.platform is None

    def test_search_request_page_ge_one(self):
        with pytest.raises(ValidationError):
            SearchRequest(project_id=1, query="q", page=0)

    def test_search_request_page_size_le_200(self):
        with pytest.raises(ValidationError):
            SearchRequest(project_id=1, query="q", page_size=201)

    def test_saved_search_roundtrip(self):
        now = datetime.utcnow()
        out = SavedSearchOut(
            id=1,
            name="My Search",
            query_json='{"q": "brand"}',
            created_at=now,
        )
        data = out.model_dump()
        restored = SavedSearchOut(**data)
        assert restored.name == "My Search"


class TestExportSchemaContracts:
    """ExportCreate, ExportOut."""

    def test_export_create_default_format_csv(self):
        exp = ExportCreate(project_id=1)
        assert exp.export_format == "csv"

    def test_export_create_rejects_invalid_format(self):
        with pytest.raises(ValidationError):
            ExportCreate(project_id=1, export_format="pdf")  # type: ignore[arg-type]

    def test_export_out_roundtrip(self):
        now = datetime.utcnow()
        out = ExportOut(
            id=1,
            export_format="csv",
            status="pending",
            row_count=None,
            created_at=now,
            completed_at=None,
        )
        data = out.model_dump()
        restored = ExportOut(**data)
        assert restored.export_format == "csv"
        assert restored.status == "pending"


class TestScheduledPostSchemaContracts:
    """ScheduledPostCreate, ScheduledPostOut."""

    def test_scheduled_post_create_required_fields(self):
        with pytest.raises(ValidationError):
            ScheduledPostCreate(project_id=1, platform="twitter", content="test")
            # missing scheduled_at

    def test_scheduled_post_create_valid(self):
        post = ScheduledPostCreate(
            project_id=1,
            platform="twitter",
            content="Hello world",
            scheduled_at=datetime.utcnow(),
        )
        assert post.reply_to_mention_id is None
        assert post.media_urls is None

    def test_scheduled_post_out_roundtrip(self):
        now = datetime.utcnow()
        out = ScheduledPostOut(
            id=1,
            platform="twitter",
            content="Hello",
            status="scheduled",
            scheduled_at=now,
            published_at=None,
            platform_post_id=None,
            error_message=None,
            created_at=now,
        )
        data = out.model_dump()
        restored = ScheduledPostOut(**data)
        assert restored.platform == "twitter"


class TestApiKeySchemaContracts:
    """ApiKeyCreate, ApiKeyOut."""

    def test_api_key_create_rate_limit_ge_one(self):
        with pytest.raises(ValidationError):
            ApiKeyCreate(name="Key", rate_limit=0)

    def test_api_key_create_rate_limit_le_100000(self):
        with pytest.raises(ValidationError):
            ApiKeyCreate(name="Key", rate_limit=100001)

    def test_api_key_create_default_scopes(self):
        key = ApiKeyCreate(name="MyKey")
        assert key.scopes == "read"
        assert key.rate_limit == 1000

    def test_api_key_out_has_prefix_not_full_key(self):
        """ApiKeyOut must NOT have a `key` field (only ApiKeyCreated does)."""
        assert "key" not in ApiKeyOut.model_fields
        assert "prefix" in ApiKeyOut.model_fields


class TestCommonSchemaContracts:
    """HealthResponse, CollectRequest, ErrorResponse, PaginatedResponse."""

    def test_health_response_default_status(self):
        h = HealthResponse(service="test", version="1.0.0")
        assert h.status == "ok"

    def test_collect_request_defaults(self):
        req = CollectRequest()
        assert req.hours_back == 24

    def test_collect_request_hours_back_ge_one(self):
        with pytest.raises(ValidationError):
            CollectRequest(hours_back=0)

    def test_collect_request_hours_back_le_720(self):
        with pytest.raises(ValidationError):
            CollectRequest(hours_back=721)

    def test_error_response_roundtrip(self):
        err = ErrorResponse(detail="Not found", error_code="NOT_FOUND")
        data = err.model_dump()
        restored = ErrorResponse(**data)
        assert restored.detail == "Not found"
        assert restored.error_code == "NOT_FOUND"

    def test_paginated_response_structure(self):
        pr: PaginatedResponse[str] = PaginatedResponse(
            items=["a", "b"],
            total=10,
            page=1,
            page_size=20,
            total_pages=1,
        )
        assert len(pr.items) == 2
        assert pr.total == 10

    def test_validation_error_detail(self):
        det = ValidationErrorDetail(field="email", message="Invalid email", type="value_error")
        assert det.field == "email"

    def test_validation_error_response_structure(self):
        resp = ValidationErrorResponse(
            detail=[ValidationErrorDetail(field="f", message="m", type="t")]
        )
        assert len(resp.detail) == 1


class TestWorkflowSchemaContracts:
    """WorkflowCreate, WorkflowOut."""

    def test_workflow_create_name_max_length(self):
        with pytest.raises(ValidationError):
            WorkflowCreate(
                project_id=1,
                name="x" * 201,
                trigger_json="{}",
                actions_json="[]",
            )

    def test_workflow_out_roundtrip(self):
        now = datetime.utcnow()
        out = WorkflowOut(
            id=1,
            name="Auto Flag",
            trigger_json='{"type": "negative"}',
            actions_json='[{"type": "flag"}]',
            status="active",
            executions=0,
            created_at=now,
        )
        data = out.model_dump()
        restored = WorkflowOut(**data)
        assert restored.name == "Auto Flag"
        assert restored.executions == 0


class TestAuditLogSchemaContracts:
    """AuditLogOut."""

    def test_audit_log_out_required_fields(self):
        fields = AuditLogOut.model_fields
        for f in ("id", "organization_id", "action", "resource_type", "created_at"):
            assert f in fields, f"Expected {f!r} in AuditLogOut"

    def test_audit_log_out_optional_fields(self):
        now = datetime.utcnow()
        log = AuditLogOut(
            id=1,
            organization_id=1,
            user_id=None,
            action="project.create",
            resource_type="project",
            resource_id=None,
            details_json=None,
            ip_address=None,
            created_at=now,
        )
        assert log.user_id is None
        assert log.ip_address is None


# ===========================================================================
# Event dataclass field-coverage tests
# ===========================================================================


class TestRawMentionEventFields:
    """Verify RawMentionEvent has all fields required by the Analyzer consumer."""

    REQUIRED_BY_ANALYZER = {
        "project_id",
        "platform",
        "source_id",
        "source_url",
        "text",
        "author_name",
        "author_handle",
        "author_followers",
        "likes",
        "shares",
        "comments",
        "reach",
        "published_at",
        "matched_keywords",
        "event_id",
        "schema_version",
    }

    def test_all_required_fields_present(self):
        field_names = {f.name for f in dataclasses.fields(RawMentionEvent)}
        missing = self.REQUIRED_BY_ANALYZER - field_names
        assert not missing, f"RawMentionEvent is missing fields: {missing}"

    def test_instantiation_with_required_args(self):
        ev = RawMentionEvent(
            project_id=1,
            platform="twitter",
            source_id="tweet_1",
            source_url="https://t.co/abc",
            text="Hello world",
            author_name="Alice",
            author_handle="@alice",
        )
        assert ev.project_id == 1
        assert ev.schema_version == "1.0"

    def test_text_truncated_at_5000_chars(self):
        long_text = "x" * 6000
        ev = RawMentionEvent(
            project_id=1,
            platform="twitter",
            source_id="s1",
            source_url="",
            text=long_text,
            author_name="A",
            author_handle="@a",
        )
        assert len(ev.text) == 5000

    def test_event_id_is_auto_generated_uuid(self):
        ev = RawMentionEvent(
            project_id=1,
            platform="twitter",
            source_id="s2",
            source_url="",
            text="hi",
            author_name="A",
            author_handle="@a",
        )
        assert ev.event_id
        assert len(ev.event_id) == 36  # UUID4 format


class TestAnalyzedMentionEventFields:
    """Verify AnalyzedMentionEvent has all fields required by Query Service and Notification Service."""

    REQUIRED_BY_QUERY = {
        "project_id",
        "platform",
        "source_id",
        "source_url",
        "text",
        "sentiment",
        "sentiment_score",
        "language",
        "topics",
        "entities",
        "event_id",
        "schema_version",
    }

    REQUIRED_BY_NOTIFICATION = {
        "project_id",
        "platform",
        "sentiment",
        "sentiment_score",
        "author_followers",
        "reach",
        "event_id",
    }

    def test_all_query_required_fields_present(self):
        field_names = {f.name for f in dataclasses.fields(AnalyzedMentionEvent)}
        missing = self.REQUIRED_BY_QUERY - field_names
        assert not missing, f"AnalyzedMentionEvent missing query fields: {missing}"

    def test_all_notification_required_fields_present(self):
        field_names = {f.name for f in dataclasses.fields(AnalyzedMentionEvent)}
        missing = self.REQUIRED_BY_NOTIFICATION - field_names
        assert not missing, f"AnalyzedMentionEvent missing notification fields: {missing}"

    def test_nlp_fields_present(self):
        field_names = {f.name for f in dataclasses.fields(AnalyzedMentionEvent)}
        nlp_fields = {"emotions", "entities_json", "aspects_json", "sarcasm", "sentiment_tier"}
        missing = nlp_fields - field_names
        assert not missing, f"AnalyzedMentionEvent missing NLP fields: {missing}"

    def test_default_sentiment_is_neutral(self):
        ev = AnalyzedMentionEvent(
            project_id=1,
            platform="twitter",
            source_id="s1",
            source_url="",
            text="hi",
            author_name="A",
            author_handle="@a",
        )
        assert ev.sentiment == "neutral"
        assert ev.sentiment_score == 0.0
        assert ev.language == "en"

    def test_text_truncated_at_5000_chars(self):
        ev = AnalyzedMentionEvent(
            project_id=1,
            platform="twitter",
            source_id="s1",
            source_url="",
            text="z" * 6000,
            author_name="A",
            author_handle="@a",
        )
        assert len(ev.text) == 5000


class TestAlertEventFields:
    """Verify AlertEvent has fields required by Notification consumer."""

    REQUIRED = {"project_id", "alert_type", "severity", "title", "description", "schema_version"}

    def test_all_required_fields_present(self):
        field_names = {f.name for f in dataclasses.fields(AlertEvent)}
        missing = self.REQUIRED - field_names
        assert not missing, f"AlertEvent missing fields: {missing}"

    def test_instantiation(self):
        ev = AlertEvent(
            project_id=1,
            alert_type="spike",
            severity="high",
            title="Spike detected",
            description="Volume spiked 3x",
        )
        assert ev.alert_type == "spike"
        assert ev.severity == "high"


class TestMediaEventFields:
    """Verify MediaAnalysisEvent and MediaResultEvent fields."""

    def test_media_analysis_event_fields(self):
        required = {"mention_id", "project_id", "media_url", "media_type"}
        field_names = {f.name for f in dataclasses.fields(MediaAnalysisEvent)}
        assert required.issubset(field_names)

    def test_media_result_event_fields(self):
        required = {"mention_id", "ocr_text", "labels", "transcript", "logo_detected"}
        field_names = {f.name for f in dataclasses.fields(MediaResultEvent)}
        assert required.issubset(field_names)


class TestEnrichmentEventFields:
    """Verify EnrichmentEvent and EnrichmentResultEvent fields."""

    def test_enrichment_event_required_fields(self):
        required = {"mention_id", "project_id", "author_handle", "author_platform"}
        field_names = {f.name for f in dataclasses.fields(EnrichmentEvent)}
        assert required.issubset(field_names)

    def test_enrichment_result_event_fields(self):
        required = {"mention_id", "influence_score", "is_bot", "org_name", "virality_score"}
        field_names = {f.name for f in dataclasses.fields(EnrichmentResultEvent)}
        assert required.issubset(field_names)

    def test_enrichment_result_defaults(self):
        ev = EnrichmentResultEvent(mention_id=1)
        assert ev.influence_score == 0.0
        assert ev.is_bot is False
        assert ev.virality_score == 0.0


class TestExportPublishWorkflowEventFields:
    """ExportRequestEvent, PublishRequestEvent, WorkflowTriggerEvent, AuditEvent."""

    def test_export_request_event_fields(self):
        required = {"export_job_id", "project_id", "export_format"}
        field_names = {f.name for f in dataclasses.fields(ExportRequestEvent)}
        assert required.issubset(field_names)

    def test_publish_request_event_fields(self):
        required = {"post_id", "project_id", "platform", "content"}
        field_names = {f.name for f in dataclasses.fields(PublishRequestEvent)}
        assert required.issubset(field_names)

    def test_workflow_trigger_event_fields(self):
        required = {"workflow_id", "project_id", "mention_id"}
        field_names = {f.name for f in dataclasses.fields(WorkflowTriggerEvent)}
        assert required.issubset(field_names)

    def test_audit_event_fields(self):
        required = {"organization_id", "user_id", "action", "resource_type"}
        field_names = {f.name for f in dataclasses.fields(AuditEvent)}
        assert required.issubset(field_names)


class TestReportRequestEventFields:
    """ReportRequestEvent for the Report consumer."""

    REQUIRED_BY_REPORT_SERVICE = {"project_id", "report_type", "format"}

    def test_all_required_fields_present(self):
        field_names = {f.name for f in dataclasses.fields(ReportRequestEvent)}
        missing = self.REQUIRED_BY_REPORT_SERVICE - field_names
        assert not missing

    def test_default_format_is_pdf(self):
        ev = ReportRequestEvent(project_id=1, report_type="weekly")
        assert ev.format == "pdf"


# ===========================================================================
# Schema version and stream name constants
# ===========================================================================


class TestStreamNameConstants:
    """Verify stream name constants haven't been accidentally changed."""

    def test_stream_names_defined(self):
        from shared.events import (
            STREAM_ALERTS,
            STREAM_ANALYZED_MENTIONS,
            STREAM_RAW_MENTIONS,
            STREAM_REPORT_REQUESTS,
        )
        assert STREAM_RAW_MENTIONS == "mentions:raw"
        assert STREAM_ANALYZED_MENTIONS == "mentions:analyzed"
        assert STREAM_ALERTS == "alerts:trigger"
        assert STREAM_REPORT_REQUESTS == "reports:request"

    def test_event_schema_version(self):
        from shared.events import EVENT_SCHEMA_VERSION
        assert EVENT_SCHEMA_VERSION == "1.0"


# ===========================================================================
# OpenAPI schema extraction from FastAPI gateway
# ===========================================================================


class TestGatewayOpenApiSchema:
    """Verify the FastAPI gateway app exposes an OpenAPI schema with expected routes."""

    @pytest.fixture(scope="class")
    def openapi_schema(self):
        """Extract OpenAPI schema from the gateway app without a live server."""
        import os

        os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-openapi")
        os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_openapi.db")

        from services.gateway.app.main import app

        schema = app.openapi()
        return schema

    def test_schema_has_openapi_version(self, openapi_schema):
        assert "openapi" in openapi_schema
        assert openapi_schema["openapi"].startswith("3.")

    def test_schema_has_info_block(self, openapi_schema):
        assert "info" in openapi_schema
        assert "title" in openapi_schema["info"]

    def test_schema_has_paths(self, openapi_schema):
        assert "paths" in openapi_schema
        paths = openapi_schema["paths"]
        assert len(paths) > 0

    def test_auth_login_path_exists(self, openapi_schema):
        paths = openapi_schema["paths"]
        auth_paths = [p for p in paths if "login" in p]
        assert auth_paths, "No login path found in OpenAPI schema"

    def test_auth_register_path_exists(self, openapi_schema):
        paths = openapi_schema["paths"]
        register_paths = [p for p in paths if "register" in p]
        assert register_paths, "No register path found in OpenAPI schema"

    def test_projects_path_exists(self, openapi_schema):
        paths = openapi_schema["paths"]
        project_paths = [p for p in paths if "project" in p]
        assert project_paths, "No project paths found in OpenAPI schema"

    def test_schema_components_have_schemas(self, openapi_schema):
        assert "components" in openapi_schema
        assert "schemas" in openapi_schema["components"]
        schemas = openapi_schema["components"]["schemas"]
        assert len(schemas) > 0

    def test_auth_response_schema_present(self, openapi_schema):
        schemas = openapi_schema["components"]["schemas"]
        schema_names = list(schemas.keys())
        # Gateway returns AuthResponse or LoginRequest — either confirms auth schemas exist
        assert any("Auth" in name or "Login" in name or "Token" in name for name in schema_names)
