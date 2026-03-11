# ADR 002 — PostgreSQL Row-Level Security for Tenant Isolation

**Status:** Accepted
**Date:** 2025-10-15
**Authors:** KhushFus Engineering

---

## Context

KhushFus is a multi-tenant SaaS platform. Multiple organizations share the same database instance. Each organization must never be able to see, query, or modify another organization's data. Tenant data isolation is a hard security requirement.

The team considered three isolation models:

**Option A: Separate database per tenant**
- Strongest isolation — impossible to accidentally cross-query
- Extremely high operational overhead: migrations must run N times, backups scale with tenant count
- Provisioning a new tenant requires creating a database, user, and running migrations
- Economically viable only for very large enterprise contracts with dedicated infrastructure

**Option B: Separate schema per tenant (schema-per-tenant)**
- Strong isolation; all tenants in one Postgres instance but separate schemas
- Alembic's migration tooling does not natively support per-schema migrations
- `search_path` manipulation required on every connection
- Schema count grows without bound; Postgres performance degrades with thousands of schemas

**Option C: Shared tables with `organization_id` + application-level filtering**
- Simple to implement and migrate
- Easy to make mistakes — a developer forgets to add `WHERE organization_id = ?` and leaks data
- No database-level enforcement; all isolation is in application code

**Option D: Shared tables with `organization_id` + PostgreSQL Row-Level Security (RLS)**
- Combines the simplicity of shared tables with database-enforced isolation
- Even if application code forgets to filter, Postgres enforces the policy at the storage layer
- Standard Postgres feature — no external dependencies
- Single migration to enable per table

---

## Decision

We will use **PostgreSQL Row-Level Security (RLS)** on all tenant-scoped tables.

RLS policies are applied via migration `002_row_level_security.py`. The gateway sets the current organization context on each database session using `set_tenant_context(session, org_id)` in `shared/database.py`, which executes:

```sql
SET LOCAL app.current_org_id = '<org_id>';
```

RLS policies on tables check this session variable:

```sql
CREATE POLICY tenant_isolation ON mentions
  USING (project_id IN (
    SELECT id FROM projects WHERE organization_id = current_setting('app.current_org_id')::int
  ));
```

Superadmin bypass is handled by disabling RLS for the `khushfus` role using `BYPASSRLS` or by setting `app.current_org_id = '0'` as a sentinel.

**Tables protected by RLS (14 total):**
`projects`, `keywords`, `mentions`, `reports`, `alert_rules`, `alert_logs`, `saved_searches`, `scheduled_posts`, `export_jobs`, `workflows`, `competitor_benchmarks`, `api_keys`, `org_members`, `audit_logs`

**Tables not subject to RLS:**
`organizations`, `users`, `platform_quotas` — these are system-level tables accessed by privileged gateway routes only.

**SQLite fallback:** RLS is skipped when `DATABASE_URL` contains `sqlite` (development and test mode). `shared/database.py` checks `set_tenant_context()` and is a no-op for SQLite.

---

## Consequences

**Positive:**
- Defense-in-depth: even if the application layer has a bug that omits the `organization_id` filter, Postgres blocks the cross-tenant read
- Uniform policy applied consistently across all services that use `shared/database.py`
- No per-query filter boilerplate needed in service code
- Standard, well-documented Postgres feature

**Negative:**
- `set_tenant_context()` must be called at the start of every request in the gateway middleware; forgetting to call it would cause queries to fail or return empty results (which is the safe failure mode — data is hidden, not leaked)
- RLS policies add a small amount of query overhead (additional subquery per row check) — acceptable at current scale
- SQLite does not support RLS, so development and testing environments do not benefit from this protection; developers must be careful not to rely on RLS as the only defense in application code
- RLS does not protect against aggregates that leak info (e.g., `COUNT(*)` on a table could reveal how many rows exist for another tenant if the policy is misconfigured). Policies must be carefully reviewed.

**Follow-up work:**
- Add integration tests that verify RLS prevents cross-tenant data access using two distinct organization sessions
- Add linting rule to flag database queries that do not call `set_tenant_context()` before executing
- Review RLS policies annually as new tables are added
