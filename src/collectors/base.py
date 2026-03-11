import logging
import os
import random
import re
import time
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

# Configurable HTTP timeout for all collectors (seconds)
COLLECTOR_HTTP_TIMEOUT = float(os.getenv("COLLECTOR_HTTP_TIMEOUT", "30"))

# Common user agents for rotation (5.16)
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/124.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
]

# Control character regex for stripping (5.17)
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# Module-level shared HTTP client (reused across collectors for connection pooling)
_shared_http_client: httpx.AsyncClient | None = None


def _get_shared_http_client() -> httpx.AsyncClient:
    """Return the module-level shared httpx.AsyncClient, creating it if needed.

    The client uses connection pooling for efficiency. Call ``close_shared_http_client()``
    during application shutdown to release resources.
    """
    global _shared_http_client  # noqa: PLW0603
    if _shared_http_client is None or _shared_http_client.is_closed:
        proxy_url = os.environ.get("COLLECTOR_PROXY_URL")
        client_kwargs: dict = {
            "timeout": COLLECTOR_HTTP_TIMEOUT,
            "headers": {"User-Agent": random.choice(_USER_AGENTS)},
            "limits": httpx.Limits(max_connections=100, max_keepalive_connections=20),
        }
        if proxy_url:
            client_kwargs["proxy"] = proxy_url
        _shared_http_client = httpx.AsyncClient(**client_kwargs)
    return _shared_http_client


async def close_shared_http_client() -> None:
    """Close the shared HTTP client. Call during application shutdown."""
    global _shared_http_client  # noqa: PLW0603
    if _shared_http_client is not None and not _shared_http_client.is_closed:
        await _shared_http_client.aclose()
        _shared_http_client = None
        logger.info("Shared HTTP client closed")


@dataclass
class CollectedMention:
    """Raw mention collected from a platform before NLP analysis.

    Note on ``published_at``: This should always be timezone-aware (UTC preferred).
    If a collector cannot determine the timezone, it should set UTC explicitly.
    The ``BaseCollector._validate_mention()`` method will enforce UTC if naive.
    """

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

    # 5.10 — Rate limiting configuration (seconds between requests)
    _rate_limit_delay: float = 1.0
    _last_request_time: float = 0

    # 5.12 — Source-level deduplication
    _max_seen_ids: int = 10000

    def __init_subclass__(cls, **kwargs: object) -> None:
        super().__init_subclass__(**kwargs)

    def __init__(self) -> None:
        # Dedup tracking (5.12)
        self._seen_ids: set[str] = set()
        self._seen_ids_order: deque[str] = deque()

    @abstractmethod
    async def collect(
        self, keywords: list[str], since: datetime | None = None, max_results: int = 1000
    ) -> list[CollectedMention]:
        """Collect mentions matching the given keywords.

        Args:
            keywords: Terms to search for.
            since: Only return mentions published after this time.
            max_results: Maximum total mentions to return (default 1000).
        """
        ...

    @abstractmethod
    async def validate_credentials(self) -> bool:
        """Check if API credentials are valid."""
        ...

    def _matches_keywords(self, text: str, keywords: list[str]) -> list[str]:
        text_lower = text.lower()
        return [kw for kw in keywords if kw.lower() in text_lower]

    # ── 5.10  Rate-limited HTTP requests ──────────────────────────────

    async def _rate_limited_request(
        self,
        client: httpx.AsyncClient,
        method: str,
        url: str,
        **kwargs: object,
    ) -> httpx.Response:
        """Execute an HTTP request with rate-limit delay enforcement."""
        import asyncio

        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < self._rate_limit_delay:
            await asyncio.sleep(self._rate_limit_delay - elapsed)

        self._last_request_time = time.monotonic()
        response: httpx.Response = await client.request(method, url, **kwargs)
        self._handle_http_error(response.status_code, self.platform, url)
        return response

    # ── 5.11  OAuth token refresh (override in subclasses) ────────────

    async def _refresh_token(self) -> str | None:
        """Refresh an OAuth token. Returns new token or None if not supported.

        Subclasses with OAuth credentials should override this to implement
        platform-specific token refresh logic.
        """
        return None

    # ── 5.12  Source-level deduplication ───────────────────────────────

    def _is_duplicate(self, source_id: str) -> bool:
        """Check if *source_id* was already seen; track it if not.

        Uses a bounded set + deque to cap memory at *_max_seen_ids*.
        """
        if source_id in self._seen_ids:
            return True

        # Evict oldest when at capacity
        if len(self._seen_ids) >= self._max_seen_ids:
            oldest = self._seen_ids_order.popleft()
            self._seen_ids.discard(oldest)

        self._seen_ids.add(source_id)
        self._seen_ids_order.append(source_id)
        return False

    # ── 5.14  HTTP error classification ───────────────────────────────

    @staticmethod
    def _classify_http_error(status_code: int) -> str:
        """Classify an HTTP status code into an error category."""
        if status_code == 429:
            return "rate_limited"
        if status_code in (401, 403):
            return "auth_error"
        if 500 <= status_code <= 599:
            return "server_error"
        if 400 <= status_code <= 499:
            return "client_error"
        return "ok"

    def _handle_http_error(self, status_code: int, platform: str, url: str) -> None:
        """Log non-2xx responses with the appropriate classification."""
        if 200 <= status_code < 300:
            return
        classification = self._classify_http_error(status_code)
        log_msg = f"[{platform}] HTTP {status_code} ({classification}) for {url}"
        if classification == "rate_limited":
            logger.warning(log_msg + " — should backoff")
        elif classification == "auth_error":
            logger.error(log_msg + " — should not retry")
        elif classification == "server_error":
            logger.warning(log_msg + " — should retry")
        else:
            logger.warning(log_msg)

    # ── 5.16  Proxy support & user-agent rotation ─────────────────────

    def _get_http_client(self, **kwargs: object) -> httpx.AsyncClient:
        """Create an httpx.AsyncClient with optional proxy, rotated user-agent, and configurable timeout."""
        proxy_url = os.environ.get("COLLECTOR_PROXY_URL")
        headers = dict(kwargs.pop("headers", None) or {})  # type: ignore[arg-type]
        headers.setdefault("User-Agent", random.choice(_USER_AGENTS))

        client_kwargs: dict = {
            "headers": headers,
            "timeout": COLLECTOR_HTTP_TIMEOUT,
            **kwargs,
        }
        if proxy_url:
            client_kwargs["proxy"] = proxy_url

        return httpx.AsyncClient(**client_kwargs)

    # ── 5.17  Data validation at collection ───────────────────────────

    @staticmethod
    def _validate_mention(mention: CollectedMention) -> CollectedMention:
        """Sanitise and validate a collected mention before returning it.

        * Validates URL (non-empty, starts with http)
        * Clamps published_at to [2000-01-01, now]
        * Ensures published_at is timezone-aware (assumes UTC if naive)
        * Strips control characters from text
        * Truncates text to 10 000 chars
        * Defaults author_name to "unknown" if empty
        """
        # URL validation
        if mention.source_url and not mention.source_url.startswith("http"):
            mention.source_url = ""

        # Ensure published_at is timezone-aware and clamped
        if mention.published_at is not None:
            min_date = datetime(2000, 1, 1, tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            pub = mention.published_at
            if pub.tzinfo is None:
                # Naive datetime: assume UTC
                pub = pub.replace(tzinfo=timezone.utc)
                mention.published_at = pub
            if pub < min_date:
                mention.published_at = min_date
            elif pub > now:
                mention.published_at = now

        # Strip control characters
        mention.text = _CONTROL_CHAR_RE.sub("", mention.text)

        # Truncate text
        if len(mention.text) > 10_000:
            mention.text = mention.text[:10_000]

        # Default author
        if not mention.author_name or not mention.author_name.strip():
            mention.author_name = "unknown"

        return mention
