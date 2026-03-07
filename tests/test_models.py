"""Tests for database models."""
import pytest

from shared.models import (
    AlertRule,
    AlertSeverity,
    ExportFormat,
    ExportStatus,
    Keyword,
    Mention,
    Organization,
    OrgMember,
    OrgRole,
    Platform,
    PlanTier,
    Project,
    ProjectStatus,
    PublishStatus,
    Report,
    Sentiment,
    User,
    WorkflowStatus,
)


class TestEnums:
    def test_platform_values(self):
        assert Platform.TWITTER.value == "twitter"
        assert Platform.FACEBOOK.value == "facebook"
        assert Platform.INSTAGRAM.value == "instagram"
        assert Platform.LINKEDIN.value == "linkedin"
        assert Platform.YOUTUBE.value == "youtube"
        assert Platform.REDDIT.value == "reddit"
        assert Platform.NEWS.value == "news"
        assert Platform.OTHER.value == "other"

    def test_sentiment_values(self):
        assert Sentiment.POSITIVE.value == "positive"
        assert Sentiment.NEGATIVE.value == "negative"
        assert Sentiment.NEUTRAL.value == "neutral"
        assert Sentiment.MIXED.value == "mixed"

    def test_org_role_values(self):
        assert OrgRole.OWNER.value == "owner"
        assert OrgRole.ADMIN.value == "admin"
        assert OrgRole.MANAGER.value == "manager"
        assert OrgRole.ANALYST.value == "analyst"
        assert OrgRole.VIEWER.value == "viewer"

    def test_plan_tier_values(self):
        assert PlanTier.FREE.value == "free"
        assert PlanTier.STARTER.value == "starter"
        assert PlanTier.PROFESSIONAL.value == "professional"
        assert PlanTier.ENTERPRISE.value == "enterprise"

    def test_project_status_values(self):
        assert ProjectStatus.ACTIVE.value == "active"
        assert ProjectStatus.PAUSED.value == "paused"
        assert ProjectStatus.ARCHIVED.value == "archived"

    def test_export_format_values(self):
        assert ExportFormat.CSV.value == "csv"
        assert ExportFormat.EXCEL.value == "excel"
        assert ExportFormat.PDF.value == "pdf"
        assert ExportFormat.JSON.value == "json"

    def test_export_status_values(self):
        assert ExportStatus.PENDING.value == "pending"
        assert ExportStatus.COMPLETED.value == "completed"
        assert ExportStatus.FAILED.value == "failed"

    def test_publish_status_values(self):
        assert PublishStatus.DRAFT.value == "draft"
        assert PublishStatus.SCHEDULED.value == "scheduled"
        assert PublishStatus.PUBLISHED.value == "published"

    def test_alert_severity_values(self):
        assert AlertSeverity.LOW.value == "low"
        assert AlertSeverity.MEDIUM.value == "medium"
        assert AlertSeverity.HIGH.value == "high"
        assert AlertSeverity.CRITICAL.value == "critical"

    def test_workflow_status_values(self):
        assert WorkflowStatus.ACTIVE.value == "active"
        assert WorkflowStatus.PAUSED.value == "paused"
        assert WorkflowStatus.COMPLETED.value == "completed"
        assert WorkflowStatus.FAILED.value == "failed"


@pytest.mark.integration
class TestModelCreation:
    async def test_create_organization(self, db_session):
        org = Organization(name="Test", slug="test-model-org", plan="free")
        db_session.add(org)
        await db_session.commit()
        assert org.id is not None
        assert org.is_active is True

    async def test_create_user(self, db_session):
        user = User(
            email="model-test@example.com",
            full_name="Model Test User",
            hashed_password="hashed",
        )
        db_session.add(user)
        await db_session.commit()
        assert user.id is not None
        assert user.is_active is True
        assert user.is_superadmin is False

    async def test_create_project_with_org(self, db_session, sample_org):
        project = Project(
            organization_id=sample_org.id,
            name="Test Project",
            client_name="Client",
        )
        db_session.add(project)
        await db_session.commit()
        assert project.organization_id == sample_org.id
        assert project.id is not None

    async def test_create_keyword(self, db_session, sample_project):
        kw = Keyword(
            project_id=sample_project.id,
            term="new keyword",
            keyword_type="brand",
        )
        db_session.add(kw)
        await db_session.commit()
        assert kw.id is not None
        assert kw.is_active is True

    async def test_create_mention(self, db_session, sample_project):
        mention = Mention(
            project_id=sample_project.id,
            platform="twitter",
            source_id="test_model_123",
            text="Test mention",
            sentiment="positive",
            sentiment_score=0.8,
        )
        db_session.add(mention)
        await db_session.commit()
        assert mention.id is not None
        assert mention.likes == 0
        assert mention.shares == 0

    async def test_create_alert_rule(self, db_session, sample_project):
        rule = AlertRule(
            project_id=sample_project.id,
            name="Spike",
            rule_type="volume_spike",
            threshold=2.0,
        )
        db_session.add(rule)
        await db_session.commit()
        assert rule.id is not None
        assert rule.is_active is True

    async def test_create_org_member(self, db_session, sample_org, sample_user):
        member = OrgMember(
            organization_id=sample_org.id,
            user_id=sample_user.id,
            role="admin",
        )
        db_session.add(member)
        await db_session.commit()
        assert member.id is not None
