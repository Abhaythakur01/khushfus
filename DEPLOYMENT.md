# Deployment Guide

## Prerequisites

- Docker & Docker Compose
- `kubectl` (for Kubernetes deployments)
- Access to the GitLab CI/CD pipeline
- Environment variables configured (see [docs/API_KEYS_GUIDE.md](./docs/API_KEYS_GUIDE.md))

## Local Development

```bash
cp .env.example .env
docker-compose up -d
```

Services start in dependency order. Verify with `docker-compose ps`. The gateway is available at `http://localhost:8000`, frontend at `http://localhost:3000`.

Start by phase if resources are limited:

```bash
# Phase 1 — Core
docker-compose up -d postgres redis opensearch gateway collector analyzer query report notification

# Phase 2 — Enterprise
docker-compose up -d identity tenant media search

# Phase 3 — Competitive parity
docker-compose up -d publishing rate-limiter enrichment export

# Phase 4 — Differentiation
docker-compose up -d competitive scheduler audit realtime
```

## Staging Deployment

Staging deploys automatically when a merge request is merged to `main`:

1. GitLab CI runs: lint -> test -> security -> build -> deploy-staging
2. All 19 services are built in parallel via the build matrix
3. Images are pushed to `$CI_REGISTRY`
4. Staging deploy applies K8s manifests to the staging cluster

## Production Deployment

Production requires a **manual gate** in GitLab CI:

1. Ensure staging is green and verified
2. Go to CI/CD -> Pipelines -> click the manual `deploy-production` job
3. Monitor rollout: `kubectl -n khushfus rollout status deployment/gateway`

## Kubernetes Setup

```bash
# Apply all manifests (namespace, configmap, secrets, infra, services, ingress, HPAs)
kubectl apply -k deploy/k8s/

# Verify
kubectl -n khushfus get pods
kubectl -n khushfus get svc
```

Manifests in `deploy/k8s/`:
- `namespace.yaml`, `configmap.yaml`, `secrets.yaml` — cluster config
- `infrastructure/` — Postgres StatefulSet, Redis, Elasticsearch
- `services/` — all 19 services + frontend
- `ingress.yaml` — Nginx ingress with TLS
- `hpa.yaml` — autoscalers for 8 key services
- `kustomization.yaml` — Kustomize overlay

## Database Migrations

```bash
# Run from project root (or inside any service container with DB access)
alembic upgrade head

# Check current revision
alembic current

# Create a new migration
alembic revision --autogenerate -m "description"
```

Migrations are in `migrations/`. The schema uses async asyncpg.

## Monitoring

| Tool       | URL                    | Purpose                    |
|------------|------------------------|----------------------------|
| Prometheus | `http://localhost:9090` | Metrics collection         |
| Grafana    | `http://localhost:3000` | Dashboards & visualization |
| Jaeger     | `http://localhost:16686`| Distributed tracing        |

Each service exposes a `/metrics` endpoint for Prometheus scraping. Grafana dashboards are pre-configured for request latency, error rates, and Redis Streams lag.

## Rollback Procedure

**Kubernetes rollback:**

```bash
# Roll back a single service
kubectl -n khushfus rollout undo deployment/gateway

# Roll back to a specific revision
kubectl -n khushfus rollout undo deployment/gateway --to-revision=3

# Check rollout history
kubectl -n khushfus rollout history deployment/gateway
```

**Database rollback:**

```bash
# Downgrade one revision
alembic downgrade -1

# Downgrade to a specific revision
alembic downgrade <revision_id>
```

**Docker Compose rollback (local/staging):**

```bash
# Pin a service to a previous image tag
docker-compose up -d --no-deps <service-name>
```

## Scaling Guidelines

**Scale first** (highest traffic / most resource-intensive):

| Service    | HPA Range | Why                                      |
|------------|-----------|------------------------------------------|
| gateway    | 2-10      | All traffic enters here                  |
| frontend   | 2-10      | User-facing, high request volume         |
| collector  | 1-5       | CPU-bound, runs 20 platform collectors   |
| analyzer   | 1-5       | NLP models are memory/CPU heavy          |
| identity   | 2-8       | Auth on every request                    |

**Scale later** (lower traffic):

| Service    | HPA Range | Why                              |
|------------|-----------|----------------------------------|
| tenant     | 1-5       | Infrequent org management calls  |
| search     | 1-5       | Delegates heavy lifting to ES    |
| publishing | 1-5       | Burst traffic around post times  |

HPAs trigger at 70% CPU or 80% memory utilization. Adjust thresholds in `deploy/k8s/hpa.yaml`.

**Infrastructure scaling:**
- **Postgres**: Vertical scaling first, then read replicas
- **Redis**: Sentinel for HA, then Redis Cluster for sharding
- **Elasticsearch/OpenSearch**: Add data nodes for index sharding
