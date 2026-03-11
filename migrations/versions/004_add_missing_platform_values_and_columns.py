"""Add missing platform enum values, new model columns not covered by 001-003

Revision ID: 004_missing_fields
Revises: 003_schema_hardening
Create Date: 2026-03-11

Covers gaps between shared/models.py and migrations 001-003:

1. platform enum: add 9 new collectors (tiktok, discord, threads, bluesky,
   pinterest, appstore, reviews, mastodon, podcast) — present in models since
   the 20-collector expansion but never migrated.

2. organizations.updated_at — missing from 001_initial_schema.

3. mentions.assigned_to — missing from 001_initial_schema.

4. export_jobs.updated_at — missing from 001_initial_schema.

5. integrations.updated_at — missing from 001_initial_schema.

6. alert_rules.updated_at — missing from 001_initial_schema.

7. workflows.updated_at — missing from 001_initial_schema.
   (created_by / updated_by on workflows were added in 003_schema_hardening.)
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004_missing_fields"
down_revision: Union[str, None] = "003_schema_hardening"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. platform enum: add 9 new collector platforms
    #    PostgreSQL requires ALTER TYPE … ADD VALUE; SQLite ignores ALTER TYPE.
    # -------------------------------------------------------------------------
    new_platforms = [
        "tiktok",
        "discord",
        "threads",
        "bluesky",
        "pinterest",
        "appstore",
        "reviews",
        "mastodon",
        "podcast",
    ]
    for value in new_platforms:
        op.execute(f"ALTER TYPE platform ADD VALUE IF NOT EXISTS '{value}'")

    # -------------------------------------------------------------------------
    # 2. organizations.updated_at
    # -------------------------------------------------------------------------
    op.add_column(
        "organizations",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    # -------------------------------------------------------------------------
    # 3. mentions.assigned_to
    # -------------------------------------------------------------------------
    op.add_column(
        "mentions",
        sa.Column("assigned_to", sa.String(255), nullable=True),
    )

    # -------------------------------------------------------------------------
    # 4. export_jobs.updated_at
    # -------------------------------------------------------------------------
    op.add_column(
        "export_jobs",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    # -------------------------------------------------------------------------
    # 5. integrations.updated_at
    # -------------------------------------------------------------------------
    op.add_column(
        "integrations",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    # -------------------------------------------------------------------------
    # 6. alert_rules.updated_at
    # -------------------------------------------------------------------------
    op.add_column(
        "alert_rules",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    # -------------------------------------------------------------------------
    # 7. workflows.updated_at
    # -------------------------------------------------------------------------
    op.add_column(
        "workflows",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    # Remove columns added in upgrade (reverse order)
    op.drop_column("workflows", "updated_at")
    op.drop_column("alert_rules", "updated_at")
    op.drop_column("integrations", "updated_at")
    op.drop_column("export_jobs", "updated_at")
    op.drop_column("mentions", "assigned_to")
    op.drop_column("organizations", "updated_at")

    # Note: PostgreSQL does not support removing enum values.
    # The tiktok/discord/threads/bluesky/pinterest/appstore/reviews/mastodon/podcast
    # values will remain in the platform enum after downgrade.
