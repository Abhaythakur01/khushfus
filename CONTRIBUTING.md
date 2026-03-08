# Contributing to KhushFus

## Dev Environment Setup

```bash
git clone <repo-url> && cd KhushFus
cp .env.example .env        # Fill in API keys (see docs/API_KEYS_GUIDE.md)
docker-compose up -d         # Start all services
cd frontend && npm install   # Frontend deps
npm run dev                  # Frontend on localhost:3000
```

## Code Style

- **Linter/formatter**: [Ruff](https://docs.astral.sh/ruff/)
- **Line length**: 120
- **Python**: 3.11+
- **Rules**: E, F, I, N, W (see `pyproject.toml` / `ruff.toml`)
- Pre-commit hooks enforce formatting automatically. Install them:
  ```bash
  pip install pre-commit
  pre-commit install
  ```

## Branch Naming

| Prefix     | Use for                |
|------------|------------------------|
| `feature/` | New features           |
| `fix/`     | Bug fixes              |
| `docs/`    | Documentation updates  |

Example: `feature/tiktok-collector`, `fix/sentiment-null-check`

## Commit Messages

Format: `type: description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`

```
feat: add Pinterest collector
fix: handle empty media URLs in enrichment
refactor: extract shared auth middleware
```

## Adding a New Service

1. Create `services/<name>/app/main.py` (FastAPI app or consumer loop)
2. Create `services/<name>/Dockerfile` and `services/<name>/requirements.txt`
3. Add the service to `docker-compose.yml`
4. Add K8s manifests in `deploy/k8s/services/`
5. Add to `.gitlab-ci.yml` build matrix
6. Wire up Redis Streams events in `shared/events.py` if needed

## Adding a New Collector

1. Create `src/collectors/<platform>.py` inheriting `BaseCollector`
2. Implement `collect()`, `authenticate()`, and `parse_mention()` methods
3. Register in `services/collector_service/app/collectors.py`
4. Register in `src/collectors/__init__.py`

## Adding a Frontend Page

1. Create `frontend/src/app/<route>/page.tsx` with `"use client"` directive
2. Use components from `@/components/ui/`
3. Add API calls via `@/lib/api.ts`
4. Add navigation link in `@/components/layout/Sidebar.tsx`

## Running Tests

```bash
pytest tests/                  # Unit tests (no DB/Redis required)
make test-all                  # All tests including integration
make test-coverage             # With HTML coverage report
```

Unit tests use SQLite + aiosqlite. Integration tests require Postgres + Redis running.

## PR Process

1. Create a branch from `main` using the naming convention above
2. Make your changes, ensure pre-commit hooks pass
3. Run `ruff check src/ services/ shared/ tests/` locally
4. Run `pytest tests/` to verify nothing is broken
5. Push and open a merge request targeting `main`
6. CI pipeline must pass (lint, test, security, build)
7. Get at least one approval before merging

## More Details

See [CLAUDE.md](./CLAUDE.md) for full architecture, service descriptions, and patterns.
