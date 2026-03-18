"""Add report format, soft-delete, audit trail, composite indexes

Revision ID: 003_schema_hardening
Revises: 002_rls
Create Date: 2026-03-11

Covers Layer 2 enterprise hardening:
- Report.format column (pdf/pptx)
- ReportType enum: add hourly, quarterly, yearly
- Soft-delete (is_deleted, deleted_at) on projects, users, mentions, reports
- updated_at on keywords, reports, saved_searches, scheduled_posts
- created_by/updated_by audit trail on projects, reports, alert_rules, scheduled_posts, workflows
- Composite unique constraint + dedup index on mentions (project_id, source_id, platform)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003_schema_hardening"
down_revision: Union[str, None] = "002_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Add new ReportType enum values (PostgreSQL only) ---
    # PostgreSQL requires ALTER TYPE to add new enum values
    op.execute("ALTER TYPE reporttype ADD VALUE IF NOT EXISTS 'hourly'")
    op.execute("ALTER TYPE reporttype ADD VALUE IF NOT EXISTS 'quarterly'")
    op.execute("ALTER TYPE reporttype ADD VALUE IF NOT EXISTS 'yearly'")

    # --- Report: add format column ---
    op.add_column("reports", sa.Column("format", sa.String(10), server_default="pdf", nullable=False))
    op.add_column("reports", sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("reports", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column("reports", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.create_index("ix_reports_is_deleted", "reports", ["is_deleted"])

    # --- Project: soft-delete ---
    op.add_column("projects", sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("projects", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_projects_is_deleted", "projects", ["is_deleted"])

    # --- User: soft-delete ---
    op.add_column("users", sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_users_is_deleted", "users", ["is_deleted"])

    # --- Mention: soft-delete ---
    op.add_column("mentions", sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("mentions", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_mentions_is_deleted", "mentions", ["is_deleted"])

    # --- Keyword: updated_at ---
    op.add_column("keywords", sa.Column("updated_at", sa.DateTime(), nullable=True))

    # --- SavedSearch: updated_at ---
    op.add_column("saved_searches", sa.Column("updated_at", sa.DateTime(), nullable=True))

    # --- ScheduledPost: updated_at ---
    op.add_column("scheduled_posts", sa.Column("updated_at", sa.DateTime(), nullable=True))

    # --- Audit trail: created_by / updated_by ---
    audit_tables = ("projects", "reports", "alert_rules", "scheduled_posts", "workflows")
    for tbl in audit_tables:
        op.add_column(tbl, sa.Column(
            "created_by", sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ))
        op.add_column(tbl, sa.Column(
            "updated_by", sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
        ))

    # --- Mention: composite dedup index ---
    # Drop old unique constraint (project_id, source_id) and replace with (project_id, source_id, platform)
    try:
        op.drop_constraint("uq_mention_source", "mentions", type_="unique")
    except Exception:
        pass  # Constraint may not exist if schema was created without it
    op.create_unique_constraint("uq_mention_source_platform", "mentions", ["project_id", "source_id", "platform"])
    op.create_index("ix_mention_dedup", "mentions", ["project_id", "source_id", "platform"])


def downgrade() -> None:
    # --- Mention: revert dedup index ---
    op.drop_index("ix_mention_dedup", "mentions")
    op.drop_constraint("uq_mention_source_platform", "mentions", type_="unique")
    op.create_unique_constraint("uq_mention_source", "mentions", ["project_id", "source_id"])

    # --- Remove audit trail columns ---
    op.drop_column("workflows", "updated_by")
    op.drop_column("workflows", "created_by")
    op.drop_column("scheduled_posts", "updated_by")
    op.drop_column("scheduled_posts", "created_by")
    op.drop_column("alert_rules", "updated_by")
    op.drop_column("alert_rules", "created_by")
    op.drop_column("reports", "updated_by")
    op.drop_column("reports", "created_by")
    op.drop_column("projects", "updated_by")
    op.drop_column("projects", "created_by")

    # --- ScheduledPost: remove updated_at ---
    op.drop_column("scheduled_posts", "updated_at")

    # --- SavedSearch: remove updated_at ---
    op.drop_column("saved_searches", "updated_at")

    # --- Keyword: remove updated_at ---
    op.drop_column("keywords", "updated_at")

    # --- Mention: remove soft-delete ---
    op.drop_index("ix_mentions_is_deleted", "mentions")
    op.drop_column("mentions", "deleted_at")
    op.drop_column("mentions", "is_deleted")

    # --- User: remove soft-delete ---
    op.drop_index("ix_users_is_deleted", "users")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "is_deleted")

    # --- Project: remove soft-delete ---
    op.drop_index("ix_projects_is_deleted", "projects")
    op.drop_column("projects", "deleted_at")
    op.drop_column("projects", "is_deleted")

    # --- Report: remove new columns ---
    op.drop_index("ix_reports_is_deleted", "reports")
    op.drop_column("reports", "updated_at")
    op.drop_column("reports", "deleted_at")
    op.drop_column("reports", "is_deleted")
    op.drop_column("reports", "format")

    # Note: PostgreSQL does not support removing enum values.
    # The hourly/quarterly/yearly values will remain in the enum.
