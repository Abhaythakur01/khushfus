# Runbook: High Error Rate

**Applies to:** API Gateway and all HTTP-facing services
**Typical severity:** P1 (>10% error rate or gateway down) / P2 (elevated 5xx, partial degradation)
**Last reviewed:** 2026-03-11

---

## Symptoms

- Grafana alert: `http_5xx_rate > 1%` sustained for more than 2 minutes
- User reports: "The dashboard won't load" / "API calls are failing"
- PagerDuty alert fires on `gateway_error_rate`
- Log aggregator shows spike in `status=500` or `status=503` entries

---

## Step 1 — Quantify the Problem

Open Grafana (`http://localhost:3001`) and check:

- **Panel:** HTTP Request Rate by Status Code
- **Panel:** P99 Latency by Endpoint
- **Panel:** Error Rate by Service

Determine:
- What percentage of requests are failing?
- Which endpoints are affected?
- When did the spike start?
- Is it improving, stable, or worsening?

---

## Step 2 — Check Prometheus Metrics

```bash
# Query Prometheus directly
# Requests with 5xx status in the last 5 minutes
curl -s "http://localhost:9090/api/v1/query?query=rate(http_requests_total{status=~'5..'}[5m])" | python3 -m json.tool

# Error ratio
curl -s "http://localhost:9090/api/v1/query?query=rate(http_requests_total{status=~'5..'}[5m])/rate(http_requests_total[5m])" | python3 -m json.tool
```

---

## Step 3 — Examine Service Logs

```bash
# Gateway error logs (most likely first point of failure)
docker compose logs gateway --tail=500 2>&1 | grep -E "status=5|ERROR|Exception|Traceback"

# Check all services for errors
for svc in gateway identity tenant query collector analyzer notification; do
  echo "=== $svc ==="
  docker compose logs $svc --tail=50 2>&1 | grep -c "ERROR\|Exception" || true
done
```

---

## Step 4 — Common Causes and Fixes

### Cause A: Database connection pool exhausted

**Symptom in logs:** `QueuePool limit of size X overflow Y reached`

**Fix:**
```bash
# Check active DB connections
docker compose exec postgres psql -U khushfus -d khushfus \
  -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Restart the service to flush the pool
docker compose restart gateway
```

Long-term: increase `pool_size` and `max_overflow` in `shared/database.py`, or add a PgBouncer connection pooler.

### Cause B: Redis unavailable (event bus disabled)

**Symptom in logs:** `Redis unavailable — event bus disabled`

**Impact:** Collection triggers will fall back to direct (inline) mode. The pipeline continues but without distributed fan-out.

**Fix:** See [redis-issues.md](redis-issues.md).

### Cause C: Unhandled exception in a route handler

**Symptom in logs:** Python traceback ending with `500 Internal Server Error`

**Fix:** Identify the offending endpoint from the traceback, patch the code, and redeploy.

```bash
# Find the most recent unhandled exceptions
docker compose logs gateway --tail=1000 2>&1 | grep -A10 "Traceback\|Unhandled exception"
```

### Cause D: High load / upstream timeout

**Symptom:** P99 latency spike before error rate spike

**Fix (short-term):** Scale up the gateway replicas in `docker-compose.yml` or Kubernetes HPA. Check for slow database queries (see [database-issues.md](database-issues.md)).

### Cause E: Bad deployment (new code introduced a regression)

**Symptom:** Error rate spike immediately after a deployment

**Fix:** Roll back to the previous image:

```bash
# Docker Compose
docker compose stop gateway
# Edit docker-compose.yml to pin previous image tag
docker compose up -d gateway

# Kubernetes
kubectl rollout undo deployment/gateway -n khushfus
kubectl rollout status deployment/gateway -n khushfus
```

### Cause F: JWT secret rotation / auth misconfiguration

**Symptom:** Spike in `401 Unauthorized` responses

**Symptom in logs:** `JWTError: Signature verification failed`

**Fix:** Verify `JWT_SECRET_KEY` is consistent across all gateway replicas and has not been accidentally rotated:

```bash
docker compose exec gateway env | grep JWT_SECRET_KEY
```

---

## Step 5 — Check Circuit Breakers

The `shared/circuit_breaker.py` module implements circuit breakers for inter-service calls. If a circuit is open, the service returns errors immediately instead of waiting for timeouts.

```bash
# Check gateway logs for circuit breaker state transitions
docker compose logs gateway 2>&1 | grep -i "circuit"
```

A tripped circuit breaker indicates the downstream service is failing. Fix the downstream service first, then the circuit will reset after the configured recovery timeout.

---

## Step 6 — Check OpenSearch (Full-Text Search)

If the Search service (`:8012`) is failing:

```bash
curl http://localhost:9200/_cluster/health?pretty
# Status should be "green" or "yellow" (not "red")

# Check index status
curl http://localhost:9200/_cat/indices?v
```

A `red` cluster health means at least one primary shard is unassigned. This requires OpenSearch-specific remediation (reindex, node recovery, or replica adjustment).

---

## Step 7 — Jaeger Tracing

If you cannot pinpoint the failure from logs alone, use distributed tracing:

1. Open Jaeger UI: `http://localhost:16686`
2. Select service: `gateway`
3. Filter by `error=true`
4. Examine the trace spans to find where in the call chain the error originates

---

## Step 8 — Escalation

If the error rate is not resolved within SLA:

| Severity | Threshold | Response Time | Action |
|----------|-----------|---------------|--------|
| P1 | >10% errors or gateway down | 15 min | Page on-call, notify stakeholders |
| P2 | 1–10% errors | 1 hour | Notify on-call via Slack |

See [../SLA.md](../SLA.md) for the full escalation matrix.

---

## Post-Incident Checklist

- [ ] Error rate returned to baseline (<0.1%)
- [ ] Root cause identified and documented
- [ ] Immediate mitigation applied (restart, rollback, config fix)
- [ ] Monitoring alerts re-enabled if temporarily silenced
- [ ] Post-mortem scheduled (P1: within 48 hours, P2: within 1 week)
- [ ] Action items created for long-term fix
