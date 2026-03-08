"""Add PostgreSQL Row-Level Security policies for tenant isolation

Revision ID: 002_rls
Revises: 001_initial
Create Date: 2026-03-07

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002_rls"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables with direct organization_id column
DIRECT_ORG_TABLES = [
    "projects",
    "org_members",
    "api_keys",
    "audit_logs",
]

# Tables that reference organization indirectly through project_id
PROJECT_SCOPED_TABLES = [
    "mentions",
    "keywords",
    "reports",
    "alert_rules",
    "alert_logs",
    "saved_searches",
    "scheduled_posts",
    "export_jobs",
    "competitor_benchmarks",
    "workflows",
]

ALL_RLS_TABLES = DIRECT_ORG_TABLES + PROJECT_SCOPED_TABLES


def upgrade() -> None:
    # -- Direct organization_id tables --
    for table in DIRECT_ORG_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation_{table} ON {table} "
            f"USING (organization_id = current_setting('app.current_org_id', true)::int)"
        )
        # Force RLS even for table owners (except superusers)
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    # -- Project-scoped tables (indirect org reference) --
    for table in PROJECT_SCOPED_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation_{table} ON {table} "
            f"USING (project_id IN ("
            f"SELECT id FROM projects "
            f"WHERE organization_id = current_setting('app.current_org_id', true)::int"
            f"))"
        )
        # Force RLS even for table owners (except superusers)
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in ALL_RLS_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
