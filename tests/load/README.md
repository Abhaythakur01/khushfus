# Load Tests

k6-based load tests for the KhushFus platform.

## Prerequisites

No local installation required — tests run via Docker. Alternatively, install k6 from <https://k6.io/docs/get-started/installation/>.

## Running the Tests

### Gateway Load Test

Via Docker (no install needed):

```bash
docker run --rm -i --network host grafana/k6 run - <tests/load/gateway_load.js
```

With k6 installed locally:

```bash
k6 run tests/load/gateway_load.js
```

### WebSocket Load Test

Via Docker:

```bash
docker run --rm -i --network host grafana/k6 run - <tests/load/websocket_load.js
```

With k6 installed:

```bash
k6 run tests/load/websocket_load.js
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:8000` | Gateway base URL |
| `WS_BASE_URL` | `ws://localhost:8019` | Realtime WebSocket URL |
| `TEST_EMAIL` | `loadtest@khushfus.com` | Email for login scenario |
| `TEST_PASSWORD` | `loadtest123` | Password for login scenario |
| `AUTH_TOKEN` | *(empty)* | Pre-generated JWT; skips login if set |
| `PROJECT_ID` | `1` | Project ID for mentions/search/ws |
| `SESSION_DURATION` | `10` | WebSocket session length in seconds |

Pass variables with `-e`:

```bash
k6 run -e BASE_URL=http://staging.khushfus.com:8000 -e AUTH_TOKEN=eyJ... tests/load/gateway_load.js
```

Or via Docker:

```bash
docker run --rm -i --network host \
  -e BASE_URL=http://localhost:8000 \
  -e AUTH_TOKEN=eyJ... \
  grafana/k6 run - <tests/load/gateway_load.js
```

## Interpreting Results

k6 prints a summary table after each run. Key metrics to watch:

| Metric | What It Means | Target |
|---|---|---|
| `http_req_duration (p95)` | 95th percentile response time | < 500ms |
| `http_req_failed` | Percentage of HTTP errors | < 1% |
| `errors` | Custom error rate across all checks | < 5% |
| `ws_connect_duration (p95)` | WebSocket connection setup time | < 2s |
| `ws_errors` | WebSocket connection failure rate | < 5% |
| `iterations` | Total completed VU iterations | Higher is better |
| `vus_max` | Peak concurrent virtual users | Matches stage config |

### What "pass" looks like

- All thresholds show green checkmarks.
- `http_req_duration p(95)` stays under 500ms at peak load (100 VUs).
- `http_req_failed` rate is under 0.01 (1%).

### What "fail" looks like

- Any threshold shows a red cross.
- `http_req_duration` spikes above 1s, indicating the gateway cannot keep up.
- High `http_req_failed` rate points to 5xx errors under load.

### Adjusting the test

Edit the `stages` array in the test script to change ramp-up profile. To run a quick smoke test:

```bash
k6 run --vus 5 --duration 30s tests/load/gateway_load.js
```
