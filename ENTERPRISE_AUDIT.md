# KhushFus Enterprise Audit: Gap Analysis vs Industry Leaders

## Executive Summary

This audit compares KhushFus against Sprinklr, Brandwatch, Meltwater, Talkwalker, and YouScan
across architecture, features, data coverage, AI/NLP, compliance, and integrations. It identifies
what we're doing right, what's missing, and what needs upgrading to be enterprise-competitive.

---

## 1. ARCHITECTURE ASSESSMENT

### What We Have (Current)
- 18 microservices with Redis Streams event bus
- Async Python (FastAPI + asyncio)
- PostgreSQL + Elasticsearch + Redis
- Consumer groups for horizontal scaling
- Shared models/schemas/events layer

### Industry Best Practice
- Event-driven microservices with **Apache Kafka** (not Redis Streams) for production
- **CQRS** (Command Query Responsibility Segregation) pattern
- **Event Sourcing** for auditability and time-travel debugging
- **Dead Letter Queues (DLQ)** for failed event processing
- **Idempotent event processing** to avoid duplicate executions
- **Distributed tracing** (OpenTelemetry / Jaeger)
- **API Gateway** with proper service mesh (Istio/Envoy)
- Domain-Driven Design (DDD) for service boundaries

### GAP ANALYSIS

| Area | Current State | Enterprise Standard | Priority |
|------|--------------|-------------------|----------|
| Event Bus | Redis Streams | Apache Kafka | CRITICAL |
| Dead Letter Queues | None | Required for reliability | CRITICAL |
| Idempotency | Dedup by source_id only | Full idempotency keys on all events | HIGH |
| Event Sourcing | Not implemented | Needed for audit trail completeness | MEDIUM |
| CQRS | Partial (Query service separates reads) | Full CQRS pattern | MEDIUM |
| Distributed Tracing | None | OpenTelemetry + Jaeger/Zipkin | HIGH |
| Service Mesh | None | Istio/Envoy for mTLS, retries, circuit breaking | MEDIUM |
| API Gateway | Custom FastAPI gateway | Kong/Envoy/AWS API Gateway | MEDIUM |
| Circuit Breakers | None | Required for resilience | HIGH |
| Health Checks | Docker-level only | Liveness + Readiness probes + metrics | HIGH |
| Database Migrations | None (no Alembic) | Alembic with version-controlled migrations | CRITICAL |

### RECOMMENDATION
**Redis Streams is acceptable for MVP/startup phase** but Kafka is the industry standard for
social listening at scale. Sprinklr processes petabytes — Kafka handles millions of msgs/sec
vs Redis Streams' lower throughput ceiling. Plan a migration path. However, Redis Streams
with consumer groups is a valid choice for <100K mentions/day.

---

## 2. DATA SOURCES & COVERAGE

### Industry Benchmarks
| Platform | Sources | Data Volume |
|----------|---------|-------------|
| Sprinklr | 30+ channels, 1B+ websites, 400K+ media sources | Petabytes |
| Brandwatch | 100M unique sites, 1.7T historical conversations | 501M new/day |
| Talkwalker | 30+ social networks, 150M+ web sources | 5yr historical |
| Meltwater | 200B+ social conversations, 300M+ social profiles | Real-time |

### What We Have (11 Collectors)
Twitter, Facebook, Instagram, LinkedIn, YouTube, Reddit, News/RSS, GDELT, Telegram, Quora, WebScraper

### MISSING PLATFORMS (Critical Gaps)

| Missing Platform | Why It Matters | Priority |
|-----------------|----------------|----------|
| **TikTok** | Fastest growing platform, critical for brand monitoring | CRITICAL |
| **Pinterest** | Major visual discovery platform | HIGH |
| **Threads** | Meta's Twitter competitor, growing rapidly | HIGH |
| **Bluesky** | Decentralized social, tech-savvy audience | MEDIUM |
| **Snapchat** | Youth demographic, brand campaigns | MEDIUM |
| **WhatsApp Business** | Enterprise messaging, customer feedback | MEDIUM |
| **Discord** | Community monitoring, gaming/tech brands | HIGH |
| **Mastodon/Fediverse** | Decentralized social networks | LOW |
| **App Store Reviews** | Google Play + Apple App Store | HIGH |
| **Review Sites** | Trustpilot, G2, Capterra, Yelp, TripAdvisor | CRITICAL |
| **Podcast Transcripts** | Meltwater added this in 2025 | MEDIUM |
| **Print/Broadcast** | TV/Radio mentions via transcription services | LOW |
| **WeChat/Weibo** | Essential for China market | MEDIUM |
| **Little Red Book (Xiaohongshu)** | Chinese social commerce platform | LOW |

### MISSING CAPABILITIES
- **Firehose access** to major platforms (Twitter/X, Reddit) — requires enterprise API agreements
- **Historical data backfill** — Brandwatch offers data back to 2010
- **Web crawling at scale** — Current WebScraper is basic BeautifulSoup; need Scrapy/Playwright
- **RSS/Atom feed aggregation** — Current news collector is basic

### TARGET: 25+ platforms to match Sprinklr/Talkwalker's "30+ channels" claim

---

## 3. AI/NLP CAPABILITIES

### Industry State of the Art (2025-2026)
- **LLM-powered analysis** replacing traditional NLP (GPT-4, Claude for nuanced understanding)
- **Aspect-based sentiment** (not just positive/negative, but sentiment PER topic/aspect)
- **Sarcasm and irony detection** (major differentiator)
- **Multilingual support** (50+ languages out of the box)
- **Predictive analytics** — crisis prediction, trend forecasting (IDC: 55% YoY growth)
- **Visual AI** — Logo detection in images/video (YouScan, Talkwalker lead here)
- **GenAI summaries** — Auto-generated insight narratives (Meltwater's "Mira" AI)

### What We Have
- VADER sentiment (fast, English-only, basic)
- Optional HuggingFace RoBERTa (better accuracy, still limited)
- Basic language detection (langdetect)
- Keyword-based topic extraction (very basic)
- @mention and #hashtag entity extraction only (no NER)
- EasyOCR for image text extraction
- CLIP for logo detection (good choice)
- Whisper for audio transcription (good choice)

### GAP ANALYSIS

| NLP Capability | Current | Enterprise Standard | Priority |
|---------------|---------|-------------------|----------|
| Sentiment Model | VADER + RoBERTa | LLM-powered (Claude/GPT) + fine-tuned models | CRITICAL |
| Aspect-Based Sentiment | None | Required for enterprise reports | CRITICAL |
| Sarcasm Detection | None | Key differentiator (Brandwatch, Talkwalker) | HIGH |
| Named Entity Recognition | None (only @/# extraction) | spaCy/Flair NER for people, orgs, locations | CRITICAL |
| Multilingual | langdetect only | 50+ languages with per-language models | HIGH |
| Topic Modeling | Keyword matching | LDA/BERTopic for auto-discovered topics | HIGH |
| Intent Classification | None | Purchase intent, complaint, praise, question | HIGH |
| Emotion Detection | None | Beyond pos/neg: anger, joy, fear, surprise | MEDIUM |
| Trend Prediction | None | Time-series anomaly detection, forecasting | HIGH |
| AI Summaries | None | LLM-generated insight narratives per report | HIGH |
| Image Logo Detection | CLIP (good) | Production-grade, 1000+ brand logos | MEDIUM |
| Video Analysis | Whisper + keyframes | Real-time video monitoring | LOW |

### RECOMMENDATION
The biggest competitive gap is **LLM integration**. Meltwater has "Mira", Sprinklr has AI-powered
insights, Brand24 has AI summaries. We need an LLM layer (Claude API) that can:
1. Generate natural-language insight summaries
2. Perform aspect-based sentiment on complex text
3. Detect sarcasm, irony, cultural context
4. Auto-classify intent and emotion
5. Answer ad-hoc questions about mention data ("What are customers saying about our pricing?")

---

## 4. MULTI-TENANCY & DATA ISOLATION

### Industry Best Practice
- **Row-Level Security (RLS)** in PostgreSQL for bulletproof tenant isolation
- **Schema-per-tenant** for enterprise clients with compliance needs (GDPR, HIPAA)
- **Hybrid model** — shared pool for small tenants, dedicated schema for enterprise
- **Tenant-aware connection pooling**
- **Per-tenant encryption keys** for sensitive data
- **Data residency options** (EU, US, APAC regions)

### What We Have
- `organization_id` foreign key on Project model
- OrgMember with role-based access (5 roles)
- API key scoped per org
- Plan tiers with quotas (free/starter/professional/enterprise)

### GAPS

| Area | Current | Enterprise Standard | Priority |
|------|---------|-------------------|----------|
| Row-Level Security | None (app-level filtering only) | PostgreSQL RLS policies | CRITICAL |
| Data Residency | Single region | Multi-region deployment options | HIGH |
| Per-Tenant Encryption | None | Customer-managed encryption keys (CMEK) | MEDIUM |
| Tenant Isolation Testing | None | Automated tests verifying cross-tenant leaks | CRITICAL |
| Connection Pooling | Shared pool | PgBouncer with tenant-aware routing | MEDIUM |
| Resource Quotas | Plan-level quotas in code | Database-enforced + rate limiting | HIGH |

---

## 5. COMPLIANCE & SECURITY

### Industry Requirements
- **SOC 2 Type II** certification (table stakes for enterprise sales)
- **GDPR** compliance with right-to-be-forgotten, data portability, consent management
- **CCPA** compliance for California residents
- **ISO 27001** information security management
- **HIPAA** for healthcare clients
- **Penetration testing** reports
- **Data Processing Agreements (DPA)** templates

### What We Have
- Audit log storage and querying (audit service)
- GDPR export and right-to-be-forgotten (audit service)
- Data retention policies
- JWT authentication
- SSO (SAML + OIDC)

### GAPS

| Area | Current | Required | Priority |
|------|---------|----------|----------|
| Secrets Management | Hardcoded defaults, env vars | HashiCorp Vault / AWS Secrets Manager | CRITICAL |
| Input Validation | Pydantic schemas | + WAF, SQL injection protection, XSS prevention | HIGH |
| Rate Limiting at Gateway | Not integrated | Gateway-level rate limiting per API key | CRITICAL |
| Encryption at Rest | None | AES-256 for PII fields | HIGH |
| Encryption in Transit | None (http between services) | mTLS between all services | HIGH |
| CORS Configuration | Not configured | Strict CORS policies | HIGH |
| Security Headers | None | HSTS, CSP, X-Frame-Options | MEDIUM |
| Vulnerability Scanning | None | Snyk/Trivy in CI pipeline | HIGH |
| Consent Management | None | Cookie consent, data processing consent | MEDIUM |
| DPA Templates | None | Required for enterprise sales | MEDIUM |

---

## 6. INTEGRATIONS ECOSYSTEM

### Industry Standard (What Sprinklr/Brandwatch Offer)
- **CRM**: Salesforce, HubSpot, Microsoft Dynamics, Zoho
- **BI/Analytics**: Tableau, Power BI, Google Data Studio, Looker
- **Communication**: Slack, Microsoft Teams, Discord
- **Helpdesk**: Zendesk, Freshdesk, ServiceNow, Intercom
- **Marketing**: Hootsuite, Buffer, Marketo, Mailchimp
- **Storage**: Google Drive, Dropbox, OneDrive, S3
- **Automation**: Zapier, Make (Integromat), n8n
- **API**: REST API with webhooks, GraphQL API
- **SSO/Identity**: Okta, Auth0, Azure AD, OneLogin

### What We Have
- Export: Salesforce, HubSpot, Slack, Tableau, Webhook (stubs only)
- Notification: Slack webhook, custom webhook, email (stub)
- SSO: SAML, OIDC

### GAPS

| Integration | Current | Required | Priority |
|------------|---------|----------|----------|
| Salesforce | Stub | Full bi-directional sync | HIGH |
| HubSpot | Stub | Full bi-directional sync | HIGH |
| Slack | Webhook only | Full Slack app (slash commands, interactive) | HIGH |
| Microsoft Teams | None | Bot + connector | HIGH |
| Zendesk/Freshdesk | None | Ticket creation from mentions | HIGH |
| Zapier/Make | None | Generic webhook + Zapier app | CRITICAL |
| Power BI | None | Connector/embed | MEDIUM |
| Google Data Studio | None | Connector | MEDIUM |
| Webhooks (outbound) | Basic | Signed webhooks with retry + DLQ | HIGH |
| REST API Documentation | None | OpenAPI spec + developer portal | CRITICAL |
| GraphQL API | None | Increasingly expected by enterprise clients | MEDIUM |
| SDK/Client Libraries | None | Python, JS, Java SDKs | LOW |

---

## 7. FRONTEND & UX (Currently Missing)

### Industry Standard
- **Real-time dashboards** with customizable widgets
- **Interactive charts** (time series, word clouds, geo maps, network graphs)
- **Mention inbox** with triage/assign/respond workflow
- **Report builder** with drag-and-drop
- **White-labeling** for agency clients
- **Mobile app** (iOS + Android)
- **Embeddable widgets** for client websites
- **Dark mode**, accessibility (WCAG 2.1 AA)

### What We Have
- No frontend at all (empty `/frontend` directory)

### Priority: CRITICAL — A platform without a UI is not a product.

---

## 8. DEVOPS & OPERATIONS (Currently Missing)

### Industry Standard
- **Kubernetes** with auto-scaling (HPA/VPA)
- **CI/CD pipeline** (GitHub Actions / GitLab CI)
- **Infrastructure as Code** (Terraform / Pulumi)
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK stack or Loki
- **APM**: Datadog, New Relic, or open-source alternatives
- **Alerting**: PagerDuty, OpsGenie
- **Blue/green or canary deployments**
- **Database backup and disaster recovery**
- **Load testing** (k6, Locust)

### What We Have
- docker-compose.yml only (development)
- No CI/CD, no K8s, no monitoring, no alerting

### Priority: HIGH for production readiness

---

## 9. TESTING (Currently Minimal)

### Industry Standard
- **Unit tests**: 80%+ coverage on business logic
- **Integration tests**: Service-to-service communication
- **Contract tests**: Pact for API contracts between services
- **E2E tests**: Full pipeline from collection to notification
- **Load tests**: k6/Locust simulating peak traffic
- **Security tests**: OWASP ZAP, dependency scanning
- **Chaos engineering**: Service failure resilience

### What We Have
- 1 test file (test_nlp.py) with 6 tests
- No integration, contract, E2E, load, or security tests

### Priority: CRITICAL

---

## 10. INCOMPLETE IMPLEMENTATIONS

### Services with Stub/Pass Statements
| Service | Issue |
|---------|-------|
| Media Service | Multiple `pass` statements in handlers |
| Publishing Service | Platform API integration incomplete |
| Realtime Service | WebSocket handlers are stubs |
| Competitive Service | Benchmark logic is placeholder |
| Scheduler Service | Email and auto-reply are stubs |
| Notification Service | Email sending logs instead of sending |
| Export Service | Integration sync handlers incomplete |
| Project Service | Completely empty directory |

### Missing Files
- `services/report_service/templates/report.html` — Referenced but not created
- No `.env.example` documenting required variables
- No `alembic.ini` or migration scripts

---

## 11. WHAT WE'RE DOING RIGHT

| Area | Assessment |
|------|-----------|
| Microservices decomposition | Good — 18 services with clear boundaries |
| Event-driven architecture | Correct pattern for social listening |
| Redis Streams consumer groups | Good for horizontal scaling |
| Async Python (FastAPI) | Excellent choice for I/O-heavy workloads |
| Multi-tenant data model | Solid foundation with org/project hierarchy |
| RBAC (5 roles) | Matches enterprise needs |
| SSO (SAML + OIDC) | Enterprise requirement, correctly included |
| Elasticsearch for search | Industry standard, good choice |
| Platform collector abstraction | Clean BaseCollector pattern for extensibility |
| Audit logging | Required for compliance, correctly included |
| GDPR right-to-be-forgotten | Forward-thinking compliance feature |
| Whisper for audio | Best-in-class open-source speech-to-text |
| CLIP for logo detection | Good model choice |
| Shared schema layer | Prevents drift between services |
| Plan tiers with quotas | Correct monetization foundation |

---

## 12. PRIORITY ROADMAP

### P0 — Blockers for Any Enterprise Sale
1. Database migrations (Alembic) — cannot deploy without schema management
2. Row-Level Security in PostgreSQL — data isolation is non-negotiable
3. Frontend dashboard (React/Next.js) — no UI = no product
4. LLM integration for AI insights — table stakes in 2026
5. Complete stub implementations (publishing, realtime, media, etc.)
6. REST API documentation (OpenAPI) — required for developer onboarding
7. Secrets management — no hardcoded defaults in production
8. CI/CD pipeline — cannot deploy reliably without it
9. Testing infrastructure — at least integration tests for the data pipeline
10. Rate limiting integrated into gateway

### P1 — Required for Enterprise Competitiveness
1. Kafka migration (or prove Redis Streams handles your scale)
2. Add 10+ more data sources (TikTok, Discord, Reviews, App Stores, Threads)
3. Aspect-based sentiment + NER + emotion detection
4. Full Salesforce/HubSpot integration
5. Slack app + Microsoft Teams bot
6. Kubernetes deployment manifests
7. Monitoring (Prometheus + Grafana)
8. Distributed tracing (OpenTelemetry)
9. Multi-language NLP (50+ languages)
10. Zapier/webhook ecosystem

### P2 — Differentiation
1. Predictive analytics (crisis prediction, trend forecasting)
2. AI assistant (like Meltwater's "Mira") — conversational insights
3. Visual listening at scale (logo detection across millions of images)
4. Mobile app
5. White-label/agency mode
6. GraphQL API
7. Embeddable dashboard widgets
8. Advanced report builder (drag-and-drop)

---

## Sources

- [Meltwater: Brandwatch Alternatives 2026](https://www.meltwater.com/en/blog/best-brandwatch-alternatives)
- [Meltwater: Top Social Listening Tools 2026](https://www.meltwater.com/en/blog/top-social-listening-tools)
- [Sprinklr: Meltwater Alternatives](https://www.sprinklr.com/blog/meltwater-alternatives/)
- [Sprout Social: Sprinklr Alternatives 2026](https://sproutsocial.com/insights/sprinklr-alternatives/)
- [Brandwatch: Social Media Monitoring Tools](https://www.brandwatch.com/blog/social-media-monitoring-tools/)
- [Gartner: Meltwater vs Sprinklr](https://www.gartner.com/reviews/market/social-monitoring-and-analytics/compare/meltwater--vs-sprinklr)
- [Growin: Event Driven Architecture 2025](https://www.growin.com/blog/event-driven-architecture-scale-systems-2025/)
- [Confluent: Microservices Need Event-Driven](https://www.confluent.io/blog/do-microservices-need-event-driven-architectures/)
- [Better Stack: Redis vs Kafka 2026](https://betterstack.com/community/comparisons/redis-vs-kafka/)
- [AutoMQ: Kafka vs Redis Streams](https://www.automq.com/blog/apache-kafka-vs-redis-streams-differences-and-comparison)
- [Crunchy Data: PostgreSQL Multi-tenancy](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy)
- [AWS: Multi-tenant RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [YouScan: Visual Insights](https://youscan.io/visual-insights/)
- [Talkwalker: Image Recognition](https://www.talkwalker.com/image-recognition)
- [Pulsar: Top Social Listening 2026](https://www.pulsarplatform.com/blog/2025/best-social-listening-tools-2026)
- [Chattermill: Sentiment Analysis Tools 2026](https://chattermill.com/blog/ai-sentiment-analysis-tools)

---

## APPENDIX A: COMPETITOR DEEP-DIVE

### AI Engine Comparison

| Platform | AI Engine | Scale | Unique Capability |
|----------|-----------|-------|-------------------|
| Sprinklr | AI+ (9 layers of ML) | 10B predictions/day, 750+ models across 60 verticals | ASR, NLP, CV, network graph, anomaly, trends, predictive, NLG, similarity |
| Brandwatch | Iris AI | 501M new conversations/day | Emotion clustering beyond pos/neg (frustration, excitement) |
| Meltwater | Mira AI | 1B+ content pieces/day, 15B AI inferences/day | GenAI Lens — monitors brand perception INSIDE LLM responses (ChatGPT, etc.) |
| Talkwalker | Blue Silk AI | Trained on 3T+ data points | Custom LLMs for consumer intelligence; 187 language support |
| Synthesio | Signals GenAI | 800M+ sources, 195 countries | Ipsos research methodology + AI; auto-discovers statistically significant trends |
| **KhushFus** | **VADER + RoBERTa** | **Not benchmarked** | **None yet** |

### Compliance Certifications Comparison

| Cert | Sprinklr | Meltwater | KhushFus |
|------|----------|-----------|----------|
| SOC 1 Type II | Yes | - | No |
| SOC 2 Type II | Yes | - | No |
| ISO 27001 | Yes | Yes | No |
| ISO 42001 (AI) | - | Yes (industry first) | No |
| FedRAMP | Yes | - | No |
| PCI-DSS | Yes | - | No |
| GDPR | Yes | Yes | Partial (audit service) |

### Data Coverage Comparison

| Metric | Sprinklr | Brandwatch | Meltwater | KhushFus |
|--------|----------|------------|-----------|----------|
| Channels | 30+ | 100M sites | 6M+ sources | 11 collectors |
| Historical | Available | Back to 2010 | Available | None |
| Languages | Not disclosed | 27 | Multiple | 1 (English) |
| Real-time firehose | 10+ channels | X, Reddit, Tumblr | Yes | No |

### Integration Count Comparison

| Platform | Integrations |
|----------|-------------|
| Sprinklr | 70+ out-of-the-box connectors |
| Brandwatch | Cision ecosystem + APIs |
| Meltwater | API-first, BI/CRM integrations |
| Sprout Social | X, FB, IG, YT, LI, Bluesky, Yelp, Slack, Teams, Salesforce, Zendesk, Tableau |
| **KhushFus** | **5 stubs (Salesforce, HubSpot, Slack, Tableau, webhook)** |

---

## APPENDIX B: TECHNOLOGY BEST PRACTICES (2025-2026)

### Recommended Technology Stack (Industry Consensus)

| Component | Primary Recommendation | Our Current Choice | Gap? |
|-----------|----------------------|-------------------|------|
| Architecture | Event-driven microservices + CQRS | Event-driven microservices | Partial (no CQRS) |
| Event bus | Apache Kafka | Redis Streams | YES — migrate for scale |
| Stream processing | Apache Flink | None | YES |
| Search | OpenSearch (Apache 2.0 license) | Elasticsearch (AGPL) | LICENSING RISK for SaaS |
| Database | PostgreSQL with RLS | PostgreSQL (no RLS) | YES |
| Bulk NLP | Fine-tuned transformers (DeBERTa, GLiNER) | VADER + optional RoBERTa | YES |
| Advanced NLP | Claude/GPT-4 via API | None | YES — critical gap |
| Topic modeling | BERTopic | Keyword matching | YES |
| Data lake | Apache Iceberg on S3 | None | YES (for historical data) |
| Public API | REST with OpenAPI 3.1 spec | REST (no spec) | YES |
| Internal comms | gRPC | HTTP between services | MEDIUM priority |
| Frontend API | GraphQL | None (no frontend) | YES |
| Multi-tenancy | Shared schema + RLS + DB-per-tenant option | Shared schema (app-level only) | YES |

### NLP Model Benchmarks (2025)

| Model | Sentiment Accuracy | Cost per 100K mentions | Latency |
|-------|-------------------|----------------------|---------|
| VADER | ~65% (English only) | Free | <1ms |
| RoBERTa fine-tuned | ~85% | Free (self-hosted GPU) | ~50ms |
| Claude 3.7 | ~79% (best overall) | ~$50-100 | ~500ms |
| GPT-4 | ~83% F1 | ~$80-150 | ~800ms |
| DeBERTa fine-tuned | ~87% | Free (self-hosted GPU) | ~60ms |

**Recommended hybrid**: DeBERTa for bulk classification + Claude API for summaries/insights/complex cases.

### Event Bus Decision Matrix

| Factor | Redis Streams | Kafka | Pulsar |
|--------|--------------|-------|--------|
| Throughput | ~100K msg/s | Millions msg/s | ~500K msg/s |
| Durability | Memory (risk of loss) | Disk (persistent) | BookKeeper (persistent) |
| Partitioning | No native partitions | Topic partitions | Built-in |
| Multi-tenancy | Not designed for it | Requires config | Native support |
| Ops complexity | Low | High | Moderate |
| Ecosystem | Redis only | Massive (Connect, Streams, ksqlDB) | Growing |
| **Verdict** | OK for MVP (<100K/day) | **Production standard** | Alternative to Kafka |

### Elasticsearch AGPL License Warning

Elasticsearch switched to AGPL in 2024. For a SaaS product like KhushFus:
- AGPL requires source code disclosure if users interact with the software over a network
- This could force open-sourcing our platform code, OR require purchasing an Elastic license
- **OpenSearch (Apache 2.0)** is the safer choice for SaaS — functionally equivalent, no license risk
- Amazon OpenSearch Service provides managed hosting

### Multi-Tenancy: PostgreSQL RLS Implementation Pattern

```sql
-- Example: Row-Level Security for tenant isolation
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (organization_id = current_setting('app.current_org_id')::int);

-- Set per-request in application:
SET LOCAL app.current_org_id = '42';
SELECT * FROM projects; -- Only sees org 42's projects
```

This is database-enforced isolation — even if application code has bugs, data cannot leak across tenants.
