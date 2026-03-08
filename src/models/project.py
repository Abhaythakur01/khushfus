import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.config.database import Base


class ProjectStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    client_name: Mapped[str] = mapped_column(String(255))
    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus), default=ProjectStatus.ACTIVE)
    platforms: Mapped[str] = mapped_column(Text, default="twitter,facebook,instagram,linkedin,youtube")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    keywords: Mapped[list["Keyword"]] = relationship(back_populates="project", cascade="all, delete-orphan")  # noqa: F821
    mentions: Mapped[list["Mention"]] = relationship(back_populates="project", cascade="all, delete-orphan")  # noqa: F821
    reports: Mapped[list["Report"]] = relationship(back_populates="project", cascade="all, delete-orphan")  # noqa: F821
