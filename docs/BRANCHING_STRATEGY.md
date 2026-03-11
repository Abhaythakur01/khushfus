# KhushFus Branching Strategy

This document defines the branching model, naming conventions, pull request requirements, and release process for the KhushFus codebase.

---

## Model: Trunk-Based Development with Short-Lived Feature Branches

KhushFus uses **trunk-based development**. The `main` branch is always in a releasable state. Developers work on short-lived feature branches (maximum 2 days before merging) and integrate frequently to `main`.

This model is chosen over Gitflow because:
- It reduces merge conflicts and integration debt
- It forces frequent integration, catching regressions earlier
- It aligns with the CI/CD pipeline (every commit to `main` can be deployed)
- Feature flags gate incomplete features rather than long-running branches

---

## Branch Hierarchy

```
main                          ← Production-ready at all times
  └── feat/project-name-short-description
  └── fix/issue-id-short-description
  └── hotfix/critical-fix-description
  └── chore/task-description
  └── docs/what-is-being-documented
  └── release/v0.3.0           ← Release preparation only (short-lived)
```

---

## Branch Naming Conventions

| Type | Pattern | When to Use | Example |
|------|---------|-------------|---------|
| Feature | `feat/<scope>-<description>` | New functionality | `feat/alerts-slack-integration` |
| Bug fix | `fix/<issue-id>-<description>` | Fixing a known bug | `fix/1234-mention-dedup-race-condition` |
| Hotfix | `hotfix/<description>` | Critical production fix bypassing normal review | `hotfix/gateway-jwt-validation` |
| Chore | `chore/<description>` | Dependency updates, refactoring, CI changes | `chore/upgrade-fastapi-0.110` |
| Documentation | `docs/<description>` | Documentation-only changes | `docs/add-runbook-redis` |
| Release | `release/v<X.Y.Z>` | Release cut and changelog preparation | `release/v0.3.0` |

**Rules:**
- Use kebab-case (lowercase with hyphens)
- Keep names concise — under 50 characters
- Do not use your name in the branch name
- Branches must be deleted after merging

---

## Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer: Co-Authored-By, Fixes #issue]
```

**Types:**

| Type | When to Use |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, missing semicolons (no logic change) |
| `refactor` | Code restructuring without feature or bug change |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build process, dependency updates |
| `security` | Security hardening or vulnerability fix |

**Examples:**

```
feat(gateway): add request size limit middleware

Adds RequestSizeLimitMiddleware to cap request bodies at 10 MB by default.
Configurable via MAX_REQUEST_BODY_SIZE environment variable.

Fixes #892
```

```
fix(analyzer): prevent blocking event loop during DeBERTa inference

Wraps transformer model calls in asyncio.to_thread() so the event loop
remains responsive while NLP inference runs synchronously.
```

---

## Pull Request Requirements

### For all PRs merging to `main`

- [ ] **CI pipeline passes** — all lint, unit test, and security scan stages must be green
- [ ] **At least 1 approving review** from a team member who did not author the PR
- [ ] **No unresolved review comments** before merging
- [ ] **Branch is up to date** with `main` before merging (rebase or merge commit)
- [ ] **PR description** includes: what changed, why, and how to test it

### For PRs modifying backend services or shared layer

- [ ] **At least 2 approving reviews** — one from a backend engineer, one from any other team member
- [ ] **Tests added or updated** for the changed behavior
- [ ] **No secrets committed** — no API keys, passwords, or `.env` files

### For PRs modifying `shared/models.py` or `migrations/`

- [ ] **Database migration included** if the schema changed
- [ ] **Migration tested** against both PostgreSQL and SQLite (dev mode)
- [ ] **RLS policies updated** if new tenant-scoped tables are added
- [ ] **Data dictionary updated** (`docs/DATA_DICTIONARY.md`)

### For hotfix PRs

- [ ] **Minimum 1 approving review** (process may be expedited for P1 incidents)
- [ ] **Post-merge:** create a follow-up issue to add tests that cover the fix

---

## Protected Branch Rules

The `main` branch is protected with the following rules enforced via GitLab branch protection:

| Rule | Setting |
|------|---------|
| Push to `main` directly | **Blocked** — all changes via MR |
| Force push to `main` | **Blocked** — always |
| Delete `main` | **Blocked** — always |
| Merge without pipeline | **Blocked** — CI must pass |
| Merge without approval | **Blocked** — 1 approval minimum |
| Code owner approval | **Required** for `shared/`, `migrations/`, `.gitlab-ci.yml` |

---

## Release Process

### Standard Release (Minor/Patch)

1. **Create the release branch** from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b release/v0.3.0
   ```

2. **Update CHANGELOG.md**:
   - Move items from `[Unreleased]` to `[0.3.0] — YYYY-MM-DD`
   - Add any missing entries from commit history

3. **Bump the version** in relevant files:
   - `services/gateway/app/main.py` — `FastAPI(version="0.3.0")`
   - `pyproject.toml`

4. **Create a Merge Request** from `release/v0.3.0` → `main`.
   - Title: `release: v0.3.0`
   - Get 2 approvals (Engineering Lead + 1 other)

5. **Merge and tag**:
   ```bash
   git tag -a v0.3.0 -m "Release v0.3.0"
   git push origin v0.3.0
   ```

6. **Delete the release branch** after tagging.

7. **Deploy to staging** (automated via CI on tag push). Monitor for 30 minutes.

8. **Deploy to production** (manual gate in GitLab CI). Notify the team in #deployments.

### Hotfix Release

For critical P1 fixes that cannot wait for the next standard release:

1. Branch from `main`: `git checkout -b hotfix/gateway-crash`
2. Implement the fix with a test
3. Create a PR with expedited review (1 approval required)
4. Merge to `main`
5. Tag immediately: `v0.2.1` (patch increment)
6. Deploy to production via the CI manual gate
7. Create a follow-up issue to add comprehensive test coverage

---

## Code Freeze

A **code freeze** is declared 48 hours before a major release. During a code freeze:
- Only bug fixes and documentation changes are accepted into `main`
- All other feature branches must wait for the freeze to lift
- The Engineering Lead must approve any exception to code freeze

Code freeze is announced in the #engineering Slack channel and in the GitLab release milestone.
