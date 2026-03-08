# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This

KhushFus is an enterprise social listening SaaS platform (Sprinklr/Brandwatch competitor). 18 microservices communicating via Redis Streams. Multi-tenant, SSO-ready, with media analysis, competitive intelligence, and workflow automation.

## Commands

```bash
# Start all services
docker-compose up -d

# Start by phase
docker-compose up -d postgres redis elasticsearch gateway collector analyzer query report notification  # Phase 1
docker-compose up -d identity tenant media search                                                       # Phase 2
docker-compose up -d publishing rate-limiter enrichment export                                          # Phase 3
docker-compose up -d competitive scheduler audit realtime                                               # Phase 4

# Logs
docker-compose logs -f gateway collector analyzer

# Tests
pytest tests/

# Lint
ruff check src/ services/ shared/ tests/
```

## Architecture: 18 Microservices

```
Client → [Gateway :8000]
              │
    ┌─────────┼──────────────────────────────┐
    ▼         ▼         ▼         ▼          ▼
[Identity] [Tenant] [Search] [Realtime] [Audit]
  :8010     :8011    :8012     :8019     :8018

    ══════════ Redis Streams Event Bus ══════════

[Collector] → mentions:raw → [Analyzer] → mentions:analyzed
                                  ↓               ↓
                             [Media Svc]    [Query Service]
                                  ↓          (Postgres+ES)
                             [Enrichment]         ↓
                                           [Notification]

[Publishing] [Export] [Competitive] [Scheduler] [Rate Limiter]
   :8013      :8015     :8016        :8017        :8014

[Report Service] ← reports:request
```

### Services by Phase

**Phase 1 — Core Pipeline (6 services)**
| Service | Port | Type | Role |
|---------|------|------|------|
| gateway | 8000 | FastAPI | Auth, routing, REST API |
| collector | - | Consumer | Runs 20 platform collectors |
| analyzer | - | Consumer | NLP: 3-tier sentiment, NER, emotions, topics, LLM insights |
| query | - | Consumer | Stores to Postgres + Elasticsearch |
| report | - | Consumer+Scheduler | PDF report generation |
| notification | - | Consumer | Alert rules, webhooks, Slack |

**Phase 2 — Enterprise-Ready (4 services)**
| Service | Port | Type | Role |
|---------|------|------|------|
| identity | 8010 | FastAPI | SSO (SAML/OIDC), JWT, user management |
| tenant | 8011 | FastAPI | Org management, RBAC, API keys, quotas |
| media | - | Consumer | Image OCR, logo detection, video transcription |
| search | 8012 | FastAPI | Full-text search, saved searches, trending |

**Phase 3 — Competitive Parity (4 services)**
| Service | Port | Type | Role |
|---------|------|------|------|
| publishing | 8013 | FastAPI+Consumer | Schedule/publish posts, reply to mentions |
| rate-limiter | 8014 | FastAPI | Centralized platform API rate limiting |
| enrichment | - | Consumer | Influence scoring, bot detection, org resolution |
| export | 8015 | FastAPI+Consumer | CSV/Excel/JSON export, CRM integrations |

**Phase 4 — Differentiation (4 services)**
| Service | Port | Type | Role |
|---------|------|------|------|
| competitive | 8016 | FastAPI | Share of voice, competitor benchmarking |
| scheduler | 8017 | FastAPI+Consumer | Workflow automation, custom schedules |
| audit | 8018 | FastAPI+Consumer | Audit trails, GDPR compliance, retention |
| realtime | 8019 | FastAPI | WebSocket live mentions, dashboard, alerts |

### Shared Layer (`shared/`)
- `models.py`: All SQLAlchemy models — Organization, User, OrgMember, ApiKey, Project, Keyword, Mention, Report, AlertRule, AlertLog, SavedSearch, ScheduledPost, ExportJob, Integration, CompetitorBenchmark, Workflow, AuditLog, PlatformQuota
- `events.py`: Redis Streams event bus + all event dataclasses. Streams: `mentions:raw`, `mentions:analyzed`, `media:analyze`, `media:results`, `enrichment:request`, `enrichment:results`, `export:request`, `publish:request`, `workflow:trigger`, `audit:log`, `collection:request`, `reports:request`, `alerts:trigger`
- `schemas.py`: All Pydantic request/response schemas
- `database.py`: Async SQLAlchemy engine factory

### Collectors (`src/collectors/`)
20 collectors: Twitter, Facebook, Instagram, LinkedIn, YouTube, Reddit, News, GDELT, Telegram, Quora, WebScraper, TikTok, Discord, Threads, Bluesky, Pinterest, AppStore, Reviews (Trustpilot/Yelp/G2), Mastodon, Podcast. All inherit `BaseCollector` ABC.

### NLP Pipeline (`src/nlp/`)
- `analyzer.py`: 3-tier sentiment (VADER → DeBERTa → Claude API), aspect-based sentiment, spaCy NER, emotion detection (7 emotions), BERTopic topic modeling, sarcasm detection. All model loading is lazy.
- `llm_insights.py`: Claude API integration for mention summarization, Q&A, crisis detection, report narrative generation.

### Database Migrations (`alembic/`)
- Alembic with async asyncpg support
- `001_initial_schema.py`: All 17 tables + 11 enum types
- `002_row_level_security.py`: RLS policies on 14 tenant-scoped tables
- `shared/database.py` has `set_tenant_context(session, org_id)` for per-request RLS

### Frontend (`frontend/`)
Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts

```bash
cd frontend && npm install && npm run dev  # runs on localhost:3000
```

**Pages**: Dashboard, Analytics (4 tabs), Mentions (inbox-style), Projects (CRUD + keywords), Search (full-text + facets), Reports, Alerts (rules + log), Publishing (schedule posts), Settings (org, members, API keys, integrations)

**Structure**: `src/app/` (pages), `src/components/ui/` (10 reusable components), `src/components/layout/` (Sidebar, Header, AppShell), `src/lib/` (api client, auth context, utils), `src/hooks/` (useMentions, useProjects), `src/types/` (TypeScript interfaces)

## Key Patterns

- **Event-driven**: Redis Streams with consumer groups. Services scale horizontally.
- **Multi-tenant**: `organization_id` on Project. PostgreSQL Row-Level Security enforces isolation at DB level. `set_tenant_context()` per request.
- **NLP tiering**: VADER (free/fast) → DeBERTa (accurate/free) → Claude API (premium/complex). Auto-escalation on low confidence or high engagement.
- **Adding a service**: `services/<name>/app/main.py` + `Dockerfile` + `requirements.txt`. Add to docker-compose.yml.
- **Adding a collector**: `src/collectors/<name>.py` inheriting BaseCollector, register in `services/collector_service/app/collectors.py` and `src/collectors/__init__.py`.
- **Adding a frontend page**: `frontend/src/app/<route>/page.tsx` with "use client" directive. Use components from `@/components/ui/`.
- **Dual consumers**: Both Query and Notification services consume `mentions:analyzed` independently via separate consumer groups.

### GitLab CI/CD (`.gitlab-ci.yml`)
6-stage pipeline: lint → test → security → build → deploy-staging → deploy-production. All 19 backend services built in parallel via `parallel: matrix:`. Deploy stages are manual gates.

### Kubernetes (`deploy/k8s/`)
Kustomize-based manifests: namespace, configmap, secrets, infrastructure (Postgres StatefulSet, Redis, Elasticsearch), all 19 services + frontend, Nginx ingress with TLS, HPAs for 8 key services. Apply with `kubectl apply -k deploy/k8s/`.

### Testing (`tests/`)
```bash
make test              # Unit tests only (no DB/Redis required)
make test-all          # All tests including integration
make test-coverage     # With HTML coverage report
```
Uses SQLite+aiosqlite for unit tests, Postgres for integration. Fixtures in `conftest.py`.

## Ruff Config
Line length 120, Python 3.11, rules: E, F, I, N, W.
