# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is This

KhushFus is an enterprise social listening SaaS platform (Sprinklr/Brandwatch competitor). 19 microservices communicating via Redis Streams. Multi-tenant, SSO-ready, with media analysis, competitive intelligence, and workflow automation.

## Commands

```bash
# --- Docker (full stack) ---
make dev                 # Start all services
make dev-phase1          # Core: postgres, redis, opensearch, gateway, collector, analyzer, query, report, notification
make dev-phase2          # Enterprise: identity, tenant, media, search
make dev-phase3          # Parity: publishing, rate-limiter, enrichment, export
make dev-phase4          # Differentiation: competitive, scheduler, audit, realtime
make logs                # Follow all service logs
make down                # Stop everything

# --- Local dev (no Docker) ---
# Gateway with SQLite (no Postgres/Redis needed):
DATABASE_URL="sqlite+aiosqlite:///./khushfus_dev.db" JWT_SECRET_KEY="dev-secret" uvicorn services.gateway.app.main:app --port 8000 --reload
# Frontend:
cd frontend && npm run dev   # localhost:3000

# --- Tests ---
make test                # Unit tests only (no DB/Redis required)
make test-all            # All tests including integration
make test-coverage       # With HTML coverage report
pytest tests/test_foo.py -v               # Single test file
pytest tests/ -k "test_analyzer" -v       # Tests matching pattern

# --- Lint ---
make lint                # ruff check src/ services/ shared/ tests/
make format              # ruff format src/ services/ shared/ tests/

# --- Database ---
make migrate             # alembic upgrade head
make migrate-down        # alembic downgrade -1

# --- Frontend ---
cd frontend && npm run build   # Production build
cd frontend && npm run lint    # ESLint
```

## Architecture

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

[Publishing] [Export] [Competitive] [Scheduler] [Rate Limiter] [Project]
   :8013      :8015     :8016        :8017        :8014         :8020

[Report Service] ← reports:request
```

### Services (19 total)

| Phase | Service | Port | Type | Role |
|-------|---------|------|------|------|
| 1 | gateway | 8000 | FastAPI | Auth (JWT+bcrypt), routing, REST API, rate limiting middleware |
| 1 | collector | - | Consumer | 20 platform collectors with retry+exponential backoff |
| 1 | analyzer | - | Consumer | NLP: 3-tier sentiment, NER, emotions, topics, sarcasm, LLM insights |
| 1 | query | - | Consumer | Stores to Postgres + OpenSearch, dedup by (source_id, platform, project_id) |
| 1 | report | - | Consumer | PDF/HTML report generation |
| 1 | notification | - | Consumer | Alert rules, email/webhooks/Slack |
| 2 | identity | 8010 | FastAPI | SSO (SAML/OIDC), JWT, user management |
| 2 | tenant | 8011 | FastAPI | Org management, RBAC, API keys (bcrypt), quotas |
| 2 | media | - | Consumer | Image OCR, logo detection, video transcription |
| 2 | search | 8012 | FastAPI | Full-text search, saved searches, trending |
| 3 | publishing | 8013 | FastAPI+Consumer | Schedule/publish posts, reply to mentions |
| 3 | rate-limiter | 8014 | FastAPI | Centralized platform API rate limiting |
| 3 | enrichment | - | Consumer | Influence scoring, bot detection, org resolution |
| 3 | export | 8015 | FastAPI+Consumer | CSV/Excel/JSON export, CRM integrations |
| 4 | competitive | 8016 | FastAPI | Share of voice, competitor benchmarking |
| 4 | scheduler | 8017 | FastAPI+Consumer | Workflow automation, custom schedules |
| 4 | audit | 8018 | FastAPI+Consumer | Audit trails, GDPR compliance, retention |
| 4 | realtime | 8019 | FastAPI | WebSocket live mentions, dashboard, alerts |
| 4 | project | 8020 | FastAPI | Project CRUD (also in gateway routes) |

### Shared Layer (`shared/`)

| File | Purpose |
|------|---------|
| `models.py` | All SQLAlchemy ORM models (17+ tables, 11 enum types) |
| `schemas.py` | All Pydantic request/response schemas |
| `events.py` | Redis Streams EventBus + event dataclasses (RawMentionEvent, AnalyzedMentionEvent). Includes DLQ, consume_with_retry, move_to_dlq |
| `database.py` | Async engine factory. Supports Postgres (with pool config) and SQLite (for dev/tests). `set_tenant_context(session, org_id)` for RLS |
| `health.py` | Standardized health check builder |
| `circuit_breaker.py` | Circuit breaker for inter-service calls |
| `cors.py` | Centralized CORS origins (env: `CORS_ALLOWED_ORIGINS`) |
| `url_validator.py` | SSRF-safe URL validation for webhooks |
| `tracing.py` | OpenTelemetry setup (graceful no-op if not installed) |
| `auth.py`, `jwt_config.py`, `internal_auth.py` | Auth utilities shared across services |

### Data Pipeline Flow

1. **Collector** → collects from 20 platforms → publishes `RawMentionEvent` to `mentions:raw`
2. **Analyzer** → consumes `mentions:raw` → runs NLP (VADER→DeBERTa→Claude) → publishes `AnalyzedMentionEvent` to `mentions:analyzed`
3. **Query Service** → consumes `mentions:analyzed` → deduplicates → stores in Postgres + indexes in OpenSearch
4. **Notification Service** → consumes `mentions:analyzed` (separate consumer group) → evaluates alert rules → sends notifications

Both Query and Notification services consume `mentions:analyzed` independently via separate consumer groups (dual consumers).

### Free-Tier Collectors (work without API keys)

Reddit (public JSON), GDELT (Full Text Search API), Mastodon (public hashtag timelines), News (RSS feeds). YouTube requires an API key in `.env`.

### NLP Pipeline (`src/nlp/`)

- `analyzer.py`: 3-tier sentiment (VADER → DeBERTa → Claude API), auto-escalation on low confidence or high engagement. Aspect-based sentiment, spaCy NER, emotion detection (7 emotions), BERTopic topic modeling, sarcasm detection. All model loading is lazy.
- `llm_insights.py`: Claude API for summarization, Q&A, crisis detection, report narratives.

## Frontend (`frontend/`)

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts. Dark theme (slate-950).

### Layout

All authenticated pages use `<AppShell title="...">` which provides:
- Collapsible sidebar (`Sidebar.tsx`) with navigation
- Header (`Header.tsx`) with search, notifications, user dropdown
- Dark theme: `bg-slate-950` page, `bg-slate-900/60` cards, `border-slate-800`, `text-slate-100/200/300/400`

Auth pages (`/login`, `/register`) use a separate layout at `src/app/(auth)/layout.tsx`.

### Key Files

- `src/lib/api.ts` — API client singleton. All backend calls go through this. Token management, 401 auto-logout.
- `src/lib/auth.tsx` — AuthProvider context. Manages JWT in localStorage, validates on mount via `/api/v1/auth/me`.
- `src/hooks/useProjects.ts` — Real API: project list, single project, CRUD, keyword management, trigger collection.
- `src/hooks/useMentions.ts` — Real API: paginated mentions with filters (platform, sentiment, search, date range).
- `src/components/ui/` — Reusable: Button, Card, Input, Select, Badge, Spinner, Dialog, Tabs, Table, Textarea.

### Pages (all dark theme, real API)

| Route | Page | Key Features |
|-------|------|--------------|
| `/dashboard` | Dashboard | Project selector, time range, KPI cards, trend/sentiment/platform charts, recent mentions |
| `/projects` | Projects List | Grid of project cards, create button |
| `/projects/new` | Create Project | Form: name, platforms (multi-select), keywords (add/remove with types) |
| `/projects/[id]` | Project Detail | Tabs: Overview (stats + trigger collection), Keywords (CRUD), Settings (edit/archive) |
| `/mentions` | Mentions Inbox | Two-panel: list + detail. Filters, pagination, bulk actions |
| `/analytics` | Analytics | 4 tabs: Overview, Sentiment, Platforms, Engagement. Recharts visualizations |
| `/search` | Search | Full-text search with fallback, filters, pagination |
| `/reports` | Reports | Generate (PDF/HTML), list with status |
| `/alerts` | Alerts | Tabs: Rules (CRUD), Alert Log |
| `/publishing` | Publishing | Schedule posts, multi-platform |
| `/settings` | Settings | Tabs: General (org), Team (members), API Keys |

## Key Patterns

- **Event-driven**: Redis Streams with consumer groups. Services scale horizontally. Failed messages go to DLQ via `bus.move_to_dlq()`.
- **Multi-tenant**: `organization_id` on Project. PostgreSQL RLS enforces isolation. `set_tenant_context()` per request in gateway deps.
- **NLP tiering**: VADER (free/fast) → DeBERTa (accurate/free) → Claude API (premium/complex). Auto-escalation on low confidence or high engagement.
- **Graceful degradation**: Gateway starts without Redis (event bus disabled). SQLite works for local dev (no pool config, RLS skipped). Tracing is optional (no-op if OpenTelemetry not installed). Rate limiter middleware is fail-open.
- **Auth**: Gateway uses bcrypt directly (not passlib — incompatible with bcrypt 4.1+). JWT via python-jose. `JWT_SECRET_KEY` required in production (`ENVIRONMENT=production`), dev default used otherwise.
- **Adding a service**: `services/<name>/app/main.py` + `Dockerfile` + `requirements.txt`. Add to `docker-compose.yml`.
- **Adding a collector**: `src/collectors/<name>.py` inheriting BaseCollector, register in `services/collector_service/app/collectors.py`.
- **Adding a frontend page**: `frontend/src/app/<route>/page.tsx` with `"use client"`. Wrap with `<AppShell title="...">`. Use components from `@/components/ui/`.

## Infrastructure

### Database Migrations (`migrations/`)
Alembic with async asyncpg. `migrations/versions/001_initial_schema.py` (17 tables, 11 enums) + `002_row_level_security.py` (RLS on 14 tables).

### Docker Compose
All 19 services + frontend + infrastructure (Postgres, Redis, OpenSearch, Jaeger, Prometheus, Grafana). Health checks on all services. Three resource tiers: Heavy (4G/2CPU: analyzer, media), Medium (2G/1CPU: gateway, query, collector), Light (1G/0.5CPU: all others).

### Kubernetes (`deploy/k8s/`)
Kustomize-based: namespace, configmap, secrets, infra (Postgres StatefulSet, Redis, OpenSearch), all services, Nginx ingress with TLS, HPAs for 8 key services.

### GitLab CI/CD (`.gitlab-ci.yml`)
6-stage pipeline: lint → test → security → build → deploy-staging → deploy-production. All services built in parallel. Deploy stages are manual gates.

## Ruff Config
Line length 120, Python 3.11, rules: E, F, I, N, W.
