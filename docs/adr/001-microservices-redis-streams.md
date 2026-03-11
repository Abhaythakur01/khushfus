# ADR 001 — Microservices Architecture with Redis Streams Event Bus

**Status:** Accepted
**Date:** 2025-10-01
**Authors:** KhushFus Engineering

---

## Context

KhushFus is a social listening SaaS platform that needs to:

1. **Ingest high-volume data** from 20+ social platforms concurrently
2. **Process mentions through a multi-stage pipeline** (collection → NLP analysis → storage → notifications)
3. **Scale individual stages independently** — NLP analysis is CPU-intensive and needs more replicas than, say, report generation
4. **Support multi-tenancy** — each organization's data must be isolated
5. **Achieve high availability** — a failure in report generation should not prevent mention collection

The team considered three architectural options:

**Option A: Monolith**
- Simple to deploy and debug
- Cannot scale stages independently
- A bug in the NLP layer crashes all functionality
- Unsuitable for the 20+ platform collector model

**Option B: Microservices with Kafka**
- Industry-standard for event streaming at scale
- Extremely high operational overhead (ZooKeeper/KRaft, topic management, consumer lag tooling)
- Kafka requires significant expertise to operate correctly
- At MVP scale, Kafka's durability guarantees exceed requirements
- License: Apache 2.0 — acceptable

**Option C: Microservices with Redis Streams**
- Redis is already required for rate limiting and caching
- Redis Streams provide consumer groups, acknowledgment, and DLQ patterns
- Much simpler operational profile than Kafka (single process, in-memory with optional persistence)
- Scales to millions of messages/day, which covers our MVP and growth targets
- Kafka can be introduced later with a thin adapter layer if Redis becomes a bottleneck

---

## Decision

We will build KhushFus as **19 microservices communicating via Redis Streams**.

The data pipeline flows through well-defined event streams:

```
mentions:raw          → Consumed by: Analyzer
mentions:analyzed     → Consumed by: Query Service, Notification Service (independent groups)
collection:request    → Consumed by: Collector
reports:request       → Consumed by: Report Service
```

Each service has a dedicated consumer group. Failed messages are moved to DLQ streams (`dlq:*`) after configured retry attempts via `shared/events.py` (`consume_with_retry`, `move_to_dlq`).

Services are organized into four deployment phases (core, enterprise, parity, differentiation) to allow incremental rollout.

---

## Consequences

**Positive:**
- Each service (Analyzer, Collector, Query) can be scaled independently based on its load profile
- A failure in any one service (e.g., Report) does not affect the core pipeline (Collection → Analysis → Storage)
- Redis Streams consumer groups enable exactly-once semantics within a single Redis instance
- The DLQ pattern provides visibility into message processing failures
- Redis is already part of the infrastructure — no new operational dependency
- Lower operational complexity compared to Kafka at MVP scale

**Negative:**
- Redis Streams do not match Kafka's durability guarantees (Kafka replicates to disk across multiple brokers; Redis is primarily in-memory unless AOF/RDB is configured)
- Redis does not support long-term message retention beyond what memory allows; Stream trimming is required
- At very high throughput (>100M messages/day), Redis may become a bottleneck; Kafka would need to be introduced
- 19 services means 19 Dockerfiles, 19 health checks, and 19 deployment targets — higher operational overhead than a monolith

**Follow-up work:**
- Enable Redis AOF persistence in production to reduce RPO for in-flight events
- Implement Stream trimming policy (MAXLEN) to prevent unbounded memory growth
- Add consumer lag metrics to Grafana dashboard
- Document the Kafka migration path if throughput requirements exceed Redis capacity
- Re-evaluate at 50M+ mentions/month to decide if Kafka is warranted
