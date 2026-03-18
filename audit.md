    KhushFus — Architecture Overview & Resource Roadmap

    Current Architecture

                              ┌─────────────────┐
                              │   Next.js 14     │
                              │   Frontend       │
                              │   (Port 3000)    │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │   API Gateway    │
                              │   (FastAPI:8000) │
                              │   JWT + bcrypt   │
                              │   Rate Limiting  │
                              └────────┬─────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                     ▼
         ┌────────────────┐  ┌────────────────┐   ┌────────────────┐
         │ Identity :8010 │  │ Tenant  :8011  │   │ Realtime :8019 │
         │ SSO/SAML/OIDC  │  │ RBAC/Quotas    │   │ WebSocket      │
         └────────────────┘  └────────────────┘   └────────────────┘

         ═══════════════ Redis Streams Event Bus ═══════════════

         ┌──────────┐    mentions:raw    ┌──────────┐   mentions:analyzed
         │Collector │ ──────────────────►│ Analyzer │ ─────────┬──────────►
         │20 platforms│                  │ NLP Pipeline│        │
         └──────────┘                    └──────────┘          │
                                              │                │
                                        ┌─────▼────┐    ┌──────▼──────┐
                                        │ Media Svc│    │Query Service│
                                        │ OCR/Video│    │Postgres + ES│
                                        └─────┬────┘    └──────┬──────┘
                                              │                │
                                        ┌─────▼────┐    ┌──────▼──────┐
                                        │Enrichment│    │Notification │
                                        │Bot detect│    │Email/Slack  │
                                        └──────────┘    └─────────────┘

         ┌───────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌───────┐
         │Publishing │ │ Export   │ │Competitive │ │Scheduler │ │ Audit │
         │  :8013    │ │  :8015   │ │   :8016    │ │  :8017   │ │ :8018 │
         └───────────┘ └──────────┘ └────────────┘ └──────────┘ └───────┘

         Infrastructure: PostgreSQL │ Redis │ OpenSearch │ Jaeger │ Prometheus │ Grafana

    19 microservices across 4 phases:
    - Phase 1 (Core): Gateway, Collector, Analyzer, Query, Report, Notification
    - Phase 2 (Enterprise): Identity (SSO), Tenant (multi-org), Media Analysis, Search
    - Phase 3 (Parity): Publishing, Rate Limiter, Enrichment, Export
    - Phase 4 (Differentiation): Competitive Intel, Scheduler, Audit/Compliance, Realtime WebSocket

    NLP Pipeline: 3-tier sentiment (VADER → DeBERTa → Claude API), spaCy NER, 7-emotion detection, BERTopic, sarcasm
    detection

    Data Flow: Collector → mentions:raw → Analyzer → mentions:analyzed → Query Service (Postgres + OpenSearch) +
    Notification Service (dual consumers)

    ---
    Key Gaps Summary

    Critical Infrastructure Gaps

    ┌──────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────┐
    │                 Gap                  │                                  Impact                                  │
    ├──────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
    │ Single-node                          │ Zero HA — one crash = full outage                                        │
    │ Postgres/Redis/OpenSearch            │                                                                          │
    ├──────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
    │ No backpressure (Collector →         │ Analyzer at 6/sec, Collector much faster. Stream maxlen=100K silently    │
    │ Analyzer)                            │ drops data                                                               │
    ├──────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
    │ JWT in localStorage                  │ XSS-vulnerable, needs BFF with httpOnly cookies                          │
    ├──────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
    │ Pool exhaustion                      │ pool_size=20 shared across 19 services = crash at ~500 req/s             │
    ├──────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
    │ No mTLS between services             │ Internal traffic unencrypted                                             │
    ├──────────────────────────────────────┼──────────────────────────────────────────────────────────────────────────┤
    │ Secrets in env vars                  │ Visible via kubectl describe pod                                         │
    └──────────────────────────────────────┴──────────────────────────────────────────────────────────────────────────┘

    Application Gaps

    ┌─────────────────────────┬──────────────────────────────────────────────────────────────┐
    │           Gap           │                            Impact                            │
    ├─────────────────────────┼──────────────────────────────────────────────────────────────┤
    │ RBAC not enforced in UI │ Just implemented today, but backend RBAC enforcement is thin │
    ├─────────────────────────┼──────────────────────────────────────────────────────────────┤
    │ GDPR incomplete         │ author_handle not anonymized on purge                        │
    ├─────────────────────────┼──────────────────────────────────────────────────────────────┤
    │ No MFA/2FA              │ Enterprise deal-breaker                                      │
    ├─────────────────────────┼──────────────────────────────────────────────────────────────┤
    │ No real alerting rules  │ Prometheus configured but zero alert definitions             │
    ├─────────────────────────┼──────────────────────────────────────────────────────────────┤
    │ No log aggregation      │ Structured logging exists but goes to stdout only            │
    ├─────────────────────────┼──────────────────────────────────────────────────────────────┤
    │ Accessibility (WCAG)    │ Just started fixing, far from AA compliance                  │
    ├─────────────────────────┼──────────────────────────────────────────────────────────────┤
    │ i18n framework unused   │ Built but not integrated into any UI                         │
    └─────────────────────────┴──────────────────────────────────────────────────────────────┘

    ---
    Resources Needed for Enterprise Quality

    Paid Services (Monthly Estimates)

    ┌────────────────────────┬───────────────────────────────────────────────────┬───────────────────┬───────────────┐
    │        Resource        │                      Purpose                      │   Est. Cost/mo    │   Priority    │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ Claude API (Anthropic) │ Tier-3 sentiment, LLM insights, crisis detection, │ $200–$2,000+      │ Already using │
    │                        │  report narratives                                │ (usage-based)     │               │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │                        │ Production K8s cluster (EKS/GKE/AKS), managed     │                   │               │
    │ AWS/GCP/Azure          │ Postgres (RDS), managed Redis (ElastiCache),      │ $1,500–$5,000     │ Critical      │
    │                        │ managed OpenSearch                                │                   │               │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ Sentry                 │ Error tracking, session replay, performance       │ $26/mo (50K       │ Already       │
    │                        │ monitoring (Team plan)                            │ events)           │ configured    │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ Datadog or Grafana     │ APM, log aggregation, distributed tracing,        │ $100–$500         │ High          │
    │ Cloud                  │ alerting, dashboards                              │                   │               │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ Auth0 / Clerk          │ SSO (SAML/OIDC), MFA, passwordless, social login  │ $150–$700         │ High          │
    │                        │ — replaces custom Identity service                │                   │               │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ LaunchDarkly / Unleash │ Feature flags for safe rollouts, A/B testing      │ $10–$100          │ Medium        │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ SendGrid / Postmark    │ Transactional email (alerts, password resets,     │ $20–$100          │ High          │
    │                        │ invites, report delivery)                         │                   │               │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ Twilio                 │ SMS for MFA and critical alerts                   │ $50–$200          │ Medium        │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ Cloudflare             │ CDN, DDoS protection, WAF, bot management         │ $20–$200          │ High          │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ HashiCorp Vault or AWS │ Secret management (API keys, DB creds, JWT        │ $50–$150          │ High          │
    │  Secrets Manager       │ secrets)                                          │                   │               │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ Snyk or Dependabot Pro │ Dependency vulnerability scanning, license        │ Free–$100         │ Medium        │
    │                        │ compliance                                        │                   │               │
    ├────────────────────────┼───────────────────────────────────────────────────┼───────────────────┼───────────────┤
    │ Vercel (or self-host)  │ Frontend hosting with edge functions, preview     │ $20–$150          │ Medium        │
    │                        │ deployments                                       │                   │               │
    └────────────────────────┴───────────────────────────────────────────────────┴───────────────────┴───────────────┘

    External Data APIs (for Collectors)

    ┌───────────────────────────┬───────────────────────────────────┬───────────────────────────┬────────────────────┐
    │            API            │              Purpose              │       Est. Cost/mo        │   Current Status   │
    ├───────────────────────────┼───────────────────────────────────┼───────────────────────────┼────────────────────┤
    │ Twitter/X API (Pro)       │ Tweet collection, streaming       │ $100–$5,000               │ Not connected      │
    │                           │                                   │                           │ (free tier gone)   │
    ├───────────────────────────┼───────────────────────────────────┼───────────────────────────┼────────────────────┤
    │ Meta Graph API            │ Facebook + Instagram mentions     │ Free (approval required)  │ Needs app review   │
    ├───────────────────────────┼───────────────────────────────────┼───────────────────────────┼────────────────────┤
    │ YouTube Data API          │ Video comments, channel           │ Free (quota limits)       │ Needs API key      │
    │                           │ monitoring                        │                           │                    │
    ├───────────────────────────┼───────────────────────────────────┼───────────────────────────┼────────────────────┤
    │ TikTok Research API       │ TikTok mentions                   │ Free (academic/research   │ Not connected      │
    │                           │                                   │ approval)                 │                    │
    ├───────────────────────────┼───────────────────────────────────┼───────────────────────────┼────────────────────┤
    │ NewsAPI or GDELT          │ News article collection           │ Free–$450                 │ GDELT working      │
    │                           │                                   │                           │ (free)             │
    ├───────────────────────────┼───────────────────────────────────┼───────────────────────────┼────────────────────┤
    │ Reddit API                │ Reddit mentions                   │ Free (rate limited)       │ Working (public    │
    │                           │                                   │                           │ JSON)              │
    ├───────────────────────────┼───────────────────────────────────┼───────────────────────────┼────────────────────┤
    │ Brandwatch/Talkwalker     │ Pre-aggregated social data (if    │ $2,000–$10,000+           │ N/A                │
    │ Firehose                  │ building is too slow)             │                           │                    │
    ├───────────────────────────┼───────────────────────────────────┼───────────────────────────┼────────────────────┤
    │ Proxies (Bright Data /    │ Residential proxies for scraping  │ $300–$1,000               │ Not using          │
    │ Oxylabs)                  │ where APIs don't exist            │                           │                    │
    └───────────────────────────┴───────────────────────────────────┴───────────────────────────┴────────────────────┘

    ML/NLP Models (GPU Compute)

    ┌──────────────────────────────────┬─────────────────────────────────────────────────────┬──────────────┐
    │             Resource             │                       Purpose                       │ Est. Cost/mo │
    ├──────────────────────────────────┼─────────────────────────────────────────────────────┼──────────────┤
    │ GPU instances (A10G/T4)          │ Run DeBERTa sentiment, BERTopic, spaCy NER at scale │ $200–$1,000  │
    ├──────────────────────────────────┼─────────────────────────────────────────────────────┼──────────────┤
    │ Hugging Face Inference Endpoints │ Managed model hosting (alternative to self-hosting) │ $100–$500    │
    ├──────────────────────────────────┼─────────────────────────────────────────────────────┼──────────────┤
    │ OpenAI API (fallback)            │ Backup LLM for insights if Claude is down           │ Usage-based  │
    └──────────────────────────────────┴─────────────────────────────────────────────────────┴──────────────┘

    Team/Tooling

    ┌────────────────────────────────┬────────────────────────────────────────────────────┬──────────────┐
    │            Resource            │                      Purpose                       │ Est. Cost/mo │
    ├────────────────────────────────┼────────────────────────────────────────────────────┼──────────────┤
    │ GitLab Premium or GitHub Teams │ CI/CD minutes, protected branches, code review     │ $20–$40/user │
    ├────────────────────────────────┼────────────────────────────────────────────────────┼──────────────┤
    │ Storybook + Chromatic          │ Visual regression testing, component documentation │ Free–$150    │
    ├────────────────────────────────┼────────────────────────────────────────────────────┼──────────────┤
    │ Linear / Jira                  │ Issue tracking, sprint planning                    │ $8–$16/user  │
    ├────────────────────────────────┼────────────────────────────────────────────────────┼──────────────┤
    │ PagerDuty / OpsGenie           │ On-call alerting, incident management              │ $20–$50/user │
    ├────────────────────────────────┼────────────────────────────────────────────────────┼──────────────┤
    │ Notion / Confluence            │ Runbooks, architecture docs, ADRs                  │ $10/user     │
    └────────────────────────────────┴────────────────────────────────────────────────────┴──────────────┘

    ---
    What Would Drastically Improve Quality

    Tier 1 — Immediate (biggest ROI)

    1. Managed cloud infrastructure — HA Postgres, Redis Cluster, managed OpenSearch. Eliminates the single-node SPOF.
    2. Auth0/Clerk — Instant MFA, SSO, social login. Replaces months of custom auth work.
    3. Datadog/Grafana Cloud — Actual observability. Right now you're flying blind in production.
    4. Twitter/X API access — Twitter is 40-60% of social listening volume. Without it, the product is incomplete.
    5. Cloudflare WAF + CDN — Security and performance in one.

    Tier 2 — Next Quarter

    6. GPU compute for NLP — Move DeBERTa/BERTopic off CPU. 10-50x throughput improvement.
    7. Kafka (replace Redis Streams) — Proper durability, replay, backpressure at scale.
    8. SendGrid + Twilio — Reliable transactional comms.
    9. Vault — Get secrets out of env vars.

    Tier 3 — Scale

    10. Proxy infrastructure — For platforms without APIs.
    11. Multi-region deployment — Data residency for EU customers (GDPR).
    12. Brandwatch/Talkwalker firehose — If building 20 collectors proves too brittle at scale.

    ---
    Estimated minimum monthly cost for production-ready enterprise deployment: $3,000–$8,000/mo (excluding team
    salaries), scaling up with usage and customer count.