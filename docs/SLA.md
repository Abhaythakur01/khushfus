# KhushFus Service Level Agreement (SLA)

**Version:** 1.0
**Effective date:** 2026-03-11
**Owner:** KhushFus Engineering

---

## 1. Service Tier Definitions

### Tier 1 — Critical Path (99.9% Uptime Target)

These services directly serve user-facing requests. Any outage results in immediate user impact.

| Service | Port | Role |
|---------|------|------|
| **Gateway** | 8000 | Single entry point for all API requests |
| **Identity** | 8010 | Authentication, SSO, JWT issuance |
| **PostgreSQL** | 5432 | Primary data store |
| **Redis** | 6379 | Event bus and rate limiting |

**Availability calculation:** 99.9% allows for a maximum of **8.7 hours of downtime per year** (43.8 minutes per month).

### Tier 2 — Core Pipeline (99.5% Uptime Target)

These services process the social listening data pipeline. Outages cause data lag but do not immediately break the user interface.

| Service | Role |
|---------|------|
| **Collector** | Fetches mentions from 20+ platforms |
| **Analyzer** | NLP: sentiment, NER, emotions, topics |
| **Query** | Persists analyzed mentions to Postgres + OpenSearch |
| **Notification** | Alert evaluation and delivery |
| **Tenant** | Organization management and RBAC |

**Availability calculation:** 99.5% allows for a maximum of **43.8 hours of downtime per year** (3.65 hours per month).

### Tier 3 — Enhanced Features (99.0% Uptime Target)

These services provide advanced functionality. Degraded availability does not break core social listening.

| Service | Role |
|---------|------|
| **Search** | Full-text search via OpenSearch |
| **Report** | PDF/HTML report generation |
| **Media** | Image OCR, video transcription |
| **Publishing** | Scheduled post management |
| **Enrichment** | Influence scoring, bot detection |
| **Export** | CSV/Excel/JSON export |
| **Competitive** | Share of voice, benchmarking |
| **Scheduler** | Workflow automation |
| **Audit** | Audit trail, GDPR compliance |
| **Realtime** | WebSocket live mention streaming |
| **Rate Limiter** | Centralized platform API rate limiting |

**Availability calculation:** 99.0% allows for a maximum of **87.6 hours of downtime per year** (7.3 hours per month).

---

## 2. RTO and RPO Targets

**RTO (Recovery Time Objective):** Maximum acceptable time to restore service after a declared incident.
**RPO (Recovery Point Objective):** Maximum acceptable data loss measured in time.

| Tier | Services | RTO | RPO |
|------|----------|-----|-----|
| Tier 1 | Gateway, Identity, PostgreSQL, Redis | 30 minutes | 5 minutes |
| Tier 2 | Collector, Analyzer, Query, Notification, Tenant | 2 hours | 15 minutes |
| Tier 3 | All remaining services | 8 hours | 1 hour |

**Notes:**
- PostgreSQL RPO is achieved through WAL-based continuous archiving (point-in-time recovery).
- Redis RPO assumes AOF persistence enabled with `appendfsync everysec`.
- Redis Streams events in flight at time of failure may be lost if persistence is not configured (see [runbooks/redis-issues.md](runbooks/redis-issues.md)).
- RPO for Tier 3 services is 1 hour because these services are stateless or derive state from Postgres.

---

## 3. Incident Severity Levels

### P1 — Critical

**Definition:** Complete service unavailability or data integrity breach affecting all users.

**Examples:**
- Gateway is down (0% of users can access the platform)
- PostgreSQL data corruption or unrecoverable failure
- Security breach or unauthorized data access
- Authentication service down (users cannot log in)

**Response time:** 15 minutes from alert
**Resolution time:** 2 hours
**Communication cadence:** Status update every 30 minutes
**Required actions:** Immediate page to on-call engineer + Engineering Lead. Update public status page within 15 minutes.

---

### P2 — High

**Definition:** Significant degradation affecting a large subset of users or a complete feature area.

**Examples:**
- Data pipeline lag > 30 minutes (mentions not updating)
- Error rate on any Tier 1 endpoint > 5%
- A Tier 2 service is down
- Report generation failing for all projects
- Alert delivery failing

**Response time:** 1 hour from alert
**Resolution time:** 4 hours
**Communication cadence:** Status update every 1 hour
**Required actions:** Notify on-call engineer via Slack. Update status page if externally visible.

---

### P3 — Medium

**Definition:** Partial degradation affecting a minority of users or a non-critical feature.

**Examples:**
- A Tier 3 service is down (e.g., Export, Competitive, Scheduler)
- Search results are stale but functional
- WebSocket realtime feed is delayed
- A specific platform collector is failing (e.g., TikTok)
- Error rate on non-critical endpoints is elevated

**Response time:** 4 hours from alert (or next business day if overnight)
**Resolution time:** 24 hours
**Communication cadence:** Status update every 4 hours
**Required actions:** Create a ticket, assign to on-call team. No immediate page required.

---

### P4 — Low

**Definition:** Minor issue with no immediate user impact; cosmetic problems or edge cases.

**Examples:**
- A non-critical metric is missing from a dashboard
- Minor UI bug not affecting functionality
- Documentation is outdated
- Non-urgent performance optimization needed

**Response time:** Next business day
**Resolution time:** 1 week
**Communication cadence:** Ticket updates only
**Required actions:** Create a ticket with appropriate priority label.

---

## 4. Escalation Matrix

| Step | Time Since Alert | Action | Contact |
|------|-----------------|--------|---------|
| 1 | T+0 | Alert fires; on-call engineer receives PagerDuty notification | On-call Engineer |
| 2 | T+15 min (P1) / T+1 hr (P2) | If not acknowledged, escalate | Engineering Lead |
| 3 | T+30 min (P1) / T+2 hr (P2) | If not resolved, bring in additional engineers | Relevant service owner |
| 4 | T+1 hr (P1) / T+4 hr (P2) | Customer-facing impact confirmed; notify Customer Success | Head of Engineering |
| 5 | T+2 hr (P1) | Executive notification if revenue or data integrity at risk | CTO / CEO |

**On-call rotation:** Weekly rotation. Schedule maintained in PagerDuty.
**Incident Commander:** The on-call engineer is the Incident Commander unless explicitly handed off.

---

## 5. Maintenance Windows

### Planned Maintenance

- **Window:** Every **Tuesday 02:00–04:00 UTC** (low-traffic period for most enterprise customers)
- **Notice:** Minimum **72 hours** advance notice for Tier 1/2 changes. Minimum **24 hours** for Tier 3.
- **Communication channel:** In-app banner + email notification to organization admins
- **Maximum duration:** 2 hours. If maintenance exceeds 2 hours, it is treated as an incident.

### Emergency Maintenance

- **Notice:** Best effort; minimum **30 minutes** for P1 security patches
- **Approval required:** Engineering Lead sign-off for Tier 1 changes
- **Rollback plan:** Must be documented before the maintenance window begins

### Excluded from SLA Calculation

The following are excluded from uptime calculations:

1. Planned maintenance windows (as announced above)
2. Force majeure events (natural disasters, cloud provider outages beyond our control)
3. Issues caused by customer-side network or API key configuration
4. Abuse or intentional overload of the platform

---

## 6. Monitoring and Alerting Thresholds

| Metric | Warning | Critical | SLA-Impacting |
|--------|---------|----------|---------------|
| Gateway error rate | >1% for 2 min | >5% for 2 min | Yes |
| Gateway P99 latency | >500ms | >2000ms | Yes |
| Pipeline lag (mentions:analyzed) | >5 min | >30 min | Yes (Tier 2) |
| PostgreSQL connection pool | >80% used | >95% used | Yes |
| Redis memory usage | >70% | >90% | Yes |
| DLQ message count | >100 | >1000 | Yes (Tier 2) |
| Disk usage (Postgres volume) | >70% | >85% | Yes |
| OpenSearch cluster health | yellow | red | Yes (Tier 3) |

Alerts are managed in Grafana with PagerDuty webhook integration.
