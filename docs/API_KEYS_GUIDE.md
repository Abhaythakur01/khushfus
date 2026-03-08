# KhushFus API Keys & Integration Guide

Complete reference for all API keys, platform credentials, and service integrations required to run KhushFus at enterprise scale.

---

## Table of Contents

1. [Quick Start (Minimum Viable)](#1-quick-start-minimum-viable)
2. [Infrastructure (No External Keys)](#2-infrastructure-no-external-keys)
3. [Social & Messaging Platforms](#3-social--messaging-platforms)
4. [Review & Reputation Sites](#4-review--reputation-sites)
5. [Forums & Communities](#5-forums--communities)
6. [News & Media Intelligence](#6-news--media-intelligence)
7. [AI / NLP / Enrichment](#7-ai--nlp--enrichment)
8. [Translation & Localization](#8-translation--localization)
9. [CRM & Helpdesk](#9-crm--helpdesk)
10. [Marketing Automation & Email](#10-marketing-automation--email)
11. [Project Management & Collaboration](#11-project-management--collaboration)
12. [Analytics & Product Analytics](#12-analytics--product-analytics)
13. [Data Warehouses & BI Tools](#13-data-warehouses--bi-tools)
14. [Cloud Storage & File Export](#14-cloud-storage--file-export)
15. [Notification & Communication](#15-notification--communication)
16. [Advertising Platforms](#16-advertising-platforms)
17. [Workflow Automation & iPaaS](#17-workflow-automation--ipaas)
18. [Compliance, Security & Identity](#18-compliance-security--identity)
19. [Monitoring & Observability](#19-monitoring--observability)

---

## 1. Quick Start (Minimum Viable)

To get KhushFus running with basic functionality, you only need:

| Key | Purpose | Get It From |
|-----|---------|-------------|
| `ANTHROPIC_API_KEY` | AI-powered sentiment analysis & LLM insights | https://console.anthropic.com |
| 1-2 platform keys (e.g., Twitter) | Data collection | See Section 3 |

Everything else has sensible defaults or can be added incrementally.

---

## 2. Infrastructure (No External Keys)

These are handled by Docker Compose — no external API keys needed:

| Variable | Default Value | Notes |
|----------|---------------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://khushfus:khushfus_dev@localhost:5432/khushfus` | Postgres (Docker) |
| `DATABASE_URL_SYNC` | `postgresql://khushfus:khushfus_dev@localhost:5432/khushfus` | Alembic migrations |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis Streams event bus |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Full-text search |
| `SECRET_KEY` | `change-me-in-production` | App secret (change for prod) |
| `JWT_SECRET_KEY` | `change-me-in-production` | JWT signing (change for prod) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | JWT access token TTL |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | JWT refresh token TTL |
| `ENVIRONMENT` | `development` | `development` / `staging` / `production` |
| `LOG_LEVEL` | `INFO` | Python log level |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://jaeger:4317` | Distributed tracing |
| `RATE_LIMITER_URL` | `http://rate-limiter:8014` | Internal rate limiter |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Requests per window |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate limit window |
| `COLLECTION_INTERVAL` | `3600` | Collector cycle (seconds) |
| `SCHEDULER_INTERVAL_SECONDS` | `60` | Scheduler tick |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Frontend → Gateway URL |

---

## 3. Social & Messaging Platforms

### Currently Implemented

#### Twitter / X
| Variable | Required | Get From |
|----------|----------|----------|
| `TWITTER_BEARER_TOKEN` | Yes (for reading) | https://developer.x.com |
| `TWITTER_API_KEY` | For posting | Same portal |
| `TWITTER_API_SECRET` | For posting | Same portal |
| `TWITTER_ACCESS_TOKEN` | For posting | Same portal |
| `TWITTER_ACCESS_SECRET` | For posting | Same portal |

> **Pricing**: Free (Basic: 100 tweets/mo read), $100/mo (Pro: 1M tweets/mo), $5,000/mo (Enterprise)

#### Facebook
| Variable | Required | Get From |
|----------|----------|----------|
| `FACEBOOK_APP_ID` | Yes | https://developers.facebook.com |
| `FACEBOOK_APP_SECRET` | Yes | Same portal |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Yes | Same portal |
| `FACEBOOK_PAGE_ID` | For publishing | Same portal |

> **Pricing**: Free (Graph API), rate-limited

#### Instagram
| Variable | Required | Get From |
|----------|----------|----------|
| `INSTAGRAM_ACCESS_TOKEN` | Yes | https://developers.facebook.com (Instagram Graph API) |
| `INSTAGRAM_USER_ID` | Yes | Same portal |

> **Pricing**: Free via Facebook Graph API

#### LinkedIn
| Variable | Required | Get From |
|----------|----------|----------|
| `LINKEDIN_CLIENT_ID` | Yes | https://www.linkedin.com/developers/ |
| `LINKEDIN_CLIENT_SECRET` | Yes | Same portal |
| `LINKEDIN_ACCESS_TOKEN` | Yes | Same portal |
| `LINKEDIN_AUTHOR_URN` | For publishing | Same portal |

> **Pricing**: Free (Community Management API), Paid (Marketing API)

#### YouTube
| Variable | Required | Get From |
|----------|----------|----------|
| `YOUTUBE_API_KEY` | Yes | https://console.cloud.google.com → YouTube Data API v3 |

> **Pricing**: Free (10,000 units/day)

#### Reddit
No API key required in current implementation (uses public API).

#### TikTok
| Variable | Required | Get From |
|----------|----------|----------|
| `TIKTOK_ACCESS_TOKEN` | Yes | https://developers.tiktok.com |

> **Pricing**: Free (Research API), Paid (Commercial API)

#### Discord
| Variable | Required | Get From |
|----------|----------|----------|
| `DISCORD_BOT_TOKEN` | Yes | https://discord.com/developers/applications |
| `DISCORD_CHANNEL_IDS` | Yes | Right-click channel → Copy ID |

> **Pricing**: Free

#### Bluesky
| Variable | Required | Get From |
|----------|----------|----------|
| `BLUESKY_HANDLE` | Yes | Your Bluesky handle (e.g., `user.bsky.social`) |
| `BLUESKY_APP_PASSWORD` | Yes | Bluesky Settings → App Passwords |

> **Pricing**: Free (AT Protocol)

#### Pinterest
| Variable | Required | Get From |
|----------|----------|----------|
| `PINTEREST_ACCESS_TOKEN` | Yes | https://developers.pinterest.com |

> **Pricing**: Free

#### Mastodon
| Variable | Required | Get From |
|----------|----------|----------|
| `MASTODON_ACCESS_TOKEN` | Yes | Your instance → Settings → Development |
| `MASTODON_INSTANCE_URL` | Yes | Default: `https://mastodon.social` |

> **Pricing**: Free (open-source, federated)

#### Telegram
| Variable | Required | Get From |
|----------|----------|----------|
| `TELEGRAM_CHANNELS` | Yes | Public channel names (comma-separated) |

> **Pricing**: Free (public channels only — no API key needed)

#### Threads
| Variable | Required | Get From |
|----------|----------|----------|
| `THREADS_ACCESS_TOKEN` | Yes | https://developers.facebook.com (Threads API) |
| `THREADS_USER_IDS` | Optional | Default: `me` |

> **Pricing**: Free

### Planned — Regional Platforms

#### Slack (Monitoring + Notifications)
| Variable | Required | Get From |
|----------|----------|----------|
| `SLACK_BOT_TOKEN` | Yes | https://api.slack.com/apps |
| `SLACK_APP_ID` | Yes | Same portal |
| `SLACK_CLIENT_SECRET` | Yes | Same portal |
| `SLACK_WEBHOOK_URL` | For alerts | Same portal → Incoming Webhooks |

> **Pricing**: Free tier available

#### Microsoft Teams
| Variable | Required | Get From |
|----------|----------|----------|
| `MICROSOFT_TEAMS_APP_ID` | Yes | https://portal.azure.com → App registrations |
| `MICROSOFT_TEAMS_APP_SECRET` | Yes | Same portal |
| `MICROSOFT_TENANT_ID` | Yes | Same portal |
| `TEAMS_WEBHOOK_URL` | For alerts | Teams → Connectors → Incoming Webhook |

> **Pricing**: Requires Microsoft 365 license

#### WhatsApp Business
| Variable | Required | Get From |
|----------|----------|----------|
| `WHATSAPP_BUSINESS_API_TOKEN` | Yes | https://developers.facebook.com → WhatsApp |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | Same portal |

> **Pricing**: Paid (per-conversation pricing)

#### Snapchat
| Variable | Required | Get From |
|----------|----------|----------|
| `SNAPCHAT_CLIENT_ID` | Yes | https://business.snapchat.com/portal |
| `SNAPCHAT_CLIENT_SECRET` | Yes | Same portal |

> **Pricing**: Free (limited)

#### Twitch
| Variable | Required | Get From |
|----------|----------|----------|
| `TWITCH_CLIENT_ID` | Yes | https://dev.twitch.tv/console/apps |
| `TWITCH_CLIENT_SECRET` | Yes | Same portal |

> **Pricing**: Free

#### VK (VKontakte) — Russia/CIS
| Variable | Required | Get From |
|----------|----------|----------|
| `VK_ACCESS_TOKEN` | Yes | https://vk.com/dev → My Apps |
| `VK_APP_ID` | Yes | Same portal |

> **Pricing**: Free

#### Sina Weibo — China
| Variable | Required | Get From |
|----------|----------|----------|
| `WEIBO_APP_KEY` | Yes | https://open.weibo.com/developers |
| `WEIBO_APP_SECRET` | Yes | Same portal |

> **Pricing**: Free

#### WeChat — China
| Variable | Required | Get From |
|----------|----------|----------|
| `WECHAT_APP_ID` | Yes | https://open.weixin.qq.com |
| `WECHAT_APP_SECRET` | Yes | Same portal |

> **Pricing**: Requires verified business account (paid)

#### LINE — Japan/Thailand/Taiwan
| Variable | Required | Get From |
|----------|----------|----------|
| `LINE_CHANNEL_ACCESS_TOKEN` | Yes | https://developers.line.biz/console/ |
| `LINE_CHANNEL_SECRET` | Yes | Same portal |

> **Pricing**: Free tier available

#### KakaoTalk — South Korea
| Variable | Required | Get From |
|----------|----------|----------|
| `KAKAO_REST_API_KEY` | Yes | https://developers.kakao.com/console/app |
| `KAKAO_CLIENT_SECRET` | Yes | Same portal |

> **Pricing**: Free

#### Viber — Eastern Europe/SE Asia
| Variable | Required | Get From |
|----------|----------|----------|
| `VIBER_AUTH_TOKEN` | Yes | https://partners.viber.com/ |

> **Pricing**: Free

#### Xiaohongshu (RED) — China
| Variable | Required | Get From |
|----------|----------|----------|
| `XIAOHONGSHU_APP_KEY` | Yes | https://open.xiaohongshu.com |
| `XIAOHONGSHU_APP_SECRET` | Yes | Same portal |

> **Pricing**: Paid (business account)

#### Dailymotion
| Variable | Required | Get From |
|----------|----------|----------|
| `DAILYMOTION_API_KEY` | Yes | https://www.dailymotion.com/partner |
| `DAILYMOTION_API_SECRET` | Yes | Same portal |

> **Pricing**: Free

#### Vimeo
| Variable | Required | Get From |
|----------|----------|----------|
| `VIMEO_ACCESS_TOKEN` | Yes | https://developer.vimeo.com/apps |
| `VIMEO_CLIENT_ID` | Yes | Same portal |

> **Pricing**: Free tier available

---

## 4. Review & Reputation Sites

### Currently Implemented

#### Trustpilot
| Variable | Required | Get From |
|----------|----------|----------|
| `TRUSTPILOT_API_KEY` | Yes | https://developers.trustpilot.com/ |
| `TRUSTPILOT_BUSINESS_IDS` | Yes | Your Trustpilot business profile |

> **Pricing**: Paid (Business API)

#### Yelp
| Variable | Required | Get From |
|----------|----------|----------|
| `YELP_API_KEY` | Yes | https://fusion.yelp.com |
| `YELP_BUSINESS_IDS` | Yes | Yelp business URLs |

> **Pricing**: Free (5,000 API calls/day)

#### G2
| Variable | Required | Get From |
|----------|----------|----------|
| `G2_PRODUCT_URLS` | Yes | Public G2 product page URLs |

> **Pricing**: Free (scraping public pages)

#### App Store / Google Play
| Variable | Required | Get From |
|----------|----------|----------|
| `APPLE_APP_IDS` | Yes | iTunes app IDs |
| `PLAY_STORE_PACKAGES` | Yes | Package names (e.g., `com.example.app`) |
| `APPSTORE_COUNTRY` | Optional | Default: `us` |

> **Pricing**: Free (public data)

### Planned

#### Glassdoor — Employer Brand
| Variable | Required | Get From |
|----------|----------|----------|
| `GLASSDOOR_PARTNER_KEY` | Yes | https://www.glassdoor.com/developer/ |
| `GLASSDOOR_PARTNER_ID` | Yes | Same (partner program) |

> **Pricing**: Paid (partner program)

#### Amazon Product Reviews
| Variable | Required | Get From |
|----------|----------|----------|
| `AMAZON_PRODUCT_API_KEY` | Yes | https://affiliate-program.amazon.com |
| `AMAZON_PRODUCT_API_SECRET` | Yes | Same portal |
| `AMAZON_ASSOCIATE_TAG` | Yes | Associates program |

> **Pricing**: Free (Associates program required)

#### Google Business Profile
| Variable | Required | Get From |
|----------|----------|----------|
| `GOOGLE_BUSINESS_API_KEY` | Yes | https://console.cloud.google.com → Business Profile API |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yes | Same portal → Service Accounts |

> **Pricing**: Free

#### Capterra — B2B Software Reviews
| Variable | Required | Get From |
|----------|----------|----------|
| `CAPTERRA_API_KEY` | Yes | https://www.capterra.com/developers |

> **Pricing**: Paid

#### TripAdvisor — Hospitality/Travel
| Variable | Required | Get From |
|----------|----------|----------|
| `TRIPADVISOR_API_KEY` | Yes | https://developer-tripadvisor.com/content-api/ |

> **Pricing**: Paid (partner)

#### Bazaarvoice — UGC Reviews
| Variable | Required | Get From |
|----------|----------|----------|
| `BAZAARVOICE_API_KEY` | Yes | https://developer.bazaarvoice.com/ |
| `BAZAARVOICE_PASSKEY` | Yes | Same portal |

> **Pricing**: Paid

#### Gartner Peer Insights
| Variable | Required | Get From |
|----------|----------|----------|
| `GARTNER_PEER_INSIGHTS_API_KEY` | Yes | Gartner partner portal |

> **Pricing**: Paid (enterprise)

---

## 5. Forums & Communities

#### Disqus — Blog Comment Monitoring
| Variable | Required | Get From |
|----------|----------|----------|
| `DISQUS_API_KEY` | Yes | https://disqus.com/api/applications/ |
| `DISQUS_API_SECRET` | Yes | Same portal |

> **Pricing**: Free

#### Stack Overflow / Stack Exchange
| Variable | Required | Get From |
|----------|----------|----------|
| `STACKEXCHANGE_API_KEY` | Yes | https://stackapps.com/apps/oauth/register |

> **Pricing**: Free (10,000 requests/day)

#### Hacker News
No API key needed — public API at https://github.com/HackerNews/API

> **Pricing**: Free

#### Product Hunt
| Variable | Required | Get From |
|----------|----------|----------|
| `PRODUCTHUNT_API_TOKEN` | Yes | https://api.producthunt.com/v2/docs |

> **Pricing**: Free

#### Web Scraper (Generic)
| Variable | Required | Get From |
|----------|----------|----------|
| `SCRAPER_TARGET_URLS` | Yes | URLs to monitor (comma-separated) |

> **Pricing**: Free (built-in)

---

## 6. News & Media Intelligence

### Currently Implemented

#### NewsAPI
| Variable | Required | Get From |
|----------|----------|----------|
| `NEWS_API_KEY` | Yes | https://newsapi.org/register |

> **Pricing**: Free (dev: 100 requests/day), $449/mo (Business)

#### GDELT
| Variable | Required | Get From |
|----------|----------|----------|
| `GDELT_ENABLED` | Optional | Default: `true` |

> **Pricing**: Free (no key needed)

### Planned

#### Bing News Search
| Variable | Required | Get From |
|----------|----------|----------|
| `BING_NEWS_API_KEY` | Yes | https://portal.azure.com → Cognitive Services |

> **Pricing**: Paid ($7/1,000 transactions)

#### Google Custom Search (News)
| Variable | Required | Get From |
|----------|----------|----------|
| `GOOGLE_CUSTOM_SEARCH_API_KEY` | Yes | https://console.cloud.google.com → Custom Search JSON API |
| `GOOGLE_SEARCH_ENGINE_ID` | Yes | https://programmablesearchengine.google.com/ |

> **Pricing**: Free (100 queries/day), $5/1,000 queries after

#### LexisNexis — Premium News/Legal
| Variable | Required | Get From |
|----------|----------|----------|
| `LEXISNEXIS_API_KEY` | Yes | https://developer.lexisnexis.com/ |
| `LEXISNEXIS_API_SECRET` | Yes | Same portal |

> **Pricing**: Paid (enterprise contract)

#### Dow Jones Factiva — Financial News
| Variable | Required | Get From |
|----------|----------|----------|
| `FACTIVA_CLIENT_ID` | Yes | https://developer.dowjones.com/ |
| `FACTIVA_PASSWORD` | Yes | Same portal |

> **Pricing**: Paid (enterprise contract)

#### Moreover / Barkley — Licensed News Feeds
| Variable | Required | Get From |
|----------|----------|----------|
| `MOREOVER_API_KEY` | Yes | https://moreover.com/ |

> **Pricing**: Paid (enterprise)

#### TVEyes — TV/Radio Broadcast Monitoring
| Variable | Required | Get From |
|----------|----------|----------|
| `TVEYES_API_KEY` | Yes | https://tveyes.com/ |

> **Pricing**: Paid (enterprise)

---

## 7. AI / NLP / Enrichment

### Currently Implemented

#### Anthropic Claude (Primary)
| Variable | Required | Get From |
|----------|----------|----------|
| `ANTHROPIC_API_KEY` | Recommended | https://console.anthropic.com |
| `SENTIMENT_MODEL` | Optional | `hybrid` (default), `vader`, `deberta`, `claude` |
| `USE_GPU` | Optional | Default: `false` |
| `ANALYZER_BATCH_SIZE` | Optional | Default: `20` |
| `HIGH_ENGAGEMENT_THRESHOLD` | Optional | Default: `100` |

> **Pricing**: Paid per token. ~$15/M input, ~$75/M output (Claude Sonnet)
> NLP works without it (VADER + DeBERTa fallback), but loses premium tier-3 analysis.

### Planned — Alternative/Supplementary AI

#### OpenAI GPT
| Variable | Required | Get From |
|----------|----------|----------|
| `OPENAI_API_KEY` | Optional | https://platform.openai.com/api-keys |

> **Pricing**: Paid per token. ~$2.50/M input (GPT-4o)

#### Google Gemini
| Variable | Required | Get From |
|----------|----------|----------|
| `GOOGLE_GEMINI_API_KEY` | Optional | https://aistudio.google.com/app/apikey |

> **Pricing**: Free tier (15 RPM), then paid

#### Google Cloud Natural Language
| Variable | Required | Get From |
|----------|----------|----------|
| `GOOGLE_CLOUD_NLP_API_KEY` | Optional | https://console.cloud.google.com → Natural Language API |

> **Pricing**: Free (5K units/mo), then $1/1,000 records

#### AWS Comprehend
| Variable | Required | Get From |
|----------|----------|----------|
| `AWS_COMPREHEND_ACCESS_KEY` | Optional | https://console.aws.amazon.com → IAM |
| `AWS_COMPREHEND_SECRET_KEY` | Optional | Same portal |
| `AWS_COMPREHEND_REGION` | Optional | Default: `us-east-1` |

> **Pricing**: $0.0001 per unit (100 chars)

#### Azure AI Language
| Variable | Required | Get From |
|----------|----------|----------|
| `AZURE_LANGUAGE_KEY` | Optional | https://portal.azure.com → Cognitive Services |
| `AZURE_LANGUAGE_ENDPOINT` | Optional | Same portal |

> **Pricing**: Free (5K transactions/mo), then paid

#### IBM Watson NLU
| Variable | Required | Get From |
|----------|----------|----------|
| `IBM_WATSON_API_KEY` | Optional | https://cloud.ibm.com/catalog/services/natural-language-understanding |
| `IBM_WATSON_URL` | Optional | Same portal |

> **Pricing**: Free tier, then $3/1,000 items

#### Cohere — Embeddings & Classification
| Variable | Required | Get From |
|----------|----------|----------|
| `COHERE_API_KEY` | Optional | https://dashboard.cohere.com/api-keys |

> **Pricing**: Free (trial), then paid

#### Hugging Face — Open-Source Models
| Variable | Required | Get From |
|----------|----------|----------|
| `HUGGINGFACE_API_TOKEN` | Optional | https://huggingface.co/settings/tokens |

> **Pricing**: Free tier, paid for dedicated inference

#### Google Cloud Vision — Image Analysis
| Variable | Required | Get From |
|----------|----------|----------|
| `GOOGLE_VISION_API_KEY` | Optional | https://console.cloud.google.com → Vision API |

> **Pricing**: Free (1K units/mo), then $1.50/1,000 images

#### AWS Rekognition — Image/Video Analysis
| Variable | Required | Get From |
|----------|----------|----------|
| `AWS_REKOGNITION_ACCESS_KEY` | Optional | https://console.aws.amazon.com → IAM |
| `AWS_REKOGNITION_SECRET_KEY` | Optional | Same portal |

> **Pricing**: Free tier (5K images/mo), then $1/1,000 images

#### Clarifai — Visual AI
| Variable | Required | Get From |
|----------|----------|----------|
| `CLARIFAI_PAT` | Optional | https://clarifai.com/settings/security |

> **Pricing**: Free tier, then paid

#### Perspective API (Google/Jigsaw) — Toxicity Detection
| Variable | Required | Get From |
|----------|----------|----------|
| `PERSPECTIVE_API_KEY` | Optional | https://developers.perspectiveapi.com/ |

> **Pricing**: Free

#### AssemblyAI — Audio Transcription
| Variable | Required | Get From |
|----------|----------|----------|
| `ASSEMBLYAI_API_KEY` | Optional | https://www.assemblyai.com/app |

> **Pricing**: $0.37/hour

#### Deepgram — Speech-to-Text
| Variable | Required | Get From |
|----------|----------|----------|
| `DEEPGRAM_API_KEY` | Optional | https://console.deepgram.com/ |

> **Pricing**: Free ($200 credit), then $0.0043/min

#### EdenAI — Unified AI API (100+ Providers)
| Variable | Required | Get From |
|----------|----------|----------|
| `EDENAI_API_KEY` | Optional | https://www.edenai.co/ |

> **Pricing**: Free tier available

---

## 8. Translation & Localization

#### Google Translate
| Variable | Required | Get From |
|----------|----------|----------|
| `GOOGLE_TRANSLATE_API_KEY` | Optional | https://console.cloud.google.com → Cloud Translation API |

> **Pricing**: $20/million characters

#### DeepL — Higher-Quality European Translation
| Variable | Required | Get From |
|----------|----------|----------|
| `DEEPL_API_KEY` | Optional | https://www.deepl.com/pro-api |

> **Pricing**: Free (500K chars/mo), then $25/month + usage

#### Azure Translator
| Variable | Required | Get From |
|----------|----------|----------|
| `AZURE_TRANSLATOR_KEY` | Optional | https://portal.azure.com → Translator |
| `AZURE_TRANSLATOR_REGION` | Optional | Same portal |

> **Pricing**: Free (2M chars/mo), then $10/M characters

---

## 9. CRM & Helpdesk

### Currently Implemented

#### Salesforce
| Variable | Required | Get From |
|----------|----------|----------|
| `SALESFORCE_INSTANCE_URL` | Yes | Your Salesforce instance |
| `SALESFORCE_ACCESS_TOKEN` | Yes | Salesforce Setup → Connected Apps |

> **Pricing**: Included with Salesforce license

#### HubSpot
| Variable | Required | Get From |
|----------|----------|----------|
| `HUBSPOT_API_KEY` | Yes | https://app.hubspot.com/settings → Integrations → API key |

> **Pricing**: Free (CRM), Paid (Marketing Hub)

### Planned

#### Zendesk
| Variable | Required | Get From |
|----------|----------|----------|
| `ZENDESK_SUBDOMAIN` | Yes | Your Zendesk subdomain |
| `ZENDESK_API_TOKEN` | Yes | Admin → Channels → API |
| `ZENDESK_EMAIL` | Yes | Admin email |

> **Pricing**: Included with Zendesk license

#### Freshdesk
| Variable | Required | Get From |
|----------|----------|----------|
| `FRESHDESK_DOMAIN` | Yes | Your Freshdesk domain |
| `FRESHDESK_API_KEY` | Yes | Profile → Your API Key |

> **Pricing**: Included with Freshdesk license

#### Intercom
| Variable | Required | Get From |
|----------|----------|----------|
| `INTERCOM_ACCESS_TOKEN` | Yes | https://developers.intercom.com/ |

> **Pricing**: Included with Intercom license

#### ServiceNow
| Variable | Required | Get From |
|----------|----------|----------|
| `SERVICENOW_INSTANCE` | Yes | Your instance URL |
| `SERVICENOW_CLIENT_ID` | Yes | System OAuth → Application Registry |
| `SERVICENOW_CLIENT_SECRET` | Yes | Same |

> **Pricing**: Enterprise contract

#### Zoho CRM
| Variable | Required | Get From |
|----------|----------|----------|
| `ZOHO_CLIENT_ID` | Yes | https://api-console.zoho.com/ |
| `ZOHO_CLIENT_SECRET` | Yes | Same portal |
| `ZOHO_REFRESH_TOKEN` | Yes | OAuth flow |

> **Pricing**: Free (3 users), Paid ($14/user/mo+)

#### Microsoft Dynamics 365
| Variable | Required | Get From |
|----------|----------|----------|
| `DYNAMICS365_CLIENT_ID` | Yes | https://portal.azure.com → App registrations |
| `DYNAMICS365_CLIENT_SECRET` | Yes | Same portal |
| `DYNAMICS365_TENANT_ID` | Yes | Same portal |

> **Pricing**: Enterprise contract

#### Pipedrive
| Variable | Required | Get From |
|----------|----------|----------|
| `PIPEDRIVE_API_TOKEN` | Yes | Settings → Personal preferences → API |

> **Pricing**: Paid ($14.90/user/mo+)

---

## 10. Marketing Automation & Email

### SMTP (Currently Implemented)

| Variable | Required | Get From |
|----------|----------|----------|
| `SMTP_HOST` | Yes | Default: `smtp.gmail.com` |
| `SMTP_PORT` | Yes | Default: `587` |
| `SMTP_USER` | Yes | Your email |
| `SMTP_PASSWORD` | Yes | App-specific password |
| `SMTP_FROM` | Yes | Default: `alerts@khushfus.com` |

### Planned — Transactional Email Services

#### SendGrid
| Variable | Required | Get From |
|----------|----------|----------|
| `SENDGRID_API_KEY` | Optional | https://app.sendgrid.com/settings/api_keys |

> **Pricing**: Free (100 emails/day), Paid ($19.95/mo+)

#### Amazon SES
| Variable | Required | Get From |
|----------|----------|----------|
| `AWS_SES_ACCESS_KEY` | Optional | https://console.aws.amazon.com → IAM |
| `AWS_SES_SECRET_KEY` | Optional | Same |
| `AWS_SES_REGION` | Optional | Default: `us-east-1` |

> **Pricing**: $0.10/1,000 emails

#### Postmark
| Variable | Required | Get From |
|----------|----------|----------|
| `POSTMARK_SERVER_TOKEN` | Optional | https://account.postmarkapp.com/servers |

> **Pricing**: $15/mo (10K emails)

### Planned — Marketing Automation

#### Marketo (Adobe)
| Variable | Required | Get From |
|----------|----------|----------|
| `MARKETO_CLIENT_ID` | Yes | https://developers.marketo.com/ |
| `MARKETO_CLIENT_SECRET` | Yes | Same |
| `MARKETO_BASE_URL` | Yes | Your Marketo instance |

> **Pricing**: Enterprise contract

#### Eloqua (Oracle)
| Variable | Required | Get From |
|----------|----------|----------|
| `ELOQUA_CLIENT_ID` | Yes | https://docs.oracle.com/en/cloud/saas/marketing/eloqua-rest-api/ |
| `ELOQUA_CLIENT_SECRET` | Yes | Same |
| `ELOQUA_BASE_URL` | Yes | Your instance |

> **Pricing**: Enterprise contract

#### Mailchimp
| Variable | Required | Get From |
|----------|----------|----------|
| `MAILCHIMP_API_KEY` | Optional | https://mailchimp.com/developer/ |

> **Pricing**: Free (500 contacts), Paid ($13/mo+)

---

## 11. Project Management & Collaboration

#### Jira
| Variable | Required | Get From |
|----------|----------|----------|
| `JIRA_BASE_URL` | Yes | Your Jira instance URL |
| `JIRA_EMAIL` | Yes | Your Atlassian email |
| `JIRA_API_TOKEN` | Yes | https://id.atlassian.com/manage-profile/security/api-tokens |

> **Pricing**: Free (10 users), Paid ($7.75/user/mo+)

#### Confluence
| Variable | Required | Get From |
|----------|----------|----------|
| `CONFLUENCE_BASE_URL` | Yes | Your Confluence URL |
| `CONFLUENCE_API_TOKEN` | Yes | Same as Jira token |

> **Pricing**: Free (10 users), Paid ($5.75/user/mo+)

#### Asana
| Variable | Required | Get From |
|----------|----------|----------|
| `ASANA_ACCESS_TOKEN` | Yes | https://app.asana.com/0/developer-console |

> **Pricing**: Free (basic), Paid ($10.99/user/mo+)

#### Notion
| Variable | Required | Get From |
|----------|----------|----------|
| `NOTION_API_KEY` | Yes | https://www.notion.so/my-integrations |

> **Pricing**: Free (personal), Paid ($10/user/mo+)

#### Monday.com
| Variable | Required | Get From |
|----------|----------|----------|
| `MONDAY_API_TOKEN` | Yes | https://developer.monday.com/ |

> **Pricing**: Paid ($9/seat/mo+)

#### Linear
| Variable | Required | Get From |
|----------|----------|----------|
| `LINEAR_API_KEY` | Yes | https://linear.app/settings/api |

> **Pricing**: Free (basic), Paid ($8/user/mo)

#### Trello
| Variable | Required | Get From |
|----------|----------|----------|
| `TRELLO_API_KEY` | Yes | https://trello.com/app-key |
| `TRELLO_TOKEN` | Yes | Same page |

> **Pricing**: Free (basic), Paid ($5/user/mo+)

---

## 12. Analytics & Product Analytics

#### Google Analytics 4
| Variable | Required | Get From |
|----------|----------|----------|
| `GOOGLE_ANALYTICS_PROPERTY_ID` | Yes | GA4 Admin → Property Settings |
| `GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON` | Yes | https://console.cloud.google.com → Analytics Data API |

> **Pricing**: Free

#### Adobe Analytics
| Variable | Required | Get From |
|----------|----------|----------|
| `ADOBE_CLIENT_ID` | Yes | https://developer.adobe.com/console |
| `ADOBE_CLIENT_SECRET` | Yes | Same |
| `ADOBE_ORG_ID` | Yes | Same |

> **Pricing**: Enterprise contract

#### Mixpanel
| Variable | Required | Get From |
|----------|----------|----------|
| `MIXPANEL_TOKEN` | Yes | Project Settings → Access Keys |
| `MIXPANEL_API_SECRET` | Yes | Same |

> **Pricing**: Free (20M events/mo), Paid ($20/mo+)

#### Amplitude
| Variable | Required | Get From |
|----------|----------|----------|
| `AMPLITUDE_API_KEY` | Yes | Settings → Projects → API Keys |
| `AMPLITUDE_SECRET_KEY` | Yes | Same |

> **Pricing**: Free (50K MTUs), Paid

#### Segment — Customer Data Platform
| Variable | Required | Get From |
|----------|----------|----------|
| `SEGMENT_WRITE_KEY` | Yes | https://app.segment.com/ → Sources |

> **Pricing**: Free (1K visitors/mo), Paid ($120/mo+)

---

## 13. Data Warehouses & BI Tools

#### Snowflake
| Variable | Required | Get From |
|----------|----------|----------|
| `SNOWFLAKE_ACCOUNT` | Yes | Your account identifier |
| `SNOWFLAKE_USER` | Yes | Your username |
| `SNOWFLAKE_PASSWORD` | Yes | Your password |
| `SNOWFLAKE_WAREHOUSE` | Yes | Warehouse name |

> **Pricing**: Paid (usage-based, ~$2/credit)

#### Google BigQuery
| Variable | Required | Get From |
|----------|----------|----------|
| `BIGQUERY_PROJECT_ID` | Yes | GCP Console → Project ID |
| `BIGQUERY_SERVICE_ACCOUNT_JSON` | Yes | IAM → Service Accounts |

> **Pricing**: Free (1TB queries/mo), then $5/TB

#### Amazon Redshift
| Variable | Required | Get From |
|----------|----------|----------|
| `REDSHIFT_HOST` | Yes | Your cluster endpoint |
| `REDSHIFT_PORT` | Yes | Default: `5439` |
| `REDSHIFT_DATABASE` | Yes | Database name |
| `REDSHIFT_USER` | Yes | Admin user |
| `REDSHIFT_PASSWORD` | Yes | Admin password |

> **Pricing**: Paid ($0.25/hour node+)

#### Databricks
| Variable | Required | Get From |
|----------|----------|----------|
| `DATABRICKS_HOST` | Yes | Your workspace URL |
| `DATABRICKS_TOKEN` | Yes | User Settings → Access Tokens |

> **Pricing**: Paid (usage-based)

#### Power BI
| Variable | Required | Get From |
|----------|----------|----------|
| `POWERBI_CLIENT_ID` | Yes | https://portal.azure.com → App registrations |
| `POWERBI_CLIENT_SECRET` | Yes | Same |
| `POWERBI_TENANT_ID` | Yes | Same |

> **Pricing**: $10/user/mo (Pro), $4,995/mo (Premium)

#### Tableau
| Variable | Required | Get From |
|----------|----------|----------|
| `TABLEAU_SERVER_URL` | Yes | Your Tableau Server URL |
| `TABLEAU_TOKEN_NAME` | Yes | Settings → Personal Access Tokens |
| `TABLEAU_TOKEN_SECRET` | Yes | Same |

> **Pricing**: $15/user/mo (Viewer), $70/user/mo (Creator)

#### Looker / Looker Studio
| Variable | Required | Get From |
|----------|----------|----------|
| `LOOKER_CLIENT_ID` | Yes | Admin → API → API Credentials |
| `LOOKER_CLIENT_SECRET` | Yes | Same |
| `LOOKER_BASE_URL` | Yes | Your Looker instance |

> **Pricing**: Enterprise contract

#### Domo
| Variable | Required | Get From |
|----------|----------|----------|
| `DOMO_CLIENT_ID` | Yes | https://developer.domo.com/ |
| `DOMO_CLIENT_SECRET` | Yes | Same |

> **Pricing**: Enterprise contract

---

## 14. Cloud Storage & File Export

#### AWS S3
| Variable | Required | Get From |
|----------|----------|----------|
| `AWS_S3_ACCESS_KEY` | Yes | https://console.aws.amazon.com → IAM |
| `AWS_S3_SECRET_KEY` | Yes | Same |
| `AWS_S3_BUCKET` | Yes | S3 Console |
| `AWS_S3_REGION` | Yes | Default: `us-east-1` |

> **Pricing**: $0.023/GB/mo (Standard)

#### Google Cloud Storage
| Variable | Required | Get From |
|----------|----------|----------|
| `GCS_SERVICE_ACCOUNT_JSON` | Yes | IAM → Service Accounts |
| `GCS_BUCKET` | Yes | Cloud Storage Console |

> **Pricing**: $0.020/GB/mo (Standard)

#### Azure Blob Storage
| Variable | Required | Get From |
|----------|----------|----------|
| `AZURE_STORAGE_ACCOUNT` | Yes | https://portal.azure.com → Storage accounts |
| `AZURE_STORAGE_KEY` | Yes | Same → Access keys |
| `AZURE_STORAGE_CONTAINER` | Yes | Container name |

> **Pricing**: $0.018/GB/mo (Hot)

#### Google Drive
| Variable | Required | Get From |
|----------|----------|----------|
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` | Yes | GCP Console → Drive API |

> **Pricing**: Free (15 GB)

#### OneDrive / SharePoint
| Variable | Required | Get From |
|----------|----------|----------|
| `ONEDRIVE_CLIENT_ID` | Yes | https://portal.azure.com → App registrations |
| `ONEDRIVE_CLIENT_SECRET` | Yes | Same |
| `ONEDRIVE_TENANT_ID` | Yes | Same |

> **Pricing**: Included with Microsoft 365

#### Dropbox Business
| Variable | Required | Get From |
|----------|----------|----------|
| `DROPBOX_ACCESS_TOKEN` | Yes | https://www.dropbox.com/developers/apps |

> **Pricing**: $15/user/mo (Business)

#### Box
| Variable | Required | Get From |
|----------|----------|----------|
| `BOX_CLIENT_ID` | Yes | https://developer.box.com/ |
| `BOX_CLIENT_SECRET` | Yes | Same |

> **Pricing**: $15/user/mo (Business)

---

## 15. Notification & Communication

#### Twilio (SMS Alerts)
| Variable | Required | Get From |
|----------|----------|----------|
| `TWILIO_ACCOUNT_SID` | Yes | https://console.twilio.com/ |
| `TWILIO_AUTH_TOKEN` | Yes | Same |
| `TWILIO_PHONE_NUMBER` | Yes | Same (buy a number) |

> **Pricing**: $0.0079/SMS (US)

#### PagerDuty — Incident Escalation
| Variable | Required | Get From |
|----------|----------|----------|
| `PAGERDUTY_API_KEY` | Yes | https://developer.pagerduty.com/ |
| `PAGERDUTY_SERVICE_ID` | Yes | Services → Service ID |

> **Pricing**: $21/user/mo+

#### Opsgenie — Alert Management
| Variable | Required | Get From |
|----------|----------|----------|
| `OPSGENIE_API_KEY` | Yes | https://app.opsgenie.com/settings/api-key-management |

> **Pricing**: $9/user/mo+

#### Telegram Bot
| Variable | Required | Get From |
|----------|----------|----------|
| `TELEGRAM_BOT_TOKEN` | Yes | https://t.me/BotFather |

> **Pricing**: Free

#### Pushover — Mobile Push Notifications
| Variable | Required | Get From |
|----------|----------|----------|
| `PUSHOVER_API_TOKEN` | Yes | https://pushover.net/apps/build |
| `PUSHOVER_USER_KEY` | Yes | Same portal |

> **Pricing**: $5 one-time purchase

#### Firebase Cloud Messaging — Mobile Push
| Variable | Required | Get From |
|----------|----------|----------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | https://console.firebase.google.com/ |

> **Pricing**: Free

---

## 16. Advertising Platforms

#### Google Ads
| Variable | Required | Get From |
|----------|----------|----------|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Yes | https://ads.google.com/intl/en_us/home/tools/api/ |
| `GOOGLE_ADS_CLIENT_ID` | Yes | GCP Console → OAuth |
| `GOOGLE_ADS_CLIENT_SECRET` | Yes | Same |

> **Pricing**: Free (API access)

#### Meta Ads (Facebook/Instagram)
| Variable | Required | Get From |
|----------|----------|----------|
| `META_ADS_ACCESS_TOKEN` | Yes | https://developers.facebook.com/ → Marketing API |
| `META_ADS_APP_ID` | Yes | Same |

> **Pricing**: Free (API access)

#### LinkedIn Ads
| Variable | Required | Get From |
|----------|----------|----------|
| `LINKEDIN_ADS_ACCESS_TOKEN` | Yes | https://www.linkedin.com/developers/ → Marketing API |

> **Pricing**: Free (API access)

#### TikTok Ads
| Variable | Required | Get From |
|----------|----------|----------|
| `TIKTOK_ADS_ACCESS_TOKEN` | Yes | https://business-api.tiktok.com/ |
| `TIKTOK_ADS_APP_ID` | Yes | Same |

> **Pricing**: Free (API access)

---

## 17. Workflow Automation & iPaaS

#### Zapier
| Variable | Required | Get From |
|----------|----------|----------|
| `ZAPIER_API_KEY` | Yes | https://zapier.com/developer/platform |
| `ZAPIER_WEBHOOK_URL` | Optional | Created per-zap |

> **Pricing**: Free (5 zaps), Paid ($19.99/mo+)

#### Make (formerly Integromat)
| Variable | Required | Get From |
|----------|----------|----------|
| `MAKE_API_TOKEN` | Yes | https://www.make.com/en/api-documentation |
| `MAKE_WEBHOOK_URL` | Optional | Created per-scenario |

> **Pricing**: Free (1,000 ops/mo), Paid ($9/mo+)

#### n8n — Self-Hosted Automation
| Variable | Required | Get From |
|----------|----------|----------|
| `N8N_WEBHOOK_URL` | Yes | Your n8n instance |

> **Pricing**: Free (self-hosted), $20/mo (cloud)

#### Workato — Enterprise iPaaS
| Variable | Required | Get From |
|----------|----------|----------|
| `WORKATO_API_TOKEN` | Yes | https://www.workato.com/ |

> **Pricing**: Enterprise contract

---

## 18. Compliance, Security & Identity

#### Okta — Enterprise SSO
| Variable | Required | Get From |
|----------|----------|----------|
| `OKTA_DOMAIN` | Yes | Your Okta org URL |
| `OKTA_CLIENT_ID` | Yes | Applications → Create App |
| `OKTA_CLIENT_SECRET` | Yes | Same |

> **Pricing**: Free (dev), $2/user/mo+ (production)

#### Auth0 — Identity Platform
| Variable | Required | Get From |
|----------|----------|----------|
| `AUTH0_DOMAIN` | Yes | https://manage.auth0.com/ |
| `AUTH0_CLIENT_ID` | Yes | Applications → Create |
| `AUTH0_CLIENT_SECRET` | Yes | Same |

> **Pricing**: Free (7,500 MAU), Paid ($23/mo+)

#### Azure AD (Entra ID)
| Variable | Required | Get From |
|----------|----------|----------|
| `AZURE_AD_TENANT_ID` | Yes | https://portal.azure.com → Azure Active Directory |
| `AZURE_AD_CLIENT_ID` | Yes | App registrations |
| `AZURE_AD_CLIENT_SECRET` | Yes | Same |

> **Pricing**: Included with Microsoft 365

#### HashiCorp Vault — Secret Management
| Variable | Required | Get From |
|----------|----------|----------|
| `VAULT_ADDR` | Yes | Your Vault server URL |
| `VAULT_TOKEN` | Yes | Vault CLI or UI |

> **Pricing**: Free (open-source), Paid (HCP Vault)

---

## 19. Monitoring & Observability

#### Datadog
| Variable | Required | Get From |
|----------|----------|----------|
| `DATADOG_API_KEY` | Yes | https://app.datadoghq.com/organization-settings/api-keys |
| `DATADOG_APP_KEY` | Yes | Same page |

> **Pricing**: $15/host/mo+

#### Sentry — Error Tracking
| Variable | Required | Get From |
|----------|----------|----------|
| `SENTRY_DSN` | Yes | https://sentry.io → Project Settings → Client Keys |

> **Pricing**: Free (5K errors/mo), Paid ($26/mo+)

#### New Relic — APM
| Variable | Required | Get From |
|----------|----------|----------|
| `NEW_RELIC_LICENSE_KEY` | Yes | https://one.newrelic.com/api-keys |

> **Pricing**: Free (100 GB/mo), Paid

#### Grafana Cloud
| Variable | Required | Get From |
|----------|----------|----------|
| `GRAFANA_API_KEY` | Yes | https://grafana.com → Account → API Keys |
| `GRAFANA_CLOUD_URL` | Yes | Your stack URL |

> **Pricing**: Free (10K metrics), Paid ($8/mo+)

#### Splunk
| Variable | Required | Get From |
|----------|----------|----------|
| `SPLUNK_HEC_TOKEN` | Yes | Settings → Data Inputs → HTTP Event Collector |
| `SPLUNK_HEC_URL` | Yes | Your Splunk instance |

> **Pricing**: Enterprise contract

---

## Media Service Configuration

These are not API keys but tuning parameters for the built-in media analysis service:

| Variable | Default | Description |
|----------|---------|-------------|
| `MEDIA_BATCH_SIZE` | `10` | Concurrent media items to process |
| `MEDIA_DOWNLOAD_TIMEOUT` | `30` | Download timeout in seconds |
| `MAX_MEDIA_SIZE_MB` | `50` | Max file size to process |
| `MAX_VIDEO_KEYFRAMES` | `5` | Keyframes to extract from video |
| `WHISPER_MODEL_SIZE` | `base` | OpenAI Whisper model (`tiny`/`base`/`small`/`medium`/`large`) |
| `CLIP_MODEL_NAME` | `openai/clip-vit-base-patch32` | CLIP model for image classification |
| `LOGO_CONFIDENCE_THRESHOLD` | `0.7` | Min confidence for logo detection |

---

## Total Integration Count

| Category | Current | Planned | Total |
|----------|---------|---------|-------|
| Social & Messaging | 13 | 15 | **28** |
| Review & Reputation | 4 | 7 | **11** |
| Forums & Communities | 1 | 4 | **5** |
| News & Media | 2 | 6 | **8** |
| AI / NLP / Enrichment | 1 | 16 | **17** |
| Translation | 0 | 3 | **3** |
| CRM & Helpdesk | 2 | 7 | **9** |
| Marketing & Email | 1 | 6 | **7** |
| Project Management | 0 | 7 | **7** |
| Analytics | 0 | 5 | **5** |
| Data Warehouses & BI | 0 | 8 | **8** |
| Cloud Storage | 0 | 7 | **7** |
| Notifications | 1 | 6 | **7** |
| Advertising | 0 | 4 | **4** |
| Automation (iPaaS) | 0 | 5 | **5** |
| Identity & Security | 0 | 4 | **4** |
| Monitoring | 0 | 5 | **5** |
| **TOTAL** | **25** | **115** | **140** |

---

*Generated for KhushFus Enterprise Social Listening Platform*
*Last updated: March 2026*
