# KhushFus API Reference

The KhushFus API Gateway exposes a versioned REST API at port **8000**. It is built with FastAPI, which generates an interactive OpenAPI specification automatically.

---

## Interactive Documentation

### Swagger UI

Browse and execute API calls directly from your browser:

```
http://localhost:8000/docs
```

Swagger UI lets you authenticate with a Bearer token, expand endpoint details, inspect request/response schemas, and run live requests.

### ReDoc

Read-only, printable API documentation with a three-panel layout:

```
http://localhost:8000/redoc
```

ReDoc is better suited for sharing with external stakeholders or generating PDFs.

### OpenAPI JSON

Machine-readable OpenAPI 3.1 specification:

```
http://localhost:8000/openapi.json
```

Use this to import the spec into Postman, Insomnia, or API client generators.

---

## Authentication

All endpoints (except `/api/v1/auth/register` and `/api/v1/auth/login`) require a JWT Bearer token.

**Header format:**

```
Authorization: Bearer <access_token>
```

Tokens are issued by the `/api/v1/auth/login` endpoint and expire after the configured TTL (default 24 hours). On expiry, re-authenticate with `/api/v1/auth/login`.

---

## Base URL

```
http(s)://<host>:8000/api/v1
```

All current stable endpoints are under `/api/v1`. A placeholder `/api/v2` path exists but is not yet active.

---

## Endpoint Groups

### Auth — `/api/v1/auth`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/register` | Create a new user account |
| `POST` | `/login` | Exchange credentials for a JWT token |
| `GET` | `/me` | Return the authenticated user's profile |

**Register a new user:**

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "analyst@acme.com",
  "password": "SecurePass123",
  "full_name": "Jane Smith",
  "organization": "Acme Corp"
}
```

Response `201`:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 42,
    "email": "analyst@acme.com",
    "full_name": "Jane Smith",
    "is_active": true,
    "is_superadmin": false
  }
}
```

**Login:**

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "analyst@acme.com",
  "password": "SecurePass123"
}
```

---

### Projects — `/api/v1/projects`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all projects (paginated) |
| `POST` | `/` | Create a new project |
| `GET` | `/{project_id}` | Get a single project with its keywords |
| `PATCH` | `/{project_id}` | Partially update a project |
| `POST` | `/{project_id}/collect` | Trigger data collection for a project |
| `POST` | `/{project_id}/keywords` | Add a keyword to a project |

**Create a project:**

```http
POST /api/v1/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Acme Brand Monitor",
  "description": "Track Acme brand sentiment across social platforms",
  "client_name": "Acme Corp",
  "platforms": "twitter,reddit,news",
  "keywords": [
    {"term": "acme corp", "keyword_type": "brand"},
    {"term": "acme product", "keyword_type": "product"},
    {"term": "@acmecorp", "keyword_type": "handle"}
  ]
}
```

**Trigger collection:**

```http
POST /api/v1/projects/42/collect
Authorization: Bearer <token>
Content-Type: application/json

{
  "hours_back": 24
}
```

Response:

```json
{
  "status": "collection_started",
  "project_id": 42,
  "mode": "distributed"
}
```

---

### Mentions — `/api/v1/mentions`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List mentions with filters (paginated) |
| `GET` | `/{mention_id}` | Get a single mention |
| `PATCH` | `/{mention_id}/flag` | Toggle the flagged status of a mention |
| `POST` | `/bulk/flag` | Flag or unflag up to 100 mentions |
| `POST` | `/bulk/assign` | Assign up to 100 mentions to a user |

**List mentions with filters:**

```http
GET /api/v1/mentions?project_id=42&platform=twitter&sentiment=negative&page=1&page_size=25
Authorization: Bearer <token>
```

Query parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | integer | **Required.** Filter by project |
| `platform` | string | Filter by platform (e.g., `twitter`, `reddit`) |
| `sentiment` | string | Filter by sentiment: `positive`, `negative`, `neutral`, `mixed` |
| `keyword` | string | Filter by matched keyword substring |
| `since` | ISO 8601 datetime | Lower bound for `published_at` |
| `until` | ISO 8601 datetime | Upper bound for `published_at` |
| `flagged_only` | boolean | Return only flagged mentions |
| `page` | integer | Page number (default: 1) |
| `page_size` | integer | Results per page (default: 50, max: 200) |

Response:

```json
{
  "items": [
    {
      "id": 1001,
      "platform": "twitter",
      "text": "Acme's new product launch is disappointing...",
      "author_name": "John Doe",
      "sentiment": "negative",
      "sentiment_score": -0.72,
      "published_at": "2026-03-10T14:30:00Z",
      "likes": 45,
      "shares": 12
    }
  ],
  "total": 347,
  "page": 1,
  "page_size": 25
}
```

---

### Reports — `/api/v1/reports`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/` | Generate a new report |
| `GET` | `/` | List all reports for a project |
| `GET` | `/{report_id}` | Get a single report |

**Generate a report:**

```http
POST /api/v1/reports
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": 42,
  "report_type": "weekly",
  "title": "Weekly Brand Sentiment — Week 10",
  "period_start": "2026-03-01T00:00:00Z",
  "period_end": "2026-03-07T23:59:59Z",
  "format": "pdf"
}
```

---

### Dashboard — `/api/v1/dashboard`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Aggregated KPI metrics (total mentions, sentiment breakdown, platform share) |
| `GET` | `/trend` | Time-series trend data for charts |

Query parameters: `project_id`, `time_range` (`24h`, `7d`, `30d`, `90d`).

---

### Alerts — `/api/v1/alerts`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rules` | List alert rules for a project |
| `POST` | `/rules` | Create an alert rule |
| `PATCH` | `/rules/{rule_id}` | Update an alert rule |
| `DELETE` | `/rules/{rule_id}` | Delete an alert rule |
| `GET` | `/log` | Retrieve the alert log for a project |
| `PATCH` | `/log/{log_id}/acknowledge` | Acknowledge an alert |

**Create an alert rule:**

```http
POST /api/v1/alerts/rules
Authorization: Bearer <token>
Content-Type: application/json

{
  "project_id": 42,
  "name": "Negative spike alert",
  "rule_type": "sentiment_spike",
  "threshold": 0.3,
  "window_minutes": 60,
  "channels": "email,slack",
  "webhook_url": "https://hooks.slack.com/services/..."
}
```

---

### Health — `/health`

```http
GET /health
```

Returns the health status of the gateway, Postgres, and Redis. No authentication required.

```json
{
  "service": "gateway",
  "status": "healthy",
  "checks": {
    "postgres": "healthy",
    "redis": "healthy"
  },
  "timestamp": "2026-03-10T14:30:00Z"
}
```

---

## Error Responses

All errors follow a standard envelope:

```json
{
  "detail": "Human-readable error message",
  "request_id": "c3d4e5f6-..."
}
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request — invalid input |
| `401` | Unauthorized — missing or invalid token |
| `403` | Forbidden — insufficient permissions |
| `404` | Resource not found |
| `409` | Conflict — resource already exists |
| `422` | Unprocessable entity — validation error |
| `429` | Too many requests — rate limit exceeded |
| `500` | Internal server error |

---

## Rate Limiting

The API enforces per-organization rate limits. Limits are tracked in the centralized Rate Limiter service (`:8014`). The gateway middleware is **fail-open** — if the rate limiter is unreachable, requests are allowed through.

Rate limit headers are returned on all responses:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1710076800
```

---

## Request Correlation

Every request receives a unique `X-Request-ID` header. Supply your own to trace requests end-to-end:

```
X-Request-ID: my-trace-id-abc123
```

The same ID is echoed back in the response headers and included in all server-side log entries.

---

## Exporting the OpenAPI Spec

Save the spec locally for offline use or import into API tooling:

```bash
curl http://localhost:8000/openapi.json -o khushfus-openapi.json
```

Import into Postman: **File → Import → Link** → paste `http://localhost:8000/openapi.json`.

Import into Insomnia: **Create → From URL** → paste `http://localhost:8000/openapi.json`.
