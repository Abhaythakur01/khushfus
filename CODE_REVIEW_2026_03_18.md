# KhushFus Codebase Review — 2026-03-18

48 issues found across shared layer, gateway, backend services, frontend, and infrastructure.

---

## CRITICAL (10 issues)

### 1. [Shared] Auth bypass — missing org check in project_auth.py
- **File:** `shared/project_auth.py:51`
- **Status:** [x] FIXED
- **Description:** When `user_org_id` is falsy (None/0), the org ownership check short-circuits and grants access to any project for non-superadmin users.
- **Fix:** Deny access when `user_org_id` is falsy (unless superadmin).

### 2. [Shared] SSRF via DNS rebinding in url_validator.py
- **File:** `shared/url_validator.py:52-62`
- **Status:** [x] FIXED
- **Description:** URL is validated against resolved IP, but the caller makes a separate DNS resolution. Attacker can alternate between public IP (passes check) and 127.0.0.1.
- **Fix:** Added `validate_url_with_pin()` returning (url, resolved_ip) tuple for callers to pin connections.

### 3. [Gateway] IDOR — mentions toggle_flag/bulk_flag/bulk_assign
- **File:** `services/gateway/app/routes/mentions.py:104-174`
- **Status:** [x] FIXED
- **Description:** `toggle_flag`, `bulk_flag`, and `bulk_assign` endpoints fetch mentions by ID without checking org ownership. Any authenticated user can modify any org's mentions.
- **Fix:** Add org ownership check (join mention -> project -> check organization_id).

### 4. [Services] Data loss — reviews collector emits invalid Platform values
- **File:** `src/collectors/reviews.py:89,150,232`
- **Status:** [x] FIXED
- **Description:** Review collector emits `platform="trustpilot"/"yelp"/"g2"` which aren't in the `Platform` enum. Query Service crashes on `Platform(platform)`, sending all review mentions to DLQ.
- **Fix:** Add "trustpilot", "yelp", "g2" to the `Platform` enum in `shared/models.py`.

### 5. [Services] Runtime crash — identity_service uses passlib (incompatible with bcrypt 4.1+)
- **File:** `services/identity_service/app/main.py:29`
- **Status:** [x] FIXED
- **Description:** Uses `passlib` which CLAUDE.md documents as incompatible with bcrypt 4.1+. Auth will fail at runtime.
- **Fix:** Replace passlib with direct `bcrypt` usage (same pattern as gateway and tenant service).

### 6. [Frontend] Auth bypass — unknown/missing roles get full access
- **File:** `frontend/src/lib/rbac.ts:80-82`
- **Status:** [x] FIXED
- **Description:** Unknown/missing roles return `true` (full access) instead of denying. Any user without a role gets owner-level permissions.
- **Fix:** Default to `"viewer"` role permissions instead of returning `true`.

### 7. [Infra] OpenSearch security disabled by default
- **File:** `docker-compose.yml:63`
- **Status:** [x] FIXED
- **Description:** `DISABLE_SECURITY_PLUGIN` defaults to `true`. No auth on port 9200, all indexed data exposed.
- **Fix:** Default to `false`; require explicit opt-out for dev.

### 8. [Infra] `--reload` flag in production service commands
- **File:** `docker-compose.yml:100,327+`
- **Status:** [x] FIXED
- **Description:** Every service command uses `uvicorn --reload` which is CPU-intensive and unsafe for production.
- **Fix:** Remove `--reload` from docker-compose.yml; add it only in docker-compose.override.yml for dev.

### 9. [Infra] Placeholder secrets committed to git in K8s manifests
- **File:** `deploy/k8s/secrets.yaml`
- **Status:** [x] FIXED
- **Description:** `CHANGE_ME_IN_PRODUCTION` values tracked in kustomization. `kubectl apply` will overwrite real secrets.
- **Fix:** Remove from kustomization resources; use sealed secrets or external secrets operator.

### 10. [Migrations] Breaks fresh DB — drops non-existent constraint
- **File:** `migrations/versions/003_*.py:80`
- **Status:** [x] FIXED
- **Description:** `drop_constraint("uq_mention_source")` references a constraint that was never created. `alembic upgrade head` fails on new databases.
- **Fix:** Guard with existence check or remove the drop_constraint call.

---

## HIGH (22 issues)

### 11. [Shared] Webhook signing secret defaults to "unsigned"
- **File:** `shared/webhook.py:31-38`
- **Status:** [x] FIXED
- **Description:** When `WEBHOOK_SIGNING_SECRET` is not set, the secret is `"unsigned"`. Anyone can forge valid webhook signatures.
- **Fix:** Add production enforcement (exit if not set in production).

### 12. [Shared] Internal service token uses insecure hardcoded default
- **File:** `shared/internal_auth.py:37-38`
- **Status:** [x] FIXED
- **Description:** `INTERNAL_SERVICE_TOKEN` defaults to `"dev-internal-token-change-in-production"` with no production enforcement.
- **Fix:** Add `ENVIRONMENT` check and `sys.exit(1)` in production like jwt_config.py does.

### 13. [Shared] consume_with_retry creates exponential message amplification
- **File:** `shared/events.py:534-538`
- **Status:** [x] FIXED
- **Description:** On failure, message is re-published to the same stream. With N consumers and max_retries=5, this creates N^retries failed attempts.
- **Fix:** Re-publish to a dedicated retry stream or use XCLAIM instead of re-publishing.

### 14. [Shared] JWT key rotation broken — only tries current key
- **File:** `shared/auth.py:18-20`
- **Status:** [x] FIXED
- **Description:** `get_token_payload` only tries `JWT_SECRET_KEY`. Tokens signed with `JWT_PREVIOUS_SECRET_KEY` are rejected with 401.
- **Fix:** Try all keys from `get_signing_keys()`.

### 15. [Gateway] IDOR — trigger_report doesn't verify project ownership
- **File:** `services/gateway/app/routes/reports.py:58-94`
- **Status:** [x] FIXED
- **Description:** Accepts `project_id` query parameter without checking that the project belongs to the user's org.
- **Fix:** Add project ownership verification.

### 16. [Gateway] ValueError crash on invalid platform/sentiment enum
- **File:** `services/gateway/app/routes/mentions.py:50-53`
- **Status:** [x] FIXED
- **Description:** `Platform(platform)` on raw user input raises `ValueError` -> returns 500 instead of 400.
- **Fix:** Validate enum values before constructing, return 400 on invalid input.

### 17. [Gateway] organization_id defaults to 0 on project creation
- **File:** `services/gateway/app/routes/projects.py:63`
- **Status:** [x] FIXED
- **Description:** `organization_id=org_id or data.organization_id or 0` — value of 0 likely doesn't match any real org, causes FK violation or RLS bypass.
- **Fix:** Require valid org_id or reject the request.

### 18. [Services] 7 services default JWT secret to empty string
- **Files:** search, publishing, export, competitive, scheduler, audit, realtime services
- **Status:** [x] FIXED
- **Description:** JWT secret defaults to `""`. Attacker can craft valid JWT signed with empty string.
- **Fix:** Use same fallback as gateway with production enforcement.

### 19. [Services] Publishing service rate limiter failure defaults to deny
- **File:** `services/publishing_service/app/main.py:172`
- **Status:** [x] FIXED
- **Description:** Returns `{"allowed": False}` when rate limiter is unreachable, contradicting documented fail-open intent.
- **Fix:** Change to `{"allowed": True}`.

### 20. [Frontend] JWT token leaked in WebSocket URL query parameter
- **File:** `frontend/src/hooks/useWebSocket.ts:64`
- **Status:** [x] FIXED
- **Description:** JWT passed as `?token=...` in WebSocket URL. Visible in server logs, browser history, referrer headers.
- **Fix:** Send token via WebSocket message after connection, or use a short-lived ticket.

### 21. [Frontend] Reports page passes wrong variable to generateReport
- **File:** `frontend/src/app/reports/page.tsx:142`
- **Status:** [x] FIXED
- **Description:** Passes `scheduleFrequency` instead of `reportType` to `generateReport`. Wrong report type every time.
- **Fix:** Change to `reportType`.

### 22. [Frontend] In-memory cache not cleared on logout — data leaks between users
- **File:** `frontend/src/hooks/useFetch.ts`
- **Status:** [x] FIXED
- **Description:** Module-level cache Map stores API responses but is never cleared on logout. User A's data visible to user B on same tab.
- **Fix:** Call `clearFetchCache()` in the auth `clearAuth` function.

### 23. [Frontend] dashboard.sentiment.breakdown throws on flat API response
- **File:** `frontend/src/app/dashboard/page.tsx:188`
- **Status:** [x] FIXED
- **Description:** Assumes nested `dashboard.sentiment.breakdown` structure but API may return flat `sentiment_breakdown`.
- **Fix:** Add null-safe access with optional chaining and fallback.

### 24. [Frontend] Production CSP blocks Next.js inline scripts
- **File:** `frontend/next.config.js:40`
- **Status:** [x] FIXED
- **Description:** `script-src 'self'` in production blocks Next.js `__NEXT_DATA__` inline scripts. App broken in production.
- **Fix:** Add nonce-based CSP or keep `'unsafe-inline'` for now.

### 25. [Frontend] Search highlight regex bug
- **File:** `frontend/src/app/search/page.tsx:91-101`
- **Status:** [x] FIXED
- **Description:** `RegExp.test()` with `g` flag advances `lastIndex`, causing alternating highlight misses.
- **Fix:** Remove `g` flag from the test regex or use a fresh regex for each test.

### 26. [Infra] K8s consumer services probe TCP ports they never bind
- **File:** `deploy/k8s/services/core.yaml:56-63`
- **Status:** [x] FIXED
- **Description:** Collector, query, report, notification probe TCP ports they don't bind. Pods kill-looped.
- **Fix:** Use exec probes (e.g., check a PID file or health flag) instead of TCP probes.

### 27. [Infra] 13 K8s services missing securityContext — rejected by PSA
- **File:** `deploy/k8s/services/enterprise.yaml`, `parity.yaml`, `differentiation.yaml`
- **Status:** [x] FIXED
- **Description:** Services missing `securityContext` will be rejected by restricted PSA admission.
- **Fix:** Add proper securityContext (runAsNonRoot, drop ALL capabilities, readOnlyRootFilesystem).

### 28. [Infra] Redis health probe doesn't pass password
- **File:** `deploy/k8s/infrastructure/redis.yaml:62-69`
- **Status:** [x] FIXED
- **Description:** `redis-cli ping` without `-a $REDIS_PASSWORD` fails when auth is enabled. Pod killed repeatedly.
- **Fix:** Add password to health probe command.

### 29. [Infra] K8s OpenSearch initContainer runs as root
- **File:** `deploy/k8s/infrastructure/elasticsearch.yaml:22-27`
- **Status:** [x] FIXED
- **Description:** `fix-permissions` initContainer runs as root, violates restricted PSA. Pod won't schedule.
- **Fix:** Add securityContext or use a different permissions approach.

### 30. [Migrations] Table name typo — audit_log vs audit_logs
- **File:** `migrations/versions/005_*.py:57`
- **Status:** [x] FIXED
- **Description:** Index created on `"audit_log"` but table is `"audit_logs"`. Migration fails.
- **Fix:** Change to `"audit_logs"`.

### 31. [Migrations] CREATE INDEX CONCURRENTLY inside transaction
- **File:** `migrations/versions/005_*.py:31-85`
- **Status:** [x] FIXED
- **Description:** `postgresql_concurrently=True` cannot run inside Alembic's default transaction. All 7 indexes fail.
- **Fix:** Add `connection.execution_options(isolation_level="AUTOCOMMIT")` or remove CONCURRENTLY.

### 32. [Infra] Redis starts with no auth if REDIS_PASSWORD unset
- **File:** `docker-compose.yml:44-45`
- **Status:** [x] FIXED
- **Description:** No default password. Anyone on Docker host network can access Redis.
- **Fix:** Set a default password or fail startup if unset.

---

## MEDIUM (16 issues)

### 33. [Shared] Circuit breaker race condition in HALF_OPEN state
- **File:** `shared/circuit_breaker.py:62-87`
- **Status:** [x] FIXED
- **Description:** Multiple probe calls allowed in HALF_OPEN instead of one.

### 34. [Shared] get_consumer_lag crashes on empty consumer group
- **File:** `shared/events.py:473-480`
- **Status:** [x] FIXED
- **Description:** `info[3]` is `None` when no pending messages. Downstream iteration fails.

### 35. [Shared] check_idempotency race window allows double-processing
- **File:** `shared/request_dedup.py:41-64`
- **Status:** [x] FIXED
- **Description:** Check-then-set pattern not atomic. Use `SET NX` instead.

### 36. [Shared] _batch_durations list grows unbounded — memory leak
- **File:** `shared/service_utils.py:132`
- **Status:** [x] FIXED
- **Description:** List accumulates every batch duration forever in long-running consumers.

### 37. [Gateway] X-Forwarded-For trusted without validation for rate limiting
- **File:** `services/gateway/app/middleware.py:81-83`
- **Status:** [x] FIXED
- **Description:** Attacker can set arbitrary IP via X-Forwarded-For header to evade rate limits.

### 38. [Gateway] Dead code — RLS context check in get_db never fires
- **File:** `services/gateway/app/deps.py:49-57`
- **Status:** [x] FIXED
- **Description:** `get_db` runs before `get_current_user` sets `_current_user` on request.state.

### 39. [Services] Tenant service quota endpoints have no authentication
- **File:** `services/tenant_service/app/main.py:1151-1176`
- **Status:** [x] FIXED
- **Description:** `increment_mentions_used` and `check_project_quota` are unauthenticated.

### 40. [Services] Audit service GDPR endpoints overwrite authenticated user variable
- **File:** `services/audit_service/app/main.py:766,855`
- **Status:** [x] FIXED
- **Description:** `user = user_result.scalar_one_or_none()` overwrites the caller's identity from `require_auth`.

### 41. [Services] Search service sort_by uses unvalidated getattr on ORM model
- **File:** `services/search_service/app/main.py:328`
- **Status:** [x] FIXED
- **Description:** User-controlled `sort_by` used in `getattr(Mention, req.sort_by)` without allowlist.

### 42. [Frontend] Select component onChange handler casts incorrectly
- **File:** `frontend/src/components/ui/select.tsx:23`
- **Status:** [x] FIXED
- **Description:** Casts event handler to value-only function. Parents expecting native event get string instead.

### 43. [Frontend] Onboarding async submit and step transition not coordinated
- **File:** `frontend/src/app/onboarding/page.tsx:172-173`
- **Status:** [x] FIXED
- **Description:** `handleSubmit()` called without await, `setStep(3)` fires immediately.

### 44. [Infra] Postgres port exposed on 0.0.0.0
- **File:** `docker-compose.yml:24-25`
- **Status:** [x] FIXED
- **Description:** Port 5432 bound to all interfaces. On cloud VMs, DB is accessible from network.

### 45. [Infra] No default egress deny in K8s network policies
- **File:** `deploy/k8s/network-policies.yaml:9-19`
- **Status:** [x] FIXED
- **Description:** All pods can make arbitrary outbound connections.

### 46. [Infra] Prometheus scraping policy allows access to DB/Redis ports
- **File:** `deploy/k8s/network-policies.yaml:204-244`
- **Status:** [x] FIXED
- **Description:** Prometheus pod can connect to Postgres (5432), Redis (6379), OpenSearch (9200).

### 47. [Infra] E2E CI job runs tests without starting the app
- **File:** `.github/workflows/ci.yml:79-103`
- **Status:** [x] FIXED
- **Description:** Playwright tests run against localhost but no step starts the Next.js server or backend.

### 48. [Infra] Migration dry-run artifact path outside project dir
- **File:** `.gitlab-ci.yml:125-131`
- **Status:** [x] FIXED
- **Description:** Artifact at `/tmp/migration-dry-run.sql` is outside `$CI_PROJECT_DIR`. Never saved.
