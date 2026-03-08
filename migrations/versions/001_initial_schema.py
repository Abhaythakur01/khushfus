"""Initial schema - all tables from shared.models

Revision ID: 001_initial
Revises: None
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Enum types used across tables
# create_type=False prevents SQLAlchemy from auto-creating enums during op.create_table,
# since we create them explicitly in upgrade() with checkfirst=True.
plan_tier = sa.Enum("free", "starter", "professional", "enterprise", name="plantier", create_type=False)
org_role = sa.Enum("owner", "admin", "manager", "analyst", "viewer", name="orgrole", create_type=False)
project_status = sa.Enum("active", "paused", "archived", name="projectstatus", create_type=False)
platform = sa.Enum(
    "twitter", "facebook", "instagram", "linkedin", "youtube",
    "news", "blog", "forum", "reddit", "telegram", "quora", "press", "other",
    name="platform", create_type=False,
)
sentiment = sa.Enum("positive", "negative", "neutral", "mixed", name="sentiment", create_type=False)
report_type = sa.Enum("daily", "weekly", "monthly", "custom", name="reporttype", create_type=False)
alert_severity = sa.Enum("low", "medium", "high", "critical", name="alertseverity", create_type=False)
export_format = sa.Enum("csv", "excel", "pdf", "json", name="exportformat", create_type=False)
export_status = sa.Enum("pending", "processing", "completed", "failed", name="exportstatus", create_type=False)
publish_status = sa.Enum("draft", "scheduled", "published", "failed", name="publishstatus", create_type=False)
workflow_status = sa.Enum("active", "paused", "completed", "failed", name="workflowstatus", create_type=False)


def upgrade() -> None:
    # Create enum types
    plan_tier.create(op.get_bind(), checkfirst=True)
    org_role.create(op.get_bind(), checkfirst=True)
    project_status.create(op.get_bind(), checkfirst=True)
    platform.create(op.get_bind(), checkfirst=True)
    sentiment.create(op.get_bind(), checkfirst=True)
    report_type.create(op.get_bind(), checkfirst=True)
    alert_severity.create(op.get_bind(), checkfirst=True)
    export_format.create(op.get_bind(), checkfirst=True)
    export_status.create(op.get_bind(), checkfirst=True)
    publish_status.create(op.get_bind(), checkfirst=True)
    workflow_status.create(op.get_bind(), checkfirst=True)

    # ── organizations ──
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("plan", plan_tier, server_default="free"),
        sa.Column("mention_quota", sa.Integer, server_default="10000"),
        sa.Column("mentions_used", sa.Integer, server_default="0"),
        sa.Column("max_projects", sa.Integer, server_default="3"),
        sa.Column("max_users", sa.Integer, server_default="5"),
        sa.Column("sso_enabled", sa.Boolean, server_default="false"),
        sa.Column("sso_provider", sa.String(50), nullable=True),
        sa.Column("sso_metadata_url", sa.Text, nullable=True),
        sa.Column("sso_entity_id", sa.String(255), nullable=True),
        sa.Column("logo_url", sa.Text, nullable=True),
        sa.Column("primary_color", sa.String(7), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── users ──
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column("sso_subject", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("is_superadmin", sa.Boolean, server_default="false"),
        sa.Column("last_login_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── org_members ──
    op.create_table(
        "org_members",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("organization_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("role", org_role, server_default="viewer"),
        sa.Column("invited_by", sa.Integer, nullable=True),
        sa.Column("joined_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── api_keys ──
    op.create_table(
        "api_keys",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("organization_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key_hash", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("prefix", sa.String(10), nullable=False),
        sa.Column("scopes", sa.Text, server_default="read"),
        sa.Column("rate_limit", sa.Integer, server_default="1000"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("last_used_at", sa.DateTime, nullable=True),
        sa.Column("expires_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── projects ──
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("organization_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("status", project_status, server_default="active"),
        sa.Column("platforms", sa.Text, server_default="twitter,facebook,instagram,linkedin,youtube"),
        sa.Column("competitor_ids", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── keywords ──
    op.create_table(
        "keywords",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("term", sa.String(255), nullable=False),
        sa.Column("keyword_type", sa.String(50), server_default="brand"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── mentions ──
    op.create_table(
        "mentions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("platform", platform, nullable=False, index=True),
        sa.Column("source_id", sa.String(255), nullable=True),
        sa.Column("source_url", sa.Text, nullable=True),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("author_name", sa.String(255), nullable=True),
        sa.Column("author_handle", sa.String(255), nullable=True),
        sa.Column("author_followers", sa.Integer, nullable=True),
        sa.Column("author_profile_url", sa.Text, nullable=True),
        sa.Column("likes", sa.Integer, server_default="0"),
        sa.Column("shares", sa.Integer, server_default="0"),
        sa.Column("comments", sa.Integer, server_default="0"),
        sa.Column("reach", sa.Integer, server_default="0"),
        sa.Column("sentiment", sentiment, nullable=False, index=True),
        sa.Column("sentiment_score", sa.Float, server_default="0.0"),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("matched_keywords", sa.Text, nullable=True),
        sa.Column("topics", sa.Text, nullable=True),
        sa.Column("entities", sa.Text, nullable=True),
        sa.Column("has_media", sa.Boolean, server_default="false"),
        sa.Column("media_type", sa.String(20), nullable=True),
        sa.Column("media_url", sa.Text, nullable=True),
        sa.Column("media_ocr_text", sa.Text, nullable=True),
        sa.Column("media_labels", sa.Text, nullable=True),
        sa.Column("media_transcript", sa.Text, nullable=True),
        sa.Column("author_influence_score", sa.Float, nullable=True),
        sa.Column("author_is_bot", sa.Boolean, nullable=True),
        sa.Column("author_org", sa.String(255), nullable=True),
        sa.Column("virality_score", sa.Float, nullable=True),
        sa.Column("published_at", sa.DateTime, nullable=True, index=True),
        sa.Column("collected_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("is_flagged", sa.Boolean, server_default="false"),
    )

    # ── reports ──
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("report_type", report_type, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("period_start", sa.DateTime, nullable=False),
        sa.Column("period_end", sa.DateTime, nullable=False),
        sa.Column("file_path", sa.Text, nullable=True),
        sa.Column("data_json", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── alert_rules ──
    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("rule_type", sa.String(50), nullable=False),
        sa.Column("threshold", sa.Float, server_default="0.0"),
        sa.Column("window_minutes", sa.Integer, server_default="60"),
        sa.Column("channels", sa.Text, server_default="email"),
        sa.Column("webhook_url", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── alert_logs ──
    op.create_table(
        "alert_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("rule_id", sa.Integer, sa.ForeignKey("alert_rules.id"), nullable=True),
        sa.Column("alert_type", sa.String(50), nullable=False),
        sa.Column("severity", alert_severity, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("data_json", sa.Text, nullable=True),
        sa.Column("acknowledged", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── saved_searches ──
    op.create_table(
        "saved_searches",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("query_json", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── scheduled_posts ──
    op.create_table(
        "scheduled_posts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("platform", platform, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("media_urls", sa.Text, nullable=True),
        sa.Column("scheduled_at", sa.DateTime, nullable=False, index=True),
        sa.Column("published_at", sa.DateTime, nullable=True),
        sa.Column("status", publish_status, server_default="draft"),
        sa.Column("platform_post_id", sa.String(255), nullable=True),
        sa.Column("approved_by", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("reply_to_mention_id", sa.Integer, sa.ForeignKey("mentions.id"), nullable=True),
    )

    # ── export_jobs ──
    op.create_table(
        "export_jobs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("export_format", export_format, nullable=False),
        sa.Column("filters_json", sa.Text, nullable=True),
        sa.Column("status", export_status, server_default="pending"),
        sa.Column("file_path", sa.Text, nullable=True),
        sa.Column("row_count", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime, nullable=True),
    )

    # ── integrations ──
    op.create_table(
        "integrations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("organization_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("integration_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("config_json", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("last_sync_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── competitor_benchmarks ──
    op.create_table(
        "competitor_benchmarks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("competitor_project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("period_start", sa.DateTime, nullable=False),
        sa.Column("period_end", sa.DateTime, nullable=False),
        sa.Column("data_json", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── workflows ──
    op.create_table(
        "workflows",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("trigger_json", sa.Text, nullable=False),
        sa.Column("actions_json", sa.Text, nullable=False),
        sa.Column("status", workflow_status, server_default="active"),
        sa.Column("executions", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # ── audit_logs ──
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("organization_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.Integer, nullable=True),
        sa.Column("details_json", sa.Text, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), index=True),
    )

    # ── platform_quotas ──
    op.create_table(
        "platform_quotas",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("platform", platform, nullable=False, index=True),
        sa.Column("endpoint", sa.String(255), nullable=False),
        sa.Column("max_requests", sa.Integer, nullable=False),
        sa.Column("window_seconds", sa.Integer, nullable=False),
        sa.Column("requests_used", sa.Integer, server_default="0"),
        sa.Column("window_reset_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("platform_quotas")
    op.drop_table("audit_logs")
    op.drop_table("workflows")
    op.drop_table("competitor_benchmarks")
    op.drop_table("integrations")
    op.drop_table("export_jobs")
    op.drop_table("scheduled_posts")
    op.drop_table("saved_searches")
    op.drop_table("alert_logs")
    op.drop_table("alert_rules")
    op.drop_table("reports")
    op.drop_table("mentions")
    op.drop_table("keywords")
    op.drop_table("projects")
    op.drop_table("api_keys")
    op.drop_table("org_members")
    op.drop_table("users")
    op.drop_table("organizations")

    # Drop enum types
    for enum_type in [
        workflow_status, publish_status, export_status, export_format,
        alert_severity, report_type, sentiment, platform,
        project_status, org_role, plan_tier,
    ]:
        enum_type.drop(op.get_bind(), checkfirst=True)
