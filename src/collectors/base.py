import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class CollectedMention:
    """Raw mention collected from a platform before NLP analysis."""

    platform: str
    source_id: str
    source_url: str
    text: str
    author_name: str
    author_handle: str
    author_followers: int = 0
    author_profile_url: str = ""
    likes: int = 0
    shares: int = 0
    comments: int = 0
    reach: int = 0
    published_at: datetime | None = None
    raw_data: dict = field(default_factory=dict)


class BaseCollector(ABC):
    """Base class for all platform collectors."""

    platform: str = "unknown"

    @abstractmethod
    async def collect(self, keywords: list[str], since: datetime | None = None) -> list[CollectedMention]:
        """Collect mentions matching the given keywords."""
        ...

    @abstractmethod
    async def validate_credentials(self) -> bool:
        """Check if API credentials are valid."""
        ...

    def _matches_keywords(self, text: str, keywords: list[str]) -> list[str]:
        text_lower = text.lower()
        return [kw for kw in keywords if kw.lower() in text_lower]
