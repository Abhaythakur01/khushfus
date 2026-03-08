"""Tests for shared Pydantic schemas."""

from datetime import datetime

import pytest
from pydantic import ValidationError

from shared.schemas import (
    AlertRuleCreate,
    ExportCreate,
    KeywordCreate,
    LoginRequest,
    MentionOut,
    OrgCreate,
    ProjectCreate,
    RegisterRequest,
    ScheduledPostCreate,
    SearchRequest,
    TokenResponse,
    WorkflowCreate,
)


class TestAuthSchemas:
    def test_register_request_valid(self):
        req = RegisterRequest(email="user@example.com", password="secret123", full_name="John Doe")
        assert req.email == "user@example.com"
        assert req.full_name == "John Doe"

    def test_register_request_missing_field(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="user@example.com")  # missing password and full_name

    def test_login_request(self):
        req = LoginRequest(email="user@example.com", password="secret")
        assert req.password == "secret"
        assert req.email == "user@example.com"

    def test_token_response_defaults(self):
        resp = TokenResponse(access_token="tok123", user_id=1)
        assert resp.token_type == "bearer"
        assert resp.organization_id is None

    def test_token_response_with_org(self):
        resp = TokenResponse(access_token="tok123", user_id=1, organization_id=42)
        assert resp.organization_id == 42


class TestOrgSchemas:
    def test_org_create_defaults(self):
        org = OrgCreate(name="Acme", slug="acme")
        assert org.plan == "free"

    def test_org_create_custom_plan(self):
        org = OrgCreate(name="Enterprise Co", slug="ent-co", plan="enterprise")
        assert org.plan == "enterprise"

    def test_org_create_all_fields(self):
        org = OrgCreate(name="Test", slug="test", plan="professional")
        assert org.name == "Test"
        assert org.slug == "test"


class TestProjectSchemas:
    def test_project_create_with_keywords(self):
        proj = ProjectCreate(
            name="Brand Monitor",
            client_name="Client X",
            keywords=[KeywordCreate(term="brand", keyword_type="brand")],
        )
        assert len(proj.keywords) == 1
        assert proj.platforms == "twitter,facebook,instagram,linkedin,youtube"

    def test_project_create_custom_platforms(self):
        proj = ProjectCreate(
            name="Test",
            client_name="Client",
            platforms="twitter,tiktok",
        )
        assert "tiktok" in proj.platforms

    def test_project_create_no_keywords(self):
        proj = ProjectCreate(name="Test", client_name="Client")
        assert proj.keywords == []

    def test_project_create_with_competitor_ids(self):
        proj = ProjectCreate(
            name="Test",
            client_name="Client",
            competitor_ids="1,2,3",
        )
        assert proj.competitor_ids == "1,2,3"

    def test_keyword_create_defaults(self):
        kw = KeywordCreate(term="hello")
        assert kw.keyword_type == "brand"


class TestMentionSchemas:
    def test_mention_out_all_fields(self):
        m = MentionOut(
            id=1,
            platform="twitter",
            text="Hello",
            likes=10,
            shares=5,
            comments=2,
            reach=1000,
            sentiment="positive",
            sentiment_score=0.8,
            has_media=False,
            is_flagged=False,
            collected_at=datetime.utcnow(),
            source_url=None,
            author_name=None,
            author_handle=None,
            author_followers=None,
            language=None,
            matched_keywords=None,
            topics=None,
            media_type=None,
            author_influence_score=None,
            author_is_bot=None,
            virality_score=None,
            published_at=None,
        )
        assert m.sentiment == "positive"
        assert m.id == 1

    def test_mention_out_minimal(self):
        m = MentionOut(
            id=2,
            platform="facebook",
            text="Test",
            likes=0,
            shares=0,
            comments=0,
            reach=0,
            sentiment="neutral",
            sentiment_score=0.0,
            has_media=False,
            is_flagged=False,
            collected_at=datetime.utcnow(),
            source_url=None,
            author_name=None,
            author_handle=None,
            author_followers=None,
            language=None,
            matched_keywords=None,
            topics=None,
            media_type=None,
            author_influence_score=None,
            author_is_bot=None,
            virality_score=None,
            published_at=None,
        )
        assert m.platform == "facebook"


class TestAlertSchemas:
    def test_alert_rule_defaults(self):
        rule = AlertRuleCreate(name="Spike Alert", rule_type="volume_spike")
        assert rule.threshold == 2.0
        assert rule.window_minutes == 60
        assert rule.channels == "email"
        assert rule.webhook_url is None

    def test_alert_rule_custom(self):
        rule = AlertRuleCreate(
            name="Custom Alert",
            rule_type="negative_surge",
            threshold=5.0,
            window_minutes=30,
            channels="slack,email",
            webhook_url="https://hooks.example.com/alert",
        )
        assert rule.threshold == 5.0
        assert rule.window_minutes == 30


class TestSearchSchemas:
    def test_search_request_defaults(self):
        req = SearchRequest(project_id=1, query="test")
        assert req.page == 1
        assert req.page_size == 50
        assert req.platform is None
        assert req.sentiment is None

    def test_search_request_with_filters(self):
        req = SearchRequest(
            project_id=1,
            query="test",
            platform="twitter",
            sentiment="positive",
            page=2,
            page_size=25,
        )
        assert req.platform == "twitter"
        assert req.page == 2


class TestExportSchemas:
    def test_export_create_defaults(self):
        exp = ExportCreate(project_id=1)
        assert exp.export_format == "csv"
        assert exp.filters_json is None

    def test_export_create_custom_format(self):
        exp = ExportCreate(project_id=1, export_format="excel")
        assert exp.export_format == "excel"


class TestScheduledPostSchemas:
    def test_scheduled_post_create(self):
        post = ScheduledPostCreate(
            project_id=1,
            platform="twitter",
            content="Hello world",
            scheduled_at=datetime.utcnow(),
        )
        assert post.platform == "twitter"
        assert post.reply_to_mention_id is None


class TestWorkflowSchemas:
    def test_workflow_create(self):
        wf = WorkflowCreate(
            project_id=1,
            name="Auto Flag",
            trigger_json='{"type": "negative_influencer", "threshold": 10000}',
            actions_json='[{"type": "flag_mention"}]',
        )
        assert wf.name == "Auto Flag"
        assert wf.project_id == 1
