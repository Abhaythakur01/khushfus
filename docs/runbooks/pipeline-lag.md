# Runbook: Pipeline Lag

**Applies to:** Redis Streams data pipeline (Collector → Analyzer → Query/Notification)
**Typical severity:** P2 (lag growing) / P3 (lag stable but elevated)
**Last reviewed:** 2026-03-11

---

## Symptoms

- Grafana panel shows growing consumer group lag on `mentions:raw` or `mentions:analyzed`
- New mentions are not appearing in the dashboard despite collection succeeding
- DLQ streams (`dlq:mentions:raw`, `dlq:mentions:analyzed`) are growing
- Notification service is not sending alerts for recent mentions
- `XPENDING` count for a consumer group keeps increasing

---

## Pipeline Architecture

```
[Collector] → mentions:raw → [Analyzer]
                                  ↓
                           mentions:analyzed → [Query Service]   (consumer group: query-group)
                                           → [Notification Svc] (consumer group: notification-group)
```

Each arrow is a Redis Stream. Consumer groups ensure each service processes each message independently.

---

## Step 1 — Measure Current Lag

```bash
# Check stream lengths (total messages)
docker compose exec redis redis-cli XLEN mentions:raw
docker compose exec redis redis-cli XLEN mentions:analyzed

# Check consumer group lag (pending message count per group)
docker compose exec redis redis-cli XINFO GROUPS mentions:raw
docker compose exec redis redis-cli XINFO GROUPS mentions:analyzed
```

Key fields from `XINFO GROUPS`:
- `pending`: messages delivered but not yet acknowledged
- `last-delivered-id`: the last message ID sent to this group
- `entries-read`: total messages read (compare to stream length for lag)

---

## Step 2 — Identify the Slow Consumer

```bash
# Check which consumers in a group have pending messages
docker compose exec redis redis-cli XPENDING mentions:analyzed query-group - + 20
docker compose exec redis redis-cli XPENDING mentions:analyzed notification-group - + 20
```

The output shows `message-id`, `consumer-name`, `idle-time-ms`, and `delivery-count`.

High `delivery-count` (>3) means a message is being retried repeatedly — likely poison pill data or a bug in the consumer.

---

## Step 3 — Check Consumer Service Health

```bash
# Check if the consumer is running
docker compose ps analyzer query notification

# Check recent logs for errors
docker compose logs analyzer --tail=100 2>&1 | grep -E "ERROR|Exception|Traceback"
docker compose logs query --tail=100 2>&1 | grep -E "ERROR|Exception|Traceback"
docker compose logs notification --tail=100 2>&1 | grep -E "ERROR|Exception|Traceback"
```

---

## Step 4 — Restart the Lagging Consumer

```bash
# Restart the consumer service
docker compose restart analyzer
# or
docker compose restart query
# or
docker compose restart notification

# Monitor the lag after restart
watch -n5 'docker compose exec redis redis-cli XINFO GROUPS mentions:analyzed'
```

After a restart, the consumer will re-join the consumer group and begin processing from where it left off (the last acknowledged message).

---

## Step 5 — Handle Poison Pill Messages

If a specific message is causing repeated failures (high delivery count):

```bash
# Read the problematic message
docker compose exec redis redis-cli XRANGE mentions:analyzed <message-id> <message-id>

# Manually acknowledge (skip) the message — USE WITH CAUTION
docker compose exec redis redis-cli XACK mentions:analyzed <consumer-group> <message-id>

# Move to DLQ manually if you want to preserve it for analysis
docker compose exec redis redis-cli XADD dlq:mentions:analyzed '*' message_id <message-id> reason "manual_skip" timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

---

## Step 6 — Investigate the DLQ

Messages that fail after all retries are moved to `dlq:*` streams by `shared/events.py` (`move_to_dlq()`).

```bash
# Check DLQ contents
docker compose exec redis redis-cli XLEN dlq:mentions:raw
docker compose exec redis redis-cli XLEN dlq:mentions:analyzed

# Read the last 10 DLQ entries
docker compose exec redis redis-cli XREVRANGE dlq:mentions:analyzed + - COUNT 10
```

DLQ entries contain the original message plus a `reason` and `timestamp` field. Analyze them to identify patterns (bad data format, NLP crash, DB write failure).

### Reprocessing DLQ Messages

If the root cause is fixed and you want to replay DLQ messages:

```bash
# Read all DLQ entries and re-publish to the original stream
# This is a manual operation — run with care in production
docker compose exec redis redis-cli XRANGE dlq:mentions:analyzed 0 '+' | \
  # Parse and re-publish — use the replay script if available
  python3 scripts/replay_dlq.py --stream mentions:analyzed --dlq-stream dlq:mentions:analyzed
```

---

## Step 7 — Scale the Consumer

If lag is due to throughput (too much data, not enough processing power):

**Docker Compose — add replicas:**

```yaml
# docker-compose.yml
analyzer:
  deploy:
    replicas: 3
```

```bash
docker compose up -d --scale analyzer=3
```

Each replica joins the same consumer group and Redis distributes messages across all active consumers.

**Kubernetes — increase replicas:**

```bash
kubectl scale deployment/analyzer --replicas=3 -n khushfus
```

---

## Step 8 — Trim Processed Messages

If the stream is very large (millions of entries), it will consume Redis memory even after processing. Trim old entries:

```bash
# Keep only the last 500,000 entries in mentions:raw
docker compose exec redis redis-cli XTRIM mentions:raw MAXLEN ~ 500000

# Keep only the last 500,000 entries in mentions:analyzed
docker compose exec redis redis-cli XTRIM mentions:analyzed MAXLEN ~ 500000
```

Only trim entries that have been processed by all consumer groups. Check `last-delivered-id` for each group before trimming.

---

## Recovery Verification

```bash
# Confirm lag is decreasing
watch -n10 'docker compose exec redis redis-cli XINFO GROUPS mentions:analyzed | grep pending'

# Confirm new mentions are appearing in Postgres
docker compose exec postgres psql -U khushfus -d khushfus \
  -c "SELECT count(*), max(collected_at) FROM mentions WHERE collected_at > NOW() - INTERVAL '10 minutes';"
```

The pipeline is healthy when:
- `pending` count is decreasing or near zero
- New mentions are appearing in the database with recent `collected_at` timestamps
- DLQ streams are not growing
