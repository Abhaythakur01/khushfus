"""
LLM-powered insight generation for KhushFus.

Uses Claude API for natural-language summaries, ad-hoc Q&A over mention data,
crisis detection, and report narrative generation.

Gracefully degrades when no API key is configured.
"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_UNAVAILABLE_MSG = "LLM insights unavailable (no API key configured)."


class LLMInsights:
    """Generate rich insights from mention data using Claude."""

    def __init__(self, api_key: str | None = None):
        self.client = None
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
                int(m.get("likes", 0))
                + int(m.get("shares", 0))
                + int(m.get("comments", 0))
            )
            lines.append(
                f"- [{platform}] @{author} (engagement={engagement}, sentiment={sentiment}): {text}"
            )
        truncated = ""
        if len(mentions) > max_mentions:
            truncated = f"\n... and {len(mentions) - max_mentions} more mentions."
        return "\n".join(lines) + truncated

    def _call_claude(self, prompt: str, max_tokens: int = 1024) -> str | None:
        """Send a prompt to Claude and return the text response."""
        if self.client is None:
            return None
        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        except Exception as e:
            logger.error(f"LLMInsights: Claude API call failed: {e}")
            return None

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    async def summarize_mentions(
        self, mentions: list[dict], context: str = ""
    ) -> str:
        """Generate a natural-language summary of a batch of mentions."""
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
        self, question: str, mentions: list[dict]
    ) -> str:
        """Answer ad-hoc questions about mention data."""
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
        self, mentions: list[dict], baseline: dict
    ) -> dict:
        """Analyze if current mentions indicate a PR crisis.

        Args:
            mentions: Recent mentions to analyze.
            baseline: Dict with baseline metrics, e.g.
                {"avg_sentiment": 0.3, "avg_volume_per_hour": 50, "negative_pct": 0.15}

        Returns:
            Dict with keys: is_crisis (bool), severity (str), summary (str),
            recommended_actions (list[str]).
        """
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
                return {
                    "is_crisis": bool(parsed.get("is_crisis", False)),
                    "severity": str(parsed.get("severity", "none")),
                    "summary": str(parsed.get("summary", "")),
                    "recommended_actions": list(parsed.get("recommended_actions", [])),
                }
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Failed to parse crisis detection response: {e}")

        return default_result

    async def generate_report_narrative(self, metrics: dict) -> str:
        """Generate the narrative section of a report from metrics.

        Args:
            metrics: Dict with report metrics, e.g.
                {"total_mentions": 1234, "sentiment_breakdown": {...},
                 "top_topics": [...], "top_influencers": [...],
                 "period": "2025-01-01 to 2025-01-07"}
        """
        if self.client is None:
            return _UNAVAILABLE_MSG

        prompt = (
            "You are a brand monitoring report writer. Generate a professional "
            "narrative section for a monitoring report based on these metrics. "
            "Write 4-6 paragraphs covering overall performance, sentiment trends, "
            "key topics, notable influencers, and actionable recommendations.\n\n"
            f"**Metrics:**\n```json\n{json.dumps(metrics, indent=2)}\n```"
        )

        result = self._call_claude(prompt, max_tokens=2000)
        return result if result else _UNAVAILABLE_MSG
