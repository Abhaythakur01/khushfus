# KhushFus

Enterprise social listening and analytics platform. Monitor brand mentions across 20+ platforms, analyze sentiment with NLP, generate reports, and automate workflows — all in a multi-tenant SaaS architecture.

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

[Publishing] [Export] [Competitive] [Scheduler] [Rate Limiter]
   :8013      :8015     :8016        :8017        :8014

[Report Service] ← reports:request
```

19 microservices communicate via Redis Streams. PostgreSQL with Row-Level Security provides multi-tenant data isolation. Elasticsearch powers full-text search. The NLP pipeline uses a 3-tier sentiment model (VADER, DeBERTa, Claude API) with automatic escalation.

## Services

| Service | Port | Role |
|---------|------|------|
| Gateway | 8000 | Auth, routing, REST API |
| Collector | — | 20 platform collectors |
| Analyzer | — | NLP: sentiment, NER, emotions, topics |
| Query | — | Stores to Postgres + Elasticsearch |
| Report | — | PDF report generation |
| Notification | — | Alert rules, webhooks, Slack |
| Identity | 8010 | SSO (SAML/OIDC), JWT, user management |
| Tenant | 8011 | Org management, RBAC, API keys, quotas |
| Media | — | Image OCR, logo detection, video transcription |
| Search | 8012 | Full-text search, saved searches, trending |
| Publishing | 8013 | Schedule/publish posts, reply to mentions |
| Rate Limiter | 8014 | Centralized platform API rate limiting |
| Enrichment | — | Influence scoring, bot detection |
| Export | 8015 | CSV/Excel/JSON export, CRM integrations |
| Competitive | 8016 | Share of voice, competitor benchmarking |
| Scheduler | 8017 | Workflow automation, custom schedules |
| Audit | 8018 | Audit trails, GDPR compliance, retention |
| Realtime | 8019 | WebSocket live mentions and alerts |
| Project | 8020 | Project and keyword management |
| Frontend | 3000 | Next.js dashboard |

## Quick Start

```bash
# Clone and start all services
docker-compose up -d

# Or start by phase
docker-compose up -d postgres redis elasticsearch jaeger gateway collector analyzer query report notification  # Phase 1
docker-compose up -d identity tenant media search                                                             # Phase 2
docker-compose up -d publishing rate-limiter enrichment export                                                # Phase 3
docker-compose up -d competitive scheduler audit realtime                                                     # Phase 4

# View logs
docker-compose logs -f gateway collector analyzer
```

The frontend is available at `http://localhost:3000`, the API gateway at `http://localhost:8000`.

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker and Docker Compose
- PostgreSQL 16, Redis 7, Elasticsearch 8 (or use Docker)

### Running Locally

```bash
# Backend
pip install -r requirements.txt
uvicorn services.gateway.app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### Environment Variables

Copy platform API keys into a `.env` file at the project root. See `docker-compose.yml` for the full list of supported variables (Twitter, Facebook, Instagram, LinkedIn, YouTube, TikTok, Discord, and more).

## Testing

```bash
pytest tests/                # Unit tests (no DB/Redis required)
make test-all                # All tests including integration
make test-coverage           # With HTML coverage report

# Lint
ruff check src/ services/ shared/ tests/
```

Unit tests use SQLite + aiosqlite. Integration tests require PostgreSQL.

## Monitoring

| Tool | URL | Purpose |
|------|-----|---------|
| Grafana | http://localhost:3001 | Dashboards (admin / khushfus) |
| Prometheus | http://localhost:9090 | Metrics |
| Jaeger | http://localhost:16686 | Distributed tracing |

## Deployment

- **CI/CD**: GitLab CI with 6 stages (lint, test, security, build, deploy-staging, deploy-production). All services built in parallel.
- **Kubernetes**: Kustomize manifests in `deploy/k8s/`. Apply with `kubectl apply -k deploy/k8s/`.
- **Monitoring**: Prometheus + Grafana + Jaeger provisioned via `deploy/monitoring/`.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy (async), Alembic
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Recharts
- **Data**: PostgreSQL 16 (RLS), Redis 7 (Streams), Elasticsearch 8
- **NLP**: spaCy, VADER, Hugging Face Transformers, BERTopic, Claude API
- **Infra**: Docker Compose, Kubernetes (Kustomize), Nginx Ingress
- **Observability**: Prometheus, Grafana, Jaeger (OpenTelemetry)

## Developer Docs

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation, service internals, key patterns, and contribution guidelines.

## License

Proprietary. All rights reserved.
