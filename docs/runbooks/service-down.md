# Runbook: Service Down

**Applies to:** Any of the 19 KhushFus microservices
**Typical severity:** P1 (Tier 1 services: gateway, identity) / P2 (all others)
**Last reviewed:** 2026-03-11

---

## Symptoms

- Health endpoint returns non-2xx or times out
- Grafana alert fires: `service_up == 0`
- Frontend shows errors or blank data
- Dependent services report upstream failures in logs

---

## Step 1 — Confirm the Outage

```bash
# Check the Docker container status
docker compose ps

# Hit the service health endpoint directly
curl -sf http://localhost:8000/health   # gateway
curl -sf http://localhost:8010/health   # identity
# ... substitute port for the affected service

# Check if the container is in a restart loop
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

A `Restarting` status confirms a crash loop. An `Exited` status means it stopped and is not restarting.

---

## Step 2 — Examine Logs

```bash
# Tail the last 200 lines for the affected service
docker compose logs --tail=200 gateway

# Follow live log output
docker compose logs -f gateway

# Search for errors and exceptions
docker compose logs gateway 2>&1 | grep -i "error\|exception\|traceback\|critical"
```

Look for:
- Python tracebacks (import errors, missing env vars)
- Database connection errors (`OperationalError`, `asyncpg`)
- Redis connection errors
- Port binding conflicts (`Address already in use`)
- OOM kills (`Killed` in kernel logs — check with `dmesg | tail -20`)

---

## Step 3 — Check Resource Limits

```bash
# Memory and CPU usage per container
docker stats --no-stream

# Check if a container was OOM-killed
docker inspect <container_name> | grep -A5 OOMKilled
```

If OOM-killed, either increase the container memory limit in `docker-compose.yml` or identify the memory leak.

---

## Step 4 — Restart the Service

```bash
# Restart a single service
docker compose restart gateway

# If restart is not enough, force re-create
docker compose up -d --force-recreate gateway

# Wait for health check to pass
watch -n2 'curl -sf http://localhost:8000/health | python3 -m json.tool'
```

---

## Step 5 — Check Dependencies

Every service depends on Postgres and Redis. Verify they are healthy first:

```bash
# PostgreSQL
docker compose exec postgres pg_isready -U khushfus

# Redis
docker compose exec redis redis-cli ping
```

If dependencies are down, resolve those first (see [database-issues.md](database-issues.md) and [redis-issues.md](redis-issues.md)).

---

## Step 6 — Check Configuration

Missing or incorrect environment variables are a common cause of startup failures.

```bash
# List env vars for a service
docker compose exec gateway env | sort

# Verify critical variables are set
docker compose exec gateway env | grep -E "DATABASE_URL|REDIS_URL|JWT_SECRET_KEY"
```

Compare against `.env.example` to find missing variables.

---

## Step 7 — Rollback to Previous Image

If a recent deployment caused the failure:

```bash
# Identify the previous image tag
docker images | grep khushfus-gateway

# Roll back by specifying the previous tag in docker-compose.yml
# Then re-deploy
docker compose up -d gateway
```

In Kubernetes:

```bash
kubectl rollout undo deployment/gateway -n khushfus
kubectl rollout status deployment/gateway -n khushfus
```

---

## Step 8 — Escalation

If the service is not restored within the P1 SLA window (30 minutes):

1. Page the on-call engineer via PagerDuty
2. Notify the #incidents Slack channel with current status
3. Consider activating the **maintenance mode** static page on the load balancer

---

## Post-Incident

1. Confirm all health checks are green
2. Verify the data pipeline resumed (check Redis Streams consumer lag — see [pipeline-lag.md](pipeline-lag.md))
3. Update the incident timeline with root cause
4. Schedule a blameless post-mortem within 48 hours (P1) or 1 week (P2)
