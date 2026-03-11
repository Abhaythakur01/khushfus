# Changelog

All notable changes to KhushFus are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- API v2 endpoints (currently placeholder at `/api/v2/`)
- Kafka migration path documentation
- Mobile-optimized frontend views
- Zapier/Make integration for workflow automation

---

## [0.2.0] — 2026-03-11

### Added

**Platform Coverage**
- 20 social media collectors: Twitter, Facebook, Instagram, LinkedIn, YouTube, Reddit, News (RSS), GDELT, Mastodon, TikTok, Discord, Threads, Bluesky, Pinterest, App Store, Reviews, Telegram, Quora, Podcast, and Other
- Free-tier collectors (no API key required): Reddit, GDELT, Mastodon, News (RSS)
- Exponential backoff and retry logic on all collectors

**NLP Pipeline**
- Three-tier sentiment analysis: VADER (rule-based) → DeBERTa (transformer) → Claude API (LLM)
- Automatic tier escalation based on confidence score and engagement signals
- spaCy Named Entity Recognition (people, organizations, locations, products)
- Emotion detection across 7 categories (joy, anger, fear, sadness, surprise, disgust, trust)
- BERTopic topic modeling for cluster analysis
- Sarcasm detection classifier
- Aspect-based sentiment analysis
- LLM-powered crisis detection, Q&A, and report narrative generation (`src/nlp/llm_insights.py`)

**Backend Services (19 total)**
- Phase 1: Gateway (`:8000`), Collector, Analyzer, Query, Report, Notification
- Phase 2: Identity/SSO (`:8010`), Tenant/RBAC (`:8011`), Media Analysis, Search (`:8012`)
- Phase 3: Publishing (`:8013`), Rate Limiter (`:8014`), Enrichment, Export (`:8015`)
- Phase 4: Competitive Intelligence (`:8016`), Scheduler/Workflows (`:8017`), Audit/Compliance (`:8018`), Realtime/WebSocket (`:8019`), Project service (`:8020`)
- Redis Streams event bus with consumer groups, DLQ, and `consume_with_retry` in `shared/events.py`
- Dead Letter Queue (DLQ) for failed messages with automatic retry

**Multi-Tenancy & Auth**
- PostgreSQL Row-Level Security (RLS) on 14 tables for tenant isolation
- JWT authentication via python-jose; bcrypt password hashing (not passlib — bcrypt 4.1+ incompatibility resolved)
- SAML/OIDC SSO support in Identity service
- Role-Based Access Control (RBAC): Owner, Admin, Manager, Analyst, Viewer
- API key management with bcrypt hashing and scope-based permissions
- Organization plan tiers: Free, Starter, Professional, Enterprise
- Mention quota enforcement per organization per month

**Frontend (Next.js 14)**
- Dark-themed dashboard: project selector, time-range picker, KPI cards, trend/sentiment/platform charts, recent mentions
- Mentions inbox with two-panel layout, platform/sentiment/keyword/date filters, bulk flag and assign actions
- Projects page: list, create, detail with tabs (Overview, Keywords, Settings)
- Analytics page: 4 tabs (Overview, Sentiment, Platforms, Engagement) with Recharts visualizations
- Reports page: generate PDF/HTML, list reports with status
- Alerts page: alert rule CRUD, alert log with acknowledgment
- Search page: full-text search with fallback, filters, pagination
- Publishing page: schedule posts, multi-platform support
- Settings pages: General (org info), Team (member management), API Keys
- Authentication: JWT in localStorage, auto-validate on mount, 401 auto-logout

**Infrastructure**
- Docker Compose for full 19-service stack + frontend + infrastructure
- Kubernetes manifests in `deploy/k8s/` with Kustomize base
- Horizontal Pod Autoscalers (HPAs) for 8 key services
- Nginx ingress with TLS termination
- Alembic database migrations: initial schema (17 tables, 11 enums) + RLS policies
- OpenTelemetry distributed tracing with Jaeger exporter (graceful no-op if not installed)
- Prometheus metrics via `prometheus-fastapi-instrumentator` (optional)
- Grafana dashboards for service health, pipeline lag, and error rates

**CI/CD**
- GitLab CI pipeline: lint → test → security (Bandit/Trivy) → build → deploy-staging → deploy-production
- Pre-commit hooks: ruff lint/format, trailing whitespace, YAML/TOML validation
- Load testing scripts in `tests/load/`

**Documentation**
- `CLAUDE.md` — developer guide and architecture overview
- `DEPLOYMENT.md` — deployment runbook for Docker and Kubernetes
- `CONTRIBUTING.md` — contribution guidelines
- `API_KEYS_GUIDE.md` — platform API key setup guide
- `docs/API.md` — OpenAPI/Swagger access guide
- `docs/SLA.md` — service level agreement with tier definitions and escalation matrix
- `docs/runbooks/` — operational runbooks for common failure scenarios
- `docs/adr/` — Architecture Decision Records
- `docs/DATA_DICTIONARY.md` — database schema reference with ER diagram
- `docs/BRANCHING_STRATEGY.md` — branch protection and release process
- `docs/CODE_REVIEW_CHECKLIST.md` — security, performance, and quality review checklist

### Changed

- Gateway now uses `bcrypt` directly instead of `passlib` (resolves incompatibility with bcrypt 4.1+)
- SQLite is supported for local development and tests without PostgreSQL/Redis
- Rate limiter middleware is fail-open (requests pass through if rate limiter service is unreachable)
- Event bus gracefully disables itself if Redis is unreachable at startup
- CORS origins are now configured via `CORS_ALLOWED_ORIGINS` environment variable

### Fixed

- Async NLP processing to prevent blocking the event loop during transformer inference
- Message deduplication in Query service by `(source_id, platform, project_id)` to prevent duplicate mentions
- Graceful shutdown — services complete in-flight message processing before exiting
- Database connection pool leak on SQLite (disabled pool configuration for SQLite connections)

### Security

- SSRF protection on webhook URLs via `shared/url_validator.py`
- SQL injection prevention — all queries use SQLAlchemy ORM with parameterized inputs
- JWT secret key validation — `JWT_SECRET_KEY` is required in `ENVIRONMENT=production`; dev fallback is blocked in production
- Non-root container users in all Dockerfiles
- Webhook signing with HMAC-SHA256 for outbound webhook payloads
- Circuit breaker for inter-service HTTP calls to prevent cascade failures
- Request body size limit middleware (default 10 MB, configurable)

---

## [0.1.0] — 2025-10-01

### Added

- Initial project scaffold: gateway, collector, analyzer, query service
- SQLAlchemy shared models for Project, Mention, User, Organization
- Basic JWT authentication
- Reddit and RSS news collectors (free tier)
- VADER sentiment analysis (Tier 1 NLP)
- PostgreSQL database with Alembic migrations
- Docker Compose for development

---

[Unreleased]: https://gitlab.com/khushfus/khushfus/compare/v0.2.0...HEAD
[0.2.0]: https://gitlab.com/khushfus/khushfus/compare/v0.1.0...v0.2.0
[0.1.0]: https://gitlab.com/khushfus/khushfus/releases/tag/v0.1.0
