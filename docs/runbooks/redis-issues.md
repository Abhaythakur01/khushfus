# Runbook: Redis Issues

**Applies to:** Redis (event bus, caching, rate limiting)
**Typical severity:** P1 (event bus down — pipeline stops) / P2 (memory pressure, latency)
**Last reviewed:** 2026-03-11

---

## Symptoms

- Services log `ConnectionError`, `redis.exceptions.ConnectionError`, or `TimeoutError`
- Gateway logs `Redis unavailable — event bus disabled`
- Mentions stop flowing through the pipeline (no new data in the database)
- Rate limiter fails open (all requests allowed through)
- Realtime WebSocket connections drop
- Redis `used_memory` alert fires in Grafana

---

## Architecture Context

Redis serves several roles in KhushFus:

| Role | Stream / Key Pattern | Consumer(s) |
|------|---------------------|-------------|
| Raw mention ingestion | `mentions:raw` | Analyzer service |
| Analyzed mention storage | `mentions:analyzed` | Query service, Notification service |
| Collection requests | `collection:request` | Collector service |
| Report generation | `reports:request` | Report service |
| Dead Letter Queue | `dlq:*` | Manual review |
| Rate limiting | `ratelimit:*` | Rate Limiter service |
| WebSocket pub/sub | `realtime:*` | Realtime service |

---

## Scenario A — Redis Connection Failure

### Step 1 — Verify the container

```bash
docker compose ps redis
docker compose logs redis --tail=50
```

### Step 2 — Test connectivity

```bash
docker compose exec redis redis-cli ping
# Expected: PONG

# Test from the gateway container
docker compose exec gateway python3 -c "
import asyncio, redis.asyncio as aioredis
async def test():
    r = await aioredis.from_url('redis://redis:6379/0')
    print(await r.ping())
asyncio.run(test())
"
```

### Step 3 — Restart Redis

```bash
docker compose restart redis

# Monitor recovery
docker compose logs -f redis
```

**Important:** After Redis restarts, the in-memory Streams data is lost unless Redis persistence (AOF or RDB) is enabled. Check:

```bash
docker compose exec redis redis-cli CONFIG GET save
docker compose exec redis redis-cli CONFIG GET appendonly
```

If persistence is disabled, any events in flight during the outage are lost and will not be replayed. The pipeline will resume from the next new event.

---

## Scenario B — High Memory Usage / Eviction

### Step 1 — Check memory stats

```bash
docker compose exec redis redis-cli INFO memory
# Key fields: used_memory_human, maxmemory_human, mem_fragmentation_ratio
```

### Step 2 — Check eviction policy

```bash
docker compose exec redis redis-cli CONFIG GET maxmemory-policy
```

For KhushFus, the eviction policy should be `noeviction` for Streams (to prevent message loss) or `allkeys-lru` only if Streams are excluded. **Never use `allkeys-lru` if data loss on Streams is unacceptable.**

### Step 3 — Identify large keys

```bash
docker compose exec redis redis-cli --bigkeys
```

### Step 4 — Check DLQ accumulation

```bash
# Count messages in the Dead Letter Queue
docker compose exec redis redis-cli XLEN dlq:mentions:raw
docker compose exec redis redis-cli XLEN dlq:mentions:analyzed
```

A growing DLQ indicates repeated consumer failures. See [pipeline-lag.md](pipeline-lag.md) for DLQ remediation.

### Step 5 — Trim old Stream entries

If Streams are consuming excessive memory due to acknowledged but un-trimmed entries:

```bash
# Trim mentions:raw to last 100,000 entries
docker compose exec redis redis-cli XTRIM mentions:raw MAXLEN ~ 100000

# Trim mentions:analyzed to last 100,000 entries
docker compose exec redis redis-cli XTRIM mentions:analyzed MAXLEN ~ 100000
```

Use `~` (approximate) trimming to avoid blocking the server.

### Step 6 — Increase memory limit

In `docker-compose.yml`, increase the Redis memory limit:

```yaml
redis:
  command: redis-server --maxmemory 2gb --maxmemory-policy noeviction
```

---

## Scenario C — Consumer Group Issues

### Step 1 — List consumer groups for a stream

```bash
docker compose exec redis redis-cli XINFO GROUPS mentions:analyzed
```

This shows `pending-count`, `last-delivered-id`, and `consumers` per group.

### Step 2 — Check pending messages

```bash
# Show pending messages for a consumer group
docker compose exec redis redis-cli XPENDING mentions:analyzed analyzer-group - + 10
```

A large number of pending (unacknowledged) messages means a consumer crashed before acknowledging.

### Step 3 — Re-claim stale pending messages

```bash
# Claim messages pending for more than 5 minutes (300000ms) and re-queue them
docker compose exec redis redis-cli XAUTOCLAIM mentions:analyzed analyzer-group recovery-consumer 300000 0-0 COUNT 100
```

### Step 4 — Reset a consumer group (last resort)

If the consumer group state is corrupt:

```bash
# Set the group's last-delivered-id to $ (process only new messages going forward)
docker compose exec redis redis-cli XGROUP SETID mentions:analyzed analyzer-group '$'
```

This skips all backlogged messages. Use only when the backlog is too large to process and data loss is acceptable.

---

## Scenario D — Redis Persistence Configuration

For production deployments, enable AOF persistence to survive restarts:

```bash
docker compose exec redis redis-cli CONFIG SET appendonly yes
docker compose exec redis redis-cli CONFIG SET appendfsync everysec
docker compose exec redis redis-cli CONFIG REWRITE
```

Verify:

```bash
docker compose exec redis redis-cli INFO persistence
```

---

## Monitoring Queries

```bash
# Throughput: messages added per second to mentions:raw
docker compose exec redis redis-cli INFO stats | grep total_commands_processed

# Stream lengths (health indicator)
docker compose exec redis redis-cli XLEN mentions:raw
docker compose exec redis redis-cli XLEN mentions:analyzed

# Connected clients
docker compose exec redis redis-cli CLIENT LIST | wc -l

# Slow log (queries > 10ms)
docker compose exec redis redis-cli SLOWLOG GET 10
```
