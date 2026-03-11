# ADR 004 — Next.js 14 with App Router for the Frontend

**Status:** Accepted
**Date:** 2025-11-15
**Authors:** KhushFus Engineering

---

## Context

KhushFus requires a web frontend for enterprise users: marketing analysts, brand managers, and social media teams. The requirements are:

1. **Data-heavy dashboards** — real-time charts, paginated tables, complex filter UIs
2. **Authentication** — JWT-based auth with SSO support (SAML/OIDC for enterprise)
3. **Dark theme** — enterprise SaaS aesthetic, similar to Sprinklr/Brandwatch
4. **Performance** — dashboards with multiple API calls must feel fast; skeleton loading states are required
5. **Developer experience** — the backend team is familiar with TypeScript; the stack should be learnable quickly
6. **SEO is not a priority** — all pages are behind authentication; no public marketing pages at this stage

The team evaluated three options:

**Option A: Create React App (CRA) / Vite SPA**
- Simple, well-understood
- No built-in routing beyond client-side React Router
- No server-side rendering (not needed, but limits future options)
- CRA is deprecated; Vite is the modern alternative
- Lacks opinionated project structure for large apps

**Option B: Next.js 14 with App Router**
- Industry-standard React meta-framework; large ecosystem and community
- App Router (React Server Components) enables future server-side rendering if needed
- File-system routing reduces boilerplate
- Built-in image optimization, font loading, and TypeScript support
- `"use client"` directive clearly marks client-side boundaries
- Used by Vercel-hosted SaaS apps at scale

**Option C: Vue 3 / Nuxt**
- Excellent developer experience; more approachable for some developers
- Smaller ecosystem than React for enterprise UI component libraries
- Team has less Vue experience; steeper learning curve in this context

**Option D: Remix**
- Strong server-side data loading patterns (loaders/actions)
- Smaller community than Next.js; fewer enterprise component integrations
- Good fit for form-heavy apps; less natural for dashboard-heavy apps

---

## Decision

We will use **Next.js 14 with the App Router** for the KhushFus frontend.

**Key implementation choices:**

- All authenticated pages use `"use client"` — data is fetched client-side via the API client (`src/lib/api.ts`) since pages are behind JWT auth and SSR offers no SEO benefit
- `<AppShell>` component provides the consistent layout: collapsible sidebar, header with user dropdown
- Tailwind CSS with dark theme: `bg-slate-950` page, `bg-slate-900/60` cards, `border-slate-800`
- Recharts for all data visualization (line charts, bar charts, pie charts)
- `src/lib/auth.tsx` manages JWT in `localStorage`, validates token on mount via `/api/v1/auth/me`, and exposes an `AuthProvider` context
- Reusable UI components in `src/components/ui/`: Button, Card, Input, Select, Badge, Spinner, Dialog, Tabs, Table, Textarea

**Folder structure:**

```
frontend/src/
├── app/                # Next.js App Router pages
│   ├── (auth)/         # Login/register — separate layout (no AppShell)
│   ├── dashboard/
│   ├── projects/
│   ├── mentions/
│   ├── analytics/
│   ├── reports/
│   ├── alerts/
│   ├── search/
│   ├── publishing/
│   └── settings/
├── components/
│   ├── layout/         # AppShell, Sidebar, Header
│   └── ui/             # Reusable UI primitives
├── hooks/              # useProjects, useMentions, etc.
└── lib/                # api.ts, auth.tsx
```

---

## Consequences

**Positive:**
- File-system routing eliminates the need to maintain a manual route registry
- App Router's layout system makes `<AppShell>` wrapping simple and consistent
- TypeScript support is first-class — props and API response types are inferred
- Large ecosystem: Recharts, react-hook-form, date-fns, and other enterprise-grade libraries are available
- Tailwind CSS enables rapid UI iteration with no context switching to CSS files
- The `"use client"` directive makes the client/server boundary explicit — easier to reason about data fetching
- Next.js's `next/image` optimizes images automatically (avatar URLs, media thumbnails)

**Negative:**
- App Router is relatively new (stable since Next.js 13.4); some ecosystem libraries are slower to adopt RSC patterns — we mitigate this by using `"use client"` everywhere for now
- `localStorage` for JWT storage is susceptible to XSS attacks; `httpOnly` cookies would be more secure (acceptable trade-off at current threat model; cookies require CSRF protection to add)
- Larger JavaScript bundle than a minimal Vite SPA; mitigated by Next.js code splitting per page
- Next.js version upgrades can introduce breaking changes between major versions

**Follow-up work:**
- Evaluate migrating to `httpOnly` cookie-based auth when SSO becomes a primary onboarding path
- Add Storybook for component documentation and visual regression testing
- Implement a React Query (TanStack Query) layer to replace manual fetch state management in hooks
- Add E2E tests with Playwright for critical paths (login, project create, mention inbox)
