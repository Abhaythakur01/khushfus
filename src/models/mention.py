import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.config.database import Base


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
    OTHER = "other"


class Sentiment(str, enum.Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    MIXED = "mixed"


class Mention(Base):
    __tablename__ = "mentions"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    platform: Mapped[Platform] = mapped_column(Enum(Platform), index=True)
    source_id: Mapped[str | None] = mapped_column(String(255))  # platform-specific post ID
    source_url: Mapped[str | None] = mapped_column(Text)

    # Content
    text: Mapped[str] = mapped_column(Text)
    author_name: Mapped[str | None] = mapped_column(String(255))
    author_handle: Mapped[str | None] = mapped_column(String(255))
    author_followers: Mapped[int | None] = mapped_column(Integer)
    author_profile_url: Mapped[str | None] = mapped_column(Text)

    # Engagement
    likes: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    reach: Mapped[int] = mapped_column(Integer, default=0)

    # NLP Analysis
    sentiment: Mapped[Sentiment] = mapped_column(Enum(Sentiment), index=True)
    sentiment_score: Mapped[float] = mapped_column(Float, default=0.0)
    language: Mapped[str | None] = mapped_column(String(10))
    matched_keywords: Mapped[str | None] = mapped_column(Text)  # comma-separated
    topics: Mapped[str | None] = mapped_column(Text)  # comma-separated detected topics
    entities: Mapped[str | None] = mapped_column(Text)  # JSON string of named entities

    # Metadata
    published_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    is_flagged: Mapped[bool] = mapped_column(default=False)  # for discrepancy alerts

    project: Mapped["Project"] = relationship(back_populates="mentions")  # noqa: F821
