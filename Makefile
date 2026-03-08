SHELL := /bin/bash

.DEFAULT_GOAL := help

# =============================================================================
# Phony targets
# =============================================================================
.PHONY: help test test-all test-integration test-coverage \
        lint format \
        dev dev-phase1 dev-phase2 dev-phase3 dev-phase4 \
        dev-tools dev-tools-down \
        logs down build \
        frontend frontend-build \
        migrate migrate-down migrate-reset \
        load-test load-test-ws \
        clean

# =============================================================================
# Help
# =============================================================================

## help: List all targets with descriptions
help:
	@echo ""
	@echo "KhushFus — Enterprise Social Listening Platform"
	@echo "================================================"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /' | column -t -s ':'
	@echo ""

# =============================================================================
# Testing
# =============================================================================

## test: Run unit tests only (no DB/Redis required)
test:
	pytest tests/ -v --tb=short -m "not integration and not slow"

## test-all: Run all tests including integration
test-all:
	pytest tests/ -v --tb=short

## test-integration: Run integration tests only
test-integration:
	pytest tests/ -v --tb=short -m integration

## test-coverage: Run tests with HTML coverage report
test-coverage:
	pytest tests/ -v --cov=src --cov=services --cov=shared --cov-report=html --cov-report=term

# =============================================================================
# Linting & Formatting
# =============================================================================

## lint: Run ruff linter on all source directories
lint:
	ruff check src/ services/ shared/ tests/

## format: Run ruff formatter on all source directories
format:
	ruff format src/ services/ shared/ tests/

# =============================================================================
# Docker — Full Stack
# =============================================================================

## dev: Start all services via docker-compose
dev:
	docker-compose up -d

## build: Build all Docker images
build:
	docker-compose build

## logs: Follow logs for all services
logs:
	docker-compose logs -f

## down: Stop and remove all containers
down:
	docker-compose down

# =============================================================================
# Docker — Phased Startup
# =============================================================================

## dev-phase1: Start Phase 1 — Core Pipeline (postgres, redis, opensearch, gateway, collector, analyzer, query, report, notification)
dev-phase1:
	docker-compose up -d postgres redis opensearch gateway collector analyzer query report notification

## dev-phase2: Start Phase 2 — Enterprise-Ready (identity, tenant, media, search)
dev-phase2:
	docker-compose up -d identity tenant media search

## dev-phase3: Start Phase 3 — Competitive Parity (publishing, rate-limiter, enrichment, export)
dev-phase3:
	docker-compose up -d publishing rate-limiter enrichment export

## dev-phase4: Start Phase 4 — Differentiation (competitive, scheduler, audit, realtime)
dev-phase4:
	docker-compose up -d competitive scheduler audit realtime

## dev-tools: Start dev-only tools (MailHog, pgAdmin, Redis Commander)
dev-tools:
	docker-compose --profile dev up -d mailhog pgadmin redis-commander

## dev-tools-down: Stop dev-only tools
dev-tools-down:
	docker-compose --profile dev stop mailhog pgadmin redis-commander

# =============================================================================
# Frontend
# =============================================================================

## frontend: Start frontend dev server (Next.js on localhost:3000)
frontend:
	cd frontend && npm run dev

## frontend-build: Build frontend for production
frontend-build:
	cd frontend && npm run build

# =============================================================================
# Database Migrations
# =============================================================================

## migrate: Run alembic upgrade head
migrate:
	alembic upgrade head

## migrate-down: Roll back one migration
migrate-down:
	alembic downgrade -1

## migrate-reset: Reset DB and re-run all migrations
migrate-reset:
	alembic downgrade base && alembic upgrade head

# =============================================================================
# Load Testing
# =============================================================================

## load-test: Run k6 gateway load test via Docker
load-test:
	docker run --rm -i --network host grafana/k6 run - <tests/load/gateway_load.js

## load-test-ws: Run k6 WebSocket load test via Docker
load-test-ws:
	docker run --rm -i --network host grafana/k6 run - <tests/load/websocket_load.js

# =============================================================================
# Cleanup
# =============================================================================

## clean: Remove __pycache__, .pytest_cache, .ruff_cache, coverage artifacts
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name ".coverage" -delete 2>/dev/null || true
	rm -rf .coverage coverage.xml
