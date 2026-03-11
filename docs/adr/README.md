# Architecture Decision Records (ADR)

This directory contains Architecture Decision Records for the KhushFus platform. ADRs capture significant architectural choices, the context in which they were made, and their consequences.

---

## What Is an ADR?

An ADR is a short document that captures an important architectural decision. Each ADR follows a standard format:

- **Title** — A short descriptive name
- **Status** — Proposed / Accepted / Deprecated / Superseded
- **Context** — The situation that forced a decision
- **Decision** — What we decided to do
- **Consequences** — The resulting trade-offs and follow-up work

ADRs are immutable once accepted. If a decision is reversed, a new ADR is written to supersede the old one; the original is marked `Superseded by ADR-NNN`.

---

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [001](001-microservices-redis-streams.md) | Microservices architecture with Redis Streams event bus | Accepted |
| [002](002-multi-tenant-rls.md) | PostgreSQL Row-Level Security for tenant isolation | Accepted |
| [003](003-nlp-tiering.md) | Three-tier NLP pipeline: VADER → DeBERTa → Claude | Accepted |
| [004](004-nextjs-frontend.md) | Next.js 14 with App Router for the frontend | Accepted |

---

## How to Add a New ADR

1. Create a new file: `docs/adr/NNN-short-title.md` (use the next sequential number)
2. Copy the template from any existing ADR
3. Fill in all sections
4. Set status to `Proposed`
5. Submit for review via pull request
6. Update this index once the ADR is accepted
