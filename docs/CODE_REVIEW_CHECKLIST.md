# Code Review Checklist

Use this checklist when reviewing pull requests for KhushFus. Not every item applies to every PR — use judgment and focus on the items most relevant to the change.

Reviewers should aim to complete reviews within **1 business day** for standard PRs and **2 hours** for hotfixes.

---

## Security

### Authentication and Authorization
- [ ] Every endpoint that accesses tenant data calls `require_auth` and `get_user_org_id`
- [ ] No endpoint returns data from a different organization than the authenticated user's
- [ ] Role-based access control (RBAC) is enforced where required (e.g., only `admin`/`owner` can invite members)
- [ ] New API keys are hashed before storage; raw keys are never persisted
- [ ] JWT tokens are validated before extracting user/org context — never trust request body claims

### Input Validation and Injection
- [ ] All user-supplied values go through SQLAlchemy ORM or parameterized queries — no raw string interpolation in SQL
- [ ] URL fields (webhook URLs, integration endpoints) are validated through `shared/url_validator.py` to prevent SSRF
- [ ] File path inputs are validated and canonicalized — no path traversal (`../`) possible
- [ ] Integer/float inputs are bounds-checked where appropriate (e.g., page size limits)
- [ ] Pydantic models with `Field(min_length=..., max_length=...)` are used on all request bodies

### Secrets and Credentials
- [ ] No API keys, passwords, tokens, or secrets are hardcoded in source code
- [ ] No `.env` file or credential file is included in the commit
- [ ] All sensitive configuration is read from environment variables
- [ ] Log statements do not output sensitive values (passwords, tokens, PII)

### CORS and Headers
- [ ] New services that expose HTTP endpoints use `shared/cors.py` for CORS configuration
- [ ] Security headers (Content-Security-Policy, X-Frame-Options) are not accidentally removed
- [ ] The `X-Request-ID` correlation header is propagated in inter-service calls where applicable

### Data Exposure
- [ ] Response models use explicit Pydantic schemas — no `dict(model.__dict__)` that could leak internal fields
- [ ] `hashed_password`, `key_hash`, and `sso_metadata_url` are never included in API responses
- [ ] Soft-deleted records (`is_deleted=True`) are excluded from all query results

---

## Performance

### Database Queries
- [ ] No N+1 queries — relationships are loaded with `selectinload()` or `joinedload()` where needed
- [ ] All list endpoints are paginated with `limit` and `offset`; default page size is reasonable (≤100)
- [ ] New queries on high-volume tables (`mentions`, `audit_logs`) use indexed columns in `WHERE` clauses
- [ ] New composite indexes are added if the query pattern is not covered by existing indexes (see `shared/models.py`)
- [ ] `COUNT(*)` queries use `func.count(Model.id)` — not `len(result.scalars().all())`
- [ ] Bulk operations use `db.execute(update(...).where(...))` rather than loading all rows into Python and updating one by one

### Redis and Event Bus
- [ ] Event payloads are compact — no full mention text in `collection:request` or similar signals
- [ ] Consumer groups acknowledge messages (`XACK`) after successful processing — not before
- [ ] DLQ handling is tested: messages that fail after all retries are moved to `dlq:*` with a reason field

### Caching
- [ ] Repeated expensive computations (e.g., organization plan lookup per request) are cached for the request lifetime
- [ ] Redis keys have TTLs set — no unbounded growth

### Frontend
- [ ] API calls in React hooks use `AbortController` or similar to cancel in-flight requests on component unmount
- [ ] Large lists use pagination or virtualization — no rendering of thousands of rows
- [ ] Heavy components are loaded with `next/dynamic` (lazy loading) where appropriate

---

## Code Quality

### Error Handling
- [ ] All `await db.execute(...)` and Redis calls are wrapped in try/except where partial failure is acceptable
- [ ] HTTP errors use `HTTPException` with explicit status codes — not bare Python exceptions
- [ ] Consumer services catch exceptions per-message and do not crash the entire consumer loop
- [ ] Circuit breaker is used for inter-service HTTP calls (`shared/circuit_breaker.py`)

### Logging
- [ ] Errors are logged with `logger.error(...)` including context (request_id, project_id, user_id)
- [ ] Sensitive data is not logged (tokens, passwords, full mention text in high-frequency logs)
- [ ] New services use `logging.getLogger(__name__)` — not `print()`

### Tests
- [ ] New features have unit tests covering the happy path and at least one error path
- [ ] Edge cases are tested: empty results, invalid IDs, unauthorized access, missing optional fields
- [ ] Tests do not use `time.sleep()` — use mocks or `asyncio.wait_for()` with timeouts
- [ ] Test fixtures are isolated — no shared mutable state between tests
- [ ] Integration tests that require Postgres/Redis are marked with the appropriate pytest marker

### Code Style
- [ ] `ruff check` passes with no errors (`make lint`)
- [ ] `ruff format` has been applied (`make format`)
- [ ] Line length does not exceed 120 characters (configured in `pyproject.toml`)
- [ ] Imports are organized: stdlib → third-party → local (enforced by ruff `I` rules)
- [ ] No commented-out code blocks left in the PR (use git to recover old code if needed)

### Architecture Alignment
- [ ] New backend services use `shared/database.py`, `shared/events.py`, `shared/models.py` — not duplicating logic
- [ ] New database tables have a corresponding Alembic migration in `migrations/versions/`
- [ ] New tenant-scoped tables have RLS enabled in the migration
- [ ] New services added to `docker-compose.yml` with a health check and resource limits
- [ ] New services documented in `CLAUDE.md` services table

---

## Frontend Checks

### Functionality
- [ ] All data fetch states are handled: loading (skeleton/spinner), error (error message), empty (empty state)
- [ ] Form validation errors are shown inline — not just on submit failure
- [ ] Destructive actions (delete project, archive) have a confirmation dialog
- [ ] Pagination works correctly at page boundaries (first page, last page, single page)

### Accessibility
- [ ] Interactive elements (`button`, `a`, custom controls) are keyboard-navigable
- [ ] Images have `alt` text; decorative images have `alt=""`
- [ ] Color is not the only means of conveying status (sentiment badges use text + color)
- [ ] Form inputs have associated `<label>` elements

### Responsive Design
- [ ] New pages render correctly at 1280px (desktop), 768px (tablet), and 375px (mobile)
- [ ] Table columns degrade gracefully on narrow viewports (hide less important columns)
- [ ] Sidebar collapses properly on mobile

### Dark Theme Consistency
- [ ] New components use the established color palette: `bg-slate-950` (page), `bg-slate-900/60` (cards), `border-slate-800`, `text-slate-100/200/300/400`
- [ ] No hardcoded light-mode colors (`text-gray-900`, `bg-white`) in new components
- [ ] Focus ring is visible against the dark background

### TypeScript
- [ ] No `any` types introduced without a documented justification
- [ ] API response types are defined in `src/lib/api.ts` — not inlined as ad-hoc objects
- [ ] Props interfaces are explicitly typed — not inferred from default values

---

## Documentation

- [ ] New public-facing API endpoints are described with FastAPI `summary` and `description` parameters
- [ ] New environment variables are added to `.env.example` with a descriptive comment
- [ ] New services are documented in `CLAUDE.md`
- [ ] Significant architectural decisions are recorded in a new ADR under `docs/adr/`
- [ ] Database schema changes are reflected in `docs/DATA_DICTIONARY.md`
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]` for user-visible changes

---

## Review Etiquette

- **Be constructive.** Comment on the code, not the author.
- **Distinguish blockers from suggestions.** Prefix non-blocking suggestions with `nit:` or `optional:`.
- **Ask questions, don't assume intent.** "Why is X done this way?" is better than "X is wrong."
- **Approve when the PR meets the bar**, even if you have minor suggestions. Leave `nit:` comments without blocking.
- **Respond to all review comments** before requesting a re-review — even if just "Done" or "Won't fix because...".
