# Runbook: Database Issues

**Applies to:** PostgreSQL (primary data store)
**Typical severity:** P1 (connection failures, data loss risk) / P2 (slow queries, disk warnings)
**Last reviewed:** 2026-03-11

---

## Symptoms

- Services log `OperationalError`, `asyncpg.exceptions.ConnectionDoesNotExistError`, or `could not connect to server`
- Gateway `/health` shows `"postgres": "unhealthy"`
- Queries timing out; frontend shows loading spinners indefinitely
- Disk usage alert fires in Grafana
- `pg_stat_activity` shows many idle-in-transaction connections

---

## Scenario A — Cannot Connect to PostgreSQL

### Step 1 — Verify the container is running

```bash
docker compose ps postgres
docker compose logs postgres --tail=50
```

### Step 2 — Check if Postgres is accepting connections

```bash
docker compose exec postgres pg_isready -U khushfus -d khushfus
# Expected: /var/run/postgresql:5432 - accepting connections
```

### Step 3 — Connect with psql

```bash
docker compose exec postgres psql -U khushfus -d khushfus -c "SELECT 1;"
```

### Step 4 — Check max_connections

```bash
docker compose exec postgres psql -U khushfus -d khushfus \
  -c "SELECT count(*) AS active, max_conn FROM pg_stat_activity, (SELECT setting::int AS max_conn FROM pg_settings WHERE name='max_connections') s GROUP BY max_conn;"
```

If active connections approach `max_connections`, services are being starved. Increase `max_connections` in `postgresql.conf` or reduce the connection pool size in `shared/database.py` (`pool_size`, `max_overflow`).

### Step 5 — Restart Postgres (last resort)

```bash
docker compose restart postgres
# Wait ~15 seconds for recovery, then verify
docker compose exec postgres pg_isready -U khushfus
```

---

## Scenario B — Slow Queries / High Latency

### Step 1 — Identify long-running queries

```sql
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
  AND state != 'idle'
ORDER BY duration DESC;
```

### Step 2 — Kill a blocking query

```sql
-- Terminate a specific query by PID
SELECT pg_terminate_backend(<pid>);
```

### Step 3 — Check for missing indexes

```sql
-- Tables with high sequential scan counts suggest missing indexes
SELECT schemaname, relname, seq_scan, idx_scan,
       seq_scan - idx_scan AS seq_minus_idx
FROM pg_stat_user_tables
ORDER BY seq_minus_idx DESC
LIMIT 20;
```

The `mentions` table is the highest-volume table. It has composite indexes on `(project_id, published_at)`, `(project_id, sentiment)`, and `(project_id, platform)`. Verify these exist:

```sql
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'mentions';
```

### Step 4 — Run EXPLAIN ANALYZE on a slow query

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM mentions WHERE project_id = 42 ORDER BY published_at DESC LIMIT 50;
```

Look for `Seq Scan` on large tables — these indicate missing indexes.

### Step 5 — Update table statistics

```sql
ANALYZE mentions;
ANALYZE projects;
```

---

## Scenario C — Disk Full

### Step 1 — Check disk usage

```bash
df -h
docker system df

# Inside the Postgres container
docker compose exec postgres df -h /var/lib/postgresql/data
```

### Step 2 — Find the largest tables

```sql
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
```

The `mentions` table and `audit_logs` will typically be the largest.

### Step 3 — Apply retention policy

Delete old mentions according to plan-tier retention rules:

```sql
-- Example: delete mentions older than 90 days (Starter plan)
DELETE FROM mentions WHERE collected_at < NOW() - INTERVAL '90 days';
VACUUM ANALYZE mentions;
```

Consult the Audit service (`services/audit_service`) for the configured retention periods per organization.

### Step 4 — Reclaim space

```sql
-- After large deletes, reclaim space
VACUUM FULL mentions;  -- locks the table — use during maintenance window
-- Or, non-locking alternative:
VACUUM mentions;
```

---

## Scenario D — Row-Level Security (RLS) Issues

If tenants see each other's data or get unexpected 403/404 errors:

```sql
-- Check RLS is enabled on the affected table
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'mentions';

-- Check the active RLS policies
SELECT * FROM pg_policies WHERE tablename = 'mentions';

-- Test with a specific org context
SET app.current_org_id = '42';
SELECT count(*) FROM mentions;
```

RLS is set per request via `set_tenant_context()` in `shared/database.py`. If `app.current_org_id` is not being set, check the gateway middleware in `services/gateway/app/deps.py`.

---

## Migrations

```bash
# Apply pending migrations
make migrate

# Roll back the last migration
make migrate-down

# Check current migration revision
docker compose exec gateway alembic current
```

Never run `alembic upgrade head` against production without first running it against staging.

---

## Backup and Restore

```bash
# Manual backup
docker compose exec postgres pg_dump -U khushfus khushfus > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
docker compose exec -T postgres psql -U khushfus khushfus < backup_20260310_120000.sql
```

Automated backups should be configured via a cron job or cloud provider snapshot schedule. Verify RPO compliance with [../SLA.md](../SLA.md).
