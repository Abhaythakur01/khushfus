.PHONY: test lint format build up down logs

# Testing
test:
	pytest tests/ -v --tb=short -m "not integration and not slow"

test-all:
	pytest tests/ -v --tb=short

test-integration:
	pytest tests/ -v --tb=short -m integration

test-coverage:
	pytest tests/ -v --cov=src --cov=services --cov=shared --cov-report=html --cov-report=term

# Linting
lint:
	ruff check src/ services/ shared/ tests/

format:
	ruff format src/ services/ shared/ tests/

# Docker
build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

# Database
migrate:
	alembic upgrade head

migrate-down:
	alembic downgrade -1

migrate-reset:
	alembic downgrade base && alembic upgrade head

# Frontend
frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build
