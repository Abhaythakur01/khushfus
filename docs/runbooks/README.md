# Runbooks Index

Operational runbooks for the KhushFus platform. Each runbook covers a specific failure scenario with step-by-step diagnosis and remediation procedures.

---

## Runbooks

| Runbook | Scenario | Severity |
|---------|----------|----------|
| [service-down.md](service-down.md) | A microservice is unresponsive or crash-looping | P1–P2 |
| [database-issues.md](database-issues.md) | PostgreSQL connection failures, slow queries, or disk pressure | P1–P2 |
| [redis-issues.md](redis-issues.md) | Redis connection failures, memory exhaustion, or eviction | P1–P2 |
| [high-error-rate.md](high-error-rate.md) | 5xx error spike detected in Prometheus/Grafana | P1–P2 |
| [pipeline-lag.md](pipeline-lag.md) | Consumer lag on Redis Streams, DLQ accumulation | P2–P3 |

---

## Quick Reference — Key URLs

| Tool | URL |
|------|-----|
| Grafana | `http://localhost:3001` |
| Prometheus | `http://localhost:9090` |
| Jaeger (tracing) | `http://localhost:16686` |
| API Gateway | `http://localhost:8000` |
| Gateway health | `http://localhost:8000/health` |

---

## General Principles

1. **Verify before acting.** Confirm the incident is real by checking multiple signals (logs, health endpoints, Grafana).
2. **Isolate the blast radius.** Determine which services and tenants are affected before making changes.
3. **Communicate early.** Open an incident channel and update the status page before troubleshooting.
4. **Document as you go.** Record every command run and its output in the incident timeline.
5. **Roll forward or roll back.** Prefer rolling forward with a fix; roll back only when the fix is not immediately available.
6. **Post-mortem within 48 hours.** Every P1/P2 incident requires a blameless post-mortem.

---

## On-Call Escalation

See [../SLA.md](../SLA.md) for severity definitions, response time SLAs, and the full escalation matrix.
