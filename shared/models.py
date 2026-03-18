"""
Shared SQLAlchemy models used across all microservices.
Single source of truth for the database schema.
"""

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ============================================================
# Enums
# ============================================================


class ProjectStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class Platform(str, enum.Enum):
    TWITTER = "twitter"
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    LINKEDIN = "linkedin"
    YOUTUBE = "youtube"
    NEWS = "news"
    BLOG = "blog"
    FORUM = "forum"
    REDDIT = "reddit"
    TELEGRAM = "telegram"
    QUORA = "quora"
    PRESS = "press"
    TIKTOK = "tiktok"
    DISCORD = "discord"
    THREADS = "threads"
    BLUESKY = "bluesky"
    PINTEREST = "pinterest"
    APPSTORE = "appstore"
    REVIEWS = "reviews"
    MASTODON = "mastodon"
    PODCAST = "podcast"
    TRUSTPILOT = "trustpilot"
    YELP = "yelp"
    G2 = "g2"
    OTHER = "other"


class Sentiment(str, enum.Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    MIXED = "mixed"


class ReportType(str, enum.Enum):
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    CUSTOM = "custom"


class ReportFormat(str, enum.Enum):
    PDF = "pdf"
    PPTX = "pptx"


class AlertSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class OrgRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MANAGER = "manager"
    ANALYST = "analyst"
    VIEWER = "viewer"


class PlanTier(str, enum.Enum):
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class ExportFormat(str, enum.Enum):
    CSV = "csv"
    EXCEL = "excel"
    PDF = "pdf"
    JSON = "json"


class ExportStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class PublishStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    FAILED = "failed"


class WorkflowStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================
# Identity & Multi-Tenancy
# ============================================================


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    plan: Mapped[PlanTier] = mapped_column(Enum(PlanTier), default=PlanTier.FREE)
    mention_quota: Mapped[int] = mapped_column(Integer, default=10000)  # per month
    mentions_used: Mapped[int] = mapped_column(Integer, default=0)
    max_projects: Mapped[int] = mapped_column(Integer, default=3)
    max_users: Mapped[int] = mapped_column(Integer, default=5)
    # SSO
    sso_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    sso_provider: Mapped[str | None] = mapped_column(String(50))  # saml, oidc
    sso_metadata_url: Mapped[str | None] = mapped_column(String(2000))
    sso_entity_id: Mapped[str | None] = mapped_column(String(255))
    # Branding
    logo_url: Mapped[str | None] = mapped_column(String(2000))
    primary_color: Mapped[str | None] = mapped_column(String(7))  # hex
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    members: Mapped[list["OrgMember"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    projects: Mapped[list["Project"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    api_keys: Mapped[list["ApiKey"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="organization", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Organization id={self.id} slug={self.slug!r} plan={self.plan}>"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255))  # null for SSO-only users
    full_name: Mapped[str] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(2000))
    sso_subject: Mapped[str | None] = mapped_column(String(255))  # external SSO ID
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Soft delete
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    memberships: Mapped[list["OrgMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


class OrgMember(Base):
    __tablename__ = "org_members"
    __table_args__ = (
        # One membership per user per org
        UniqueConstraint("organization_id", "user_id", name="uq_org_member"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[OrgRole] = mapped_column(Enum(OrgRole), default=OrgRole.VIEWER)
    invited_by: Mapped[int | None] = mapped_column(Integer)
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    organization: Mapped["Organization"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")

    def __repr__(self) -> str:
        return f"<OrgMember id={self.id} org={self.organization_id} user={self.user_id} role={self.role}>"


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    key_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    prefix: Mapped[str] = mapped_column(String(10))  # first 8 chars for identification
    scopes: Mapped[str] = mapped_column(String(200), default="read")  # read,write,admin
    rate_limit: Mapped[int] = mapped_column(Integer, default=1000)  # per hour
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    organization: Mapped["Organization"] = relationship(back_populates="api_keys")

    def __repr__(self) -> str:
        return f"<ApiKey id={self.id} prefix={self.prefix!r} org={self.organization_id}>"


# ============================================================
# Project & Keywords (tenant-scoped)
# ============================================================


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2000))
    client_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus), default=ProjectStatus.ACTIVE)
    platforms: Mapped[str] = mapped_column(String(500), default="twitter,facebook,instagram,linkedin,youtube")
    # Competitor tracking
    competitor_ids: Mapped[str | None] = mapped_column(String(500))  # comma-separated project IDs
    # Audit trail
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # Soft delete
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    organization: Mapped["Organization"] = relationship(back_populates="projects")
    keywords: Mapped[list["Keyword"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    mentions: Mapped[list["Mention"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    reports: Mapped[list["Report"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    alert_rules: Mapped[list["AlertRule"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    saved_searches: Mapped[list["SavedSearch"]] = relationship(back_populates="project", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Project id={self.id} name={self.name!r} org={self.organization_id} status={self.status}>"


class Keyword(Base):
    __tablename__ = "keywords"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    term: Mapped[str] = mapped_column(String(255))
    keyword_type: Mapped[str] = mapped_column(String(50), default="brand")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="keywords")

    def __repr__(self) -> str:
        return f"<Keyword id={self.id} term={self.term!r} project={self.project_id}>"


# ============================================================
# Mentions & Media
# ============================================================


class Mention(Base):
    """High-volume table — consider range-partitioning by published_at (monthly) at scale.

    PostgreSQL: ``CREATE TABLE mentions (...) PARTITION BY RANGE (published_at);``
    Then create monthly partitions automatically via pg_partman or cron.
    """

    __tablename__ = "mentions"
    __table_args__ = (
        # Dedup: one mention per (project, source, platform)
        UniqueConstraint("project_id", "source_id", "platform", name="uq_mention_source_platform"),
        # Dashboard time-series queries
        Index("ix_mention_project_published", "project_id", "published_at"),
        # Sentiment filter on project detail page
        Index("ix_mention_project_sentiment", "project_id", "sentiment"),
        # Platform filter on project detail page
        Index("ix_mention_project_platform", "project_id", "platform"),
        # Retention policy / time-range scans
        Index("ix_mention_collected", "collected_at"),
        # Fast dedup lookup in query service
        Index("ix_mention_dedup", "project_id", "source_id", "platform"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    platform: Mapped[Platform] = mapped_column(Enum(Platform), index=True)
    source_id: Mapped[str | None] = mapped_column(String(255), index=True)
    source_url: Mapped[str | None] = mapped_column(String(2000))

    text: Mapped[str] = mapped_column(Text)  # mention text, unbounded (tweets to blog posts)
    author_name: Mapped[str | None] = mapped_column(String(255))
    author_handle: Mapped[str | None] = mapped_column(String(255))
    author_followers: Mapped[int | None] = mapped_column(Integer)
    author_profile_url: Mapped[str | None] = mapped_column(String(2000))

    likes: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    reach: Mapped[int] = mapped_column(Integer, default=0)

    sentiment: Mapped[Sentiment] = mapped_column(Enum(Sentiment), index=True)
    sentiment_score: Mapped[float] = mapped_column(Float, default=0.0)
    language: Mapped[str | None] = mapped_column(String(10))
    matched_keywords: Mapped[str | None] = mapped_column(Text)
    topics: Mapped[str | None] = mapped_column(Text)
    entities: Mapped[str | None] = mapped_column(Text)

    # Media analysis fields
    has_media: Mapped[bool] = mapped_column(Boolean, default=False)
    media_type: Mapped[str | None] = mapped_column(String(20))  # image, video, audio
    media_url: Mapped[str | None] = mapped_column(String(2000))
    media_ocr_text: Mapped[str | None] = mapped_column(Text)
    media_labels: Mapped[str | None] = mapped_column(Text)  # JSON: detected objects/logos
    media_transcript: Mapped[str | None] = mapped_column(Text)  # video/audio transcript

    # Enrichment fields
    author_influence_score: Mapped[float | None] = mapped_column(Float)
    author_is_bot: Mapped[bool | None] = mapped_column(Boolean)
    author_org: Mapped[str | None] = mapped_column(String(255))
    virality_score: Mapped[float | None] = mapped_column(Float)

    published_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    is_flagged: Mapped[bool] = mapped_column(default=False)
    assigned_to: Mapped[str | None] = mapped_column(String(255), default=None)
    # Soft delete
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)

    project: Mapped["Project"] = relationship(back_populates="mentions")

    def __repr__(self) -> str:
        return f"<Mention id={self.id} platform={self.platform} project={self.project_id} sentiment={self.sentiment}>"


# ============================================================
# Reports
# ============================================================


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    report_type: Mapped[ReportType] = mapped_column(Enum(ReportType))
    title: Mapped[str] = mapped_column(String(255))
    period_start: Mapped[datetime] = mapped_column(DateTime)
    period_end: Mapped[datetime] = mapped_column(DateTime)
    format: Mapped[str] = mapped_column(String(10), default="pdf")
    file_path: Mapped[str | None] = mapped_column(String(1000))
    data_json: Mapped[str | None] = mapped_column(Text)
    # Audit trail
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # Soft delete
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="reports")

    def __repr__(self) -> str:
        return f"<Report id={self.id} type={self.report_type} format={self.format} project={self.project_id}>"


# ============================================================
# Alerts
# ============================================================


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    rule_type: Mapped[str] = mapped_column(String(50))
    threshold: Mapped[float] = mapped_column(Float, default=0.0)
    window_minutes: Mapped[int] = mapped_column(Integer, default=60)
    channels: Mapped[str] = mapped_column(String(200), default="email")
    webhook_url: Mapped[str | None] = mapped_column(String(2000))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Audit trail
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="alert_rules")

    def __repr__(self) -> str:
        return f"<AlertRule id={self.id} name={self.name!r} type={self.rule_type} project={self.project_id}>"


class AlertLog(Base):
    __tablename__ = "alert_logs"
    __table_args__ = (
        # Fast lookup for alert history by project, ordered by recency
        Index("ix_alert_log_project_created", "project_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    rule_id: Mapped[int | None] = mapped_column(ForeignKey("alert_rules.id", ondelete="SET NULL"))
    alert_type: Mapped[str] = mapped_column(String(50))
    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(5000))
    data_json: Mapped[str | None] = mapped_column(Text)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def __repr__(self) -> str:
        return f"<AlertLog id={self.id} type={self.alert_type} severity={self.severity} project={self.project_id}>"


# ============================================================
# Search
# ============================================================


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    query_json: Mapped[str] = mapped_column(String(10000))  # full ES query as JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    project: Mapped["Project"] = relationship(back_populates="saved_searches")

    def __repr__(self) -> str:
        return f"<SavedSearch id={self.id} name={self.name!r} project={self.project_id}>"


# ============================================================
# Publishing & Engagement
# ============================================================


class ScheduledPost(Base):
    __tablename__ = "scheduled_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    platform: Mapped[Platform] = mapped_column(Enum(Platform))
    content: Mapped[str] = mapped_column(String(10000))
    media_urls: Mapped[str | None] = mapped_column(String(2000))  # comma-separated
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[PublishStatus] = mapped_column(Enum(PublishStatus), default=PublishStatus.DRAFT, index=True)
    platform_post_id: Mapped[str | None] = mapped_column(String(255))
    approved_by: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    # Reply to a mention
    reply_to_mention_id: Mapped[int | None] = mapped_column(ForeignKey("mentions.id", ondelete="SET NULL"))

    def __repr__(self) -> str:
        return f"<ScheduledPost id={self.id} platform={self.platform} status={self.status} project={self.project_id}>"


# ============================================================
# Export & Integration
# ============================================================


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    export_format: Mapped[ExportFormat] = mapped_column(Enum(ExportFormat))
    filters_json: Mapped[str | None] = mapped_column(String(10000))
    status: Mapped[ExportStatus] = mapped_column(Enum(ExportStatus), default=ExportStatus.PENDING, index=True)
    file_path: Mapped[str | None] = mapped_column(String(1000))
    row_count: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    def __repr__(self) -> str:
        return f"<ExportJob id={self.id} format={self.export_format} status={self.status} project={self.project_id}>"


class Integration(Base):
    __tablename__ = "integrations"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    integration_type: Mapped[str] = mapped_column(String(50))  # salesforce, hubspot, slack, tableau, webhook
    name: Mapped[str] = mapped_column(String(255))
    config_json: Mapped[str] = mapped_column(String(10000))  # encrypted connection config
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    def __repr__(self) -> str:
        return f"<Integration id={self.id} type={self.integration_type!r} org={self.organization_id}>"


# ============================================================
# Competitive Intelligence
# ============================================================


class CompetitorBenchmark(Base):
    __tablename__ = "competitor_benchmarks"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    competitor_project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    period_start: Mapped[datetime] = mapped_column(DateTime)
    period_end: Mapped[datetime] = mapped_column(DateTime)
    data_json: Mapped[str] = mapped_column(Text)  # share_of_voice, sentiment_comparison, etc.
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    def __repr__(self) -> str:
        return f"<CompetitorBenchmark id={self.id} project={self.project_id} vs={self.competitor_project_id}>"


# ============================================================
# Workflows & Automation
# ============================================================


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(255))
    trigger_json: Mapped[str] = mapped_column(String(10000))
    actions_json: Mapped[str] = mapped_column(String(10000))
    status: Mapped[WorkflowStatus] = mapped_column(Enum(WorkflowStatus), default=WorkflowStatus.ACTIVE)
    executions: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(default=None, onupdate=func.now())

    def __repr__(self) -> str:
        return f"<Workflow id={self.id} name={self.name!r} status={self.status} project={self.project_id}>"


# ============================================================
# Audit & Compliance
# ============================================================


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        # Fast audit trail lookup by org, ordered by recency
        Index("ix_audit_log_org_created", "organization_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(100))  # project.create, mention.flag, report.generate, etc.
    resource_type: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[int | None] = mapped_column(Integer)
    details_json: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)

    organization: Mapped["Organization"] = relationship(back_populates="audit_logs")

    def __repr__(self) -> str:
        return f"<AuditLog id={self.id} action={self.action!r} org={self.organization_id} user={self.user_id}>"


# ============================================================
# Rate Limiting
# ============================================================


class PlatformQuota(Base):
    __tablename__ = "platform_quotas"
    __table_args__ = (
        # One quota entry per platform+endpoint combination
        UniqueConstraint("platform", "endpoint", name="uq_platform_quota"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    platform: Mapped[Platform] = mapped_column(Enum(Platform), index=True)
    endpoint: Mapped[str] = mapped_column(String(255))
    max_requests: Mapped[int] = mapped_column(Integer)
    window_seconds: Mapped[int] = mapped_column(Integer)
    requests_used: Mapped[int] = mapped_column(Integer, default=0)
    window_reset_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<PlatformQuota id={self.id} platform={self.platform} endpoint={self.endpoint!r}>"
