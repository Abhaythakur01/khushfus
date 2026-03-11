"""Shared constants used across all KhushFus microservices.

Centralizes magic strings, default values, and plan tier limits to avoid
scattered hardcoded values across services.
"""

# ============================================================
# Service Names (for health checks, tracing, logging)
# ============================================================

SERVICE_GATEWAY = "gateway"
SERVICE_COLLECTOR = "collector"
SERVICE_ANALYZER = "analyzer"
SERVICE_QUERY = "query"
SERVICE_REPORT = "report"
SERVICE_NOTIFICATION = "notification"
SERVICE_IDENTITY = "identity"
SERVICE_TENANT = "tenant"
SERVICE_MEDIA = "media"
SERVICE_SEARCH = "search"
SERVICE_PUBLISHING = "publishing"
SERVICE_RATE_LIMITER = "rate-limiter"
SERVICE_ENRICHMENT = "enrichment"
SERVICE_EXPORT = "export"
SERVICE_COMPETITIVE = "competitive"
SERVICE_SCHEDULER = "scheduler"
SERVICE_AUDIT = "audit"
SERVICE_REALTIME = "realtime"
SERVICE_PROJECT = "project"

# ============================================================
# Plan Tier Limits
# ============================================================

PLAN_LIMITS = {
    "free": {
        "mention_quota": 1_000,
        "max_projects": 1,
        "max_users": 2,
        "max_keywords_per_project": 5,
        "max_reports_per_month": 5,
        "max_exports_per_month": 3,
        "api_rate_limit": 100,  # per hour
    },
    "starter": {
        "mention_quota": 10_000,
        "max_projects": 3,
        "max_users": 5,
        "max_keywords_per_project": 20,
        "max_reports_per_month": 50,
        "max_exports_per_month": 20,
        "api_rate_limit": 1_000,
    },
    "professional": {
        "mention_quota": 100_000,
        "max_projects": 10,
        "max_users": 25,
        "max_keywords_per_project": 100,
        "max_reports_per_month": 500,
        "max_exports_per_month": 100,
        "api_rate_limit": 5_000,
    },
    "enterprise": {
        "mention_quota": 1_000_000,
        "max_projects": 100,
        "max_users": 500,
        "max_keywords_per_project": 500,
        "max_reports_per_month": -1,  # unlimited
        "max_exports_per_month": -1,
        "api_rate_limit": 50_000,
    },
}

# ============================================================
# Platform Display Names
# ============================================================

PLATFORM_DISPLAY_NAMES = {
    "twitter": "Twitter / X",
    "facebook": "Facebook",
    "instagram": "Instagram",
    "linkedin": "LinkedIn",
    "youtube": "YouTube",
    "news": "News",
    "blog": "Blogs",
    "forum": "Forums",
    "reddit": "Reddit",
    "telegram": "Telegram",
    "quora": "Quora",
    "press": "Press Releases",
    "tiktok": "TikTok",
    "discord": "Discord",
    "threads": "Threads",
    "bluesky": "Bluesky",
    "pinterest": "Pinterest",
    "appstore": "App Store",
    "reviews": "Reviews",
    "mastodon": "Mastodon",
    "podcast": "Podcasts",
    "other": "Other",
}

# ============================================================
# Default Values
# ============================================================

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
DEFAULT_HOURS_BACK = 24
MAX_HOURS_BACK = 720  # 30 days

# NLP
SENTIMENT_CONFIDENCE_THRESHOLD = 0.6  # below this, escalate to next NLP tier
HIGH_ENGAGEMENT_THRESHOLD = 1000  # likes+shares+comments to trigger premium NLP

# Report
REPORT_FILE_MAX_SIZE_MB = 50
REPORT_DATA_RETENTION_DAYS = 365

# Mention
MENTION_TEXT_MAX_LENGTH = 50_000  # characters
DEDUP_KEY_TTL_HOURS = 24

# Webhook
WEBHOOK_TIMEOUT_SECONDS = 10
WEBHOOK_MAX_RETRIES = 3

# ============================================================
# HTTP Headers
# ============================================================

HEADER_REQUEST_ID = "X-Request-ID"
HEADER_API_KEY = "X-API-Key"
HEADER_WEBHOOK_SIGNATURE = "X-Webhook-Signature"
HEADER_WEBHOOK_TIMESTAMP = "X-Webhook-Timestamp"

# ============================================================
# Consumer Group Names
# ============================================================

GROUP_ANALYZER = "analyzer-group"
GROUP_QUERY = "query-group"
GROUP_NOTIFICATION = "notification-group"
GROUP_MEDIA = "media-group"
GROUP_ENRICHMENT = "enrichment-group"
GROUP_EXPORT = "export-group"
GROUP_PUBLISHING = "publishing-group"
GROUP_WORKFLOW = "workflow-group"
GROUP_AUDIT = "audit-group"
GROUP_REPORT = "report-group"
GROUP_COLLECTOR = "collector-group"
