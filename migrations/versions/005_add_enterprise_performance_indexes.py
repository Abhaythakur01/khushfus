"""Add enterprise performance indexes for dashboards, analytics, and admin queries

Revision ID: 005_enterprise_indexes
Revises: 004_missing_fields
Create Date: 2026-03-12

Indexes identified in the enterprise audit:
1. mentions(project_id, sentiment, published_at) — filtered dashboard queries
2. mentions(project_id, author_influence_score) — influencer sorting
3. projects(organization_id) WHERE is_deleted = FALSE — active projects partial index
4. audit_log(user_id, created_at) — user audit trail queries
5. export_jobs(status, created_at) — job cleanup queries
6. mentions(project_id, platform, published_at) — platform-specific analytics
7. api_keys(organization_id, is_active) — org API key lookups
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "005_enterprise_indexes"
down_revision: Union[str, None] = "004_missing_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Mentions: dashboard filter index (project + sentiment + date) ---
    op.create_index(
        "ix_mentions_project_sentiment_published",
        "mentions",
        ["project_id", "sentiment", "published_at"],
        postgresql_concurrently=True,
    )

    # --- Mentions: influencer sorting index ---
    op.create_index(
        "ix_mentions_project_influence",
        "mentions",
        ["project_id", "author_influence_score"],
        postgresql_concurrently=True,
    )

    # --- Projects: partial index on active (non-deleted) projects per org ---
    op.create_index(
        "ix_projects_org_active",
        "projects",
        ["organization_id"],
        postgresql_where=text("is_deleted = FALSE"),
        postgresql_concurrently=True,
    )

    # --- Audit log: user trail queries ---
    op.create_index(
        "ix_audit_log_user_created",
        "audit_log",
        ["user_id", "created_at"],
        postgresql_concurrently=True,
    )

    # --- Export jobs: status + date for cleanup queries ---
    op.create_index(
        "ix_export_jobs_status_created",
        "export_jobs",
        ["status", "created_at"],
        postgresql_concurrently=True,
    )

    # --- Mentions: platform-specific analytics ---
    op.create_index(
        "ix_mentions_project_platform_published",
        "mentions",
        ["project_id", "platform", "published_at"],
        postgresql_concurrently=True,
    )

    # --- API keys: org lookups for active keys ---
    op.create_index(
        "ix_api_keys_org_active",
        "api_keys",
        ["organization_id", "is_active"],
        postgresql_concurrently=True,
    )


def downgrade() -> None:
    op.drop_index("ix_api_keys_org_active", "api_keys")
    op.drop_index("ix_mentions_project_platform_published", "mentions")
    op.drop_index("ix_export_jobs_status_created", "export_jobs")
    op.drop_index("ix_audit_log_user_created", "audit_log")
    op.drop_index("ix_projects_org_active", "projects")
    op.drop_index("ix_mentions_project_influence", "mentions")
    op.drop_index("ix_mentions_project_sentiment_published", "mentions")
