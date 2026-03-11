"""
LLM-powered insight generation for KhushFus.

Uses Claude API for natural-language summaries, ad-hoc Q&A over mention data,
crisis detection, and report narrative generation.

Gracefully degrades when no API key is configured.
"""

import json
import logging
import os
import re
import time
from typing import Any

logger = logging.getLogger(__name__)

_UNAVAILABLE_MSG = "LLM insights unavailable (no API key configured)."

# Quota tracking — configurable via env var
LLM_MAX_TOKENS_PER_HOUR = int(os.getenv("LLM_MAX_TOKENS_PER_HOUR", "100000"))

# Maximum tokens for report narrative generation
LLM_MAX_NARRATIVE_TOKENS = int(os.getenv("LLM_MAX_NARRATIVE_TOKENS", "2048"))

# Maximum character length for narrative output (safety truncation)
LLM_MAX_NARRATIVE_CHARS = int(os.getenv("LLM_MAX_NARRATIVE_CHARS", "12000"))

# Retry configuration for _call_claude
_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 1.0  # seconds

# Valid crisis severity levels
CRISIS_SEVERITY_LEVELS = frozenset({"none", "low", "medium", "high", "critical"})

_QUOTA_DEGRADED_MSG = "LLM insights temporarily unavailable (token quota exceeded). Try again later."


class _TokenQuotaTracker:
    """Simple sliding-window token quota tracker.

    Keeps per-project running totals of input/output tokens consumed in the
    current hour and rejects calls once the hourly budget is exhausted.
    """

    def __init__(self, max_tokens_per_hour: int = LLM_MAX_TOKENS_PER_HOUR):
        self.max_tokens_per_hour = max_tokens_per_hour
        # project_id -> list of (timestamp, tokens) entries
        self._usage: dict[str, list[tuple[float, int]]] = {}

    def _prune(self, project_id: str) -> None:
        """Remove entries older than 1 hour."""
        cutoff = time.time() - 3600
        entries = self._usage.get(project_id, [])
        self._usage[project_id] = [(ts, t) for ts, t in entries if ts > cutoff]

    def record(self, project_id: str, tokens: int) -> None:
        self._usage.setdefault(project_id, []).append((time.time(), tokens))

    def tokens_used(self, project_id: str) -> int:
        self._prune(project_id)
        return sum(t for _, t in self._usage.get(project_id, []))

    def within_budget(self, project_id: str) -> bool:
        used = self.tokens_used(project_id)
        if used >= self.max_tokens_per_hour:
            logger.warning(
                "LLM token quota exceeded for project %s: %d/%d tokens used in the last hour",
                project_id, used, self.max_tokens_per_hour,
            )
            return False
        return True


# Module-level singleton so quota is shared across LLMInsights instances
_quota_tracker = _TokenQuotaTracker()

# Per-project cost attribution tracker: {project_id: {"input_tokens": N, "output_tokens": N, "calls": N}}
_usage_by_project: dict[str, dict[str, int]] = {}


def get_usage_by_project() -> dict[str, dict[str, int]]:
    """Return a copy of the per-project LLM usage stats."""
    return {k: dict(v) for k, v in _usage_by_project.items()}


def _is_retryable_error(exc: Exception) -> bool:
    """Determine if an exception is retryable (connection errors, 5xx)."""
    # Connection / network errors are always retryable
    exc_name = type(exc).__name__
    if exc_name in ("ConnectionError", "TimeoutError", "ConnectError", "ReadTimeout"):
        return True

    # Check for httpx / API status code errors
    status_code = getattr(exc, "status_code", None)
    if status_code is None:
        response = getattr(exc, "response", None)
        if response is not None:
            status_code = getattr(response, "status_code", None)

    if status_code is not None:
        # Retry on 5xx server errors, do NOT retry on 4xx client errors
        return status_code >= 500

    # For Anthropic-specific error types, check by name
    if "APIConnectionError" in exc_name or "InternalServerError" in exc_name:
        return True
    if "RateLimitError" in exc_name or "APIStatusError" in exc_name:
        status_code = getattr(exc, "status_code", 0)
        return status_code >= 500

    # Default: don't retry unknown errors
    return False


class LLMInsights:
    """Generate rich insights from mention data using Claude."""

    def __init__(self, api_key: str | None = None, project_id: str = "default"):
        self.client = None
        self.project_id = project_id
        if api_key:
            try:
                import anthropic

                self.client = anthropic.Anthropic(api_key=api_key)
                logger.info("LLMInsights: Anthropic client initialized")
            except Exception as e:
                logger.warning(f"LLMInsights: Failed to initialize Anthropic client: {e}")

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    def _format_mentions(self, mentions: list[dict], max_mentions: int = 50) -> str:
        """Condense mentions into a compact text block for prompting."""
        lines = []
        for m in mentions[:max_mentions]:
            author = m.get("author_handle") or m.get("author_name", "unknown")
            platform = m.get("platform", "")
            sentiment = m.get("sentiment", "")
            text = (m.get("text") or "")[:300]
            engagement = (
                int(m.get("likes", 0)) + int(m.get("shares", 0)) + int(m.get("comments", 0))
            )
            lines.append(
                f"- [{platform}] @{author} (engagement={engagement}, sentiment={sentiment}): {text}"
            )
        truncated = ""
        if len(mentions) > max_mentions:
            truncated = f"\n... and {len(mentions) - max_mentions} more mentions."
        return "\n".join(lines) + truncated

    def _record_usage(self, response) -> None:
        """Record token usage from a Claude API response for cost attribution."""
        usage = getattr(response, "usage", None)
        if not usage:
            return

        input_tokens = int(getattr(usage, "input_tokens", 0))
        output_tokens = int(getattr(usage, "output_tokens", 0))
        total_tokens = input_tokens + output_tokens

        # Hourly quota tracker
        _quota_tracker.record(self.project_id, total_tokens)

        # Per-project cost attribution
        if self.project_id not in _usage_by_project:
            _usage_by_project[self.project_id] = {
                "input_tokens": 0, "output_tokens": 0, "calls": 0,
            }
        proj = _usage_by_project[self.project_id]
        proj["input_tokens"] += input_tokens
        proj["output_tokens"] += output_tokens
        proj["calls"] += 1

        logger.info(
            "LLM usage [project=%s]: %d input + %d output = %d tokens (total calls: %d)",
            self.project_id, input_tokens, output_tokens, total_tokens, proj["calls"],
        )

    def _call_claude(self, prompt: str, max_tokens: int = 1024) -> str | None:
        """Send a prompt to Claude and return the text response.

        Retries up to ``_MAX_RETRIES`` times on connection errors and 5xx status codes
        with exponential backoff. Does NOT retry on 4xx errors.

        Checks the hourly token quota before making the call and records
        usage afterwards.
        """
        if self.client is None:
            return None

        # Quota gate
        if not _quota_tracker.within_budget(self.project_id):
            return None

        last_error: Exception | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                response = self.client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=max_tokens,
                    messages=[{"role": "user", "content": prompt}],
                )

                # Track token usage from the response
                self._record_usage(response)

                return response.content[0].text.strip()
            except Exception as e:
                last_error = e
                if attempt < _MAX_RETRIES and _is_retryable_error(e):
                    delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    logger.warning(
                        "LLMInsights: Claude API call failed (attempt %d/%d), retrying in %.1fs: %s",
                        attempt, _MAX_RETRIES, delay, e,
                    )
                    time.sleep(delay)
                else:
                    break

        logger.error(f"LLMInsights: Claude API call failed after {_MAX_RETRIES} attempts: {last_error}")
        return None

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    async def summarize_mentions(
        self, mentions: list[dict], context: str = "", project_id: str | None = None,
    ) -> str:
        """Generate a natural-language summary of a batch of mentions.

        Args:
            mentions: List of mention dicts.
            context: Optional additional context string.
            project_id: Optional project_id override for cost attribution.
        """
        if project_id:
            self.project_id = project_id

        if self.client is None:
            return _UNAVAILABLE_MSG

        context_section = f"\nAdditional context: {context}" if context else ""
        prompt = (
            "You are a brand monitoring analyst. Summarize the following social media "
            "mentions into a concise executive summary (3-5 paragraphs). Highlight:\n"
            "- Overall sentiment distribution\n"
            "- Key themes and topics\n"
            "- Notable mentions (high engagement or influencers)\n"
            "- Any emerging trends or concerns\n"
            f"{context_section}\n\n"
            f"Mentions:\n{self._format_mentions(mentions)}"
        )

        result = self._call_claude(prompt, max_tokens=1500)
        return result if result else _UNAVAILABLE_MSG

    async def answer_question(
        self, question: str, mentions: list[dict], project_id: str | None = None,
    ) -> str:
        """Answer ad-hoc questions about mention data.

        Args:
            question: The question to answer.
            mentions: List of mention dicts.
            project_id: Optional project_id override for cost attribution.
        """
        if project_id:
            self.project_id = project_id

        if self.client is None:
            return _UNAVAILABLE_MSG

        prompt = (
            "You are a brand monitoring analyst. Based on the following mention data, "
            f"answer this question:\n\n**Question:** {question}\n\n"
            f"**Mention data:**\n{self._format_mentions(mentions)}\n\n"
            "Provide a clear, data-backed answer. If the data is insufficient, say so."
        )

        result = self._call_claude(prompt, max_tokens=1024)
        return result if result else _UNAVAILABLE_MSG

    async def detect_crisis(
        self, mentions: list[dict], baseline: dict, project_id: str | None = None,
    ) -> dict:
        """Analyze if current mentions indicate a PR crisis.

        Args:
            mentions: Recent mentions to analyze.
            baseline: Dict with baseline metrics, e.g.
                {"avg_sentiment": 0.3, "avg_volume_per_hour": 50, "negative_pct": 0.15}
            project_id: Optional project_id override for cost attribution.

        Returns:
            Dict with keys: is_crisis (bool), severity (str), summary (str),
            recommended_actions (list[str]).
            Severity is validated against CRISIS_SEVERITY_LEVELS; defaults to "medium"
            if the model returns an unexpected value.
        """
        if project_id:
            self.project_id = project_id

        default_result: dict[str, Any] = {
            "is_crisis": False,
            "severity": "none",
            "summary": _UNAVAILABLE_MSG,
            "recommended_actions": [],
        }

        if self.client is None:
            return default_result

        prompt = (
            "You are a PR crisis detection system. Analyze these recent mentions "
            "against the baseline metrics and determine if a crisis is occurring.\n\n"
            f"**Baseline metrics:** {json.dumps(baseline)}\n\n"
            f"**Recent mentions:**\n{self._format_mentions(mentions)}\n\n"
            "Respond with ONLY a JSON object:\n"
            "{\n"
            '  "is_crisis": true|false,\n'
            '  "severity": "none"|"low"|"medium"|"high"|"critical",\n'
            '  "summary": "brief description of the situation",\n'
            '  "recommended_actions": ["action1", "action2"]\n'
            "}"
        )

        raw = self._call_claude(prompt, max_tokens=800)
        if raw is None:
            return default_result

        try:
            json_match = re.search(r"\{.*\}", raw, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                # Validate severity against allowed levels
                raw_severity = str(parsed.get("severity", "none")).lower()
                if raw_severity not in CRISIS_SEVERITY_LEVELS:
                    logger.warning(
                        "Invalid crisis severity '%s' from LLM, defaulting to 'medium'",
                        raw_severity,
                    )
                    raw_severity = "medium"
                return {
                    "is_crisis": bool(parsed.get("is_crisis", False)),
                    "severity": raw_severity,
                    "summary": str(parsed.get("summary", "")),
                    "recommended_actions": list(parsed.get("recommended_actions", [])),
                }
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Failed to parse crisis detection response: {e}")

        return default_result

    async def generate_report_narrative(
        self, metrics: dict, project_id: str | None = None,
    ) -> str:
        """Generate the narrative section of a report from metrics.

        Uses LLM_MAX_NARRATIVE_TOKENS for the max_tokens parameter and truncates
        output to LLM_MAX_NARRATIVE_CHARS if needed.

        Args:
            metrics: Dict with report metrics, e.g.
                {"total_mentions": 1234, "sentiment_breakdown": {...},
                 "top_topics": [...], "top_influencers": [...],
                 "period": "2025-01-01 to 2025-01-07"}
            project_id: Optional project_id override for cost attribution.
        """
        if project_id:
            self.project_id = project_id

        if self.client is None:
            return _UNAVAILABLE_MSG

        prompt = (
            "You are a brand monitoring report writer. Generate a professional "
            "narrative section for a monitoring report based on these metrics. "
            "Write 4-6 paragraphs covering overall performance, sentiment trends, "
            "key topics, notable influencers, and actionable recommendations.\n\n"
            f"**Metrics:**\n```json\n{json.dumps(metrics, indent=2)}\n```"
        )

        result = self._call_claude(prompt, max_tokens=LLM_MAX_NARRATIVE_TOKENS)
        if not result:
            return _UNAVAILABLE_MSG

        # Truncate if narrative exceeds character limit
        if len(result) > LLM_MAX_NARRATIVE_CHARS:
            logger.info(
                "Report narrative truncated from %d to %d chars for project %s",
                len(result), LLM_MAX_NARRATIVE_CHARS, self.project_id,
            )
            result = result[:LLM_MAX_NARRATIVE_CHARS] + "\n\n[Narrative truncated due to length limits.]"

        return result
