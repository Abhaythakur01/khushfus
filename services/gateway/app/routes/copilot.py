"""
AI Copilot endpoint — answers natural-language questions about mention data.

Uses the LLM insights layer (Claude API) when available; falls back to
rule-based aggregation so the feature always returns a useful response.
"""

import logging
import os
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention, Project, Sentiment
from ..deps import get_db, get_user_org_id, require_auth

logger = logging.getLogger(__name__)

router = APIRouter()

# Maximum mentions to fetch for context
_MAX_CONTEXT_MENTIONS = 50


class CopilotRequest(BaseModel):
    project_id: int = Field(..., description="Project to query mentions from")
    question: str = Field(..., min_length=1, max_length=1000, description="Question about the mention data")


class CopilotResponse(BaseModel):
    answer: str
    mention_count: int
    used_llm: bool


def _sentiment_label(s) -> str:
    """Normalise sentiment enum/string to a display label."""
    if hasattr(s, "value"):
        return s.value
    return str(s)


def _rule_based_answer(question: str, mentions: list) -> str:
    """
    Generate a helpful answer using simple aggregation when Claude API is
    not available or returns no response.
    """
    total = len(mentions)
    if total == 0:
        return (
            "There are no mentions for this project yet. "
            "Trigger a collection run from the Project page to start gathering data."
        )

    q_lower = question.lower()

    # --- Sentiment aggregation ---
    sentiment_counts: Counter = Counter()
    for m in mentions:
        label = _sentiment_label(m.sentiment) if m.sentiment else "unknown"
        sentiment_counts[label] += 1

    pos = sentiment_counts.get("positive", 0)
    neg = sentiment_counts.get("negative", 0)
    neu = sentiment_counts.get("neutral", 0)

    def pct(n: int) -> str:
        return f"{round(n / total * 100)}%" if total else "0%"

    # --- Platform distribution ---
    platform_counts: Counter = Counter()
    for m in mentions:
        p = m.platform.value if hasattr(m.platform, "value") else str(m.platform or "unknown")
        platform_counts[p] += 1

    top_platforms = platform_counts.most_common(3)
    platform_summary = ", ".join(f"{p} ({c})" for p, c in top_platforms)

    # --- Engagement ---
    total_engagement = sum(
        (m.likes or 0) + (m.shares or 0) + (m.comments or 0)
        for m in mentions
    )
    avg_engagement = round(total_engagement / total) if total else 0

    # --- High-engagement mentions ---
    flagged = [m for m in mentions if m.is_flagged]
    high_eng = sorted(
        mentions,
        key=lambda m: (m.likes or 0) + (m.shares or 0) + (m.comments or 0),
        reverse=True,
    )[:3]

    # --- Keyword routing to the most relevant answer ---
    if any(kw in q_lower for kw in ("sentiment", "feel", "opinion", "positive", "negative")):
        dominant = max(sentiment_counts, key=lambda k: sentiment_counts[k], default="unknown")
        return (
            f"Based on the last {total} mentions:\n\n"
            f"• Positive: {pos} ({pct(pos)})\n"
            f"• Neutral:  {neu} ({pct(neu)})\n"
            f"• Negative: {neg} ({pct(neg)})\n\n"
            f"Overall sentiment is predominantly **{dominant}**. "
            f"{'There are some negative signals worth watching.' if neg / total > 0.3 else 'Audience reception looks generally healthy.'}"
        )

    if any(kw in q_lower for kw in ("platform", "channel", "where", "twitter", "reddit", "instagram")):
        return (
            f"Mentions across {len(platform_counts)} platform(s) in the last {total} entries:\n\n"
            + "\n".join(f"• {p}: {c} mentions ({pct(c)})" for p, c in platform_counts.most_common())
        )

    if any(kw in q_lower for kw in ("crisis", "risk", "danger", "problem", "issue", "alert")):
        crisis_risk = "elevated" if neg / total > 0.4 else "low"
        flagged_msg = f"\n\n{len(flagged)} mention(s) have been manually flagged for review." if flagged else ""
        return (
            f"Crisis risk assessment based on {total} recent mentions:\n\n"
            f"• Negative mention share: {pct(neg)} — risk level is **{crisis_risk}**\n"
            f"• Flagged mentions: {len(flagged)}\n"
            f"• Total engagement: {total_engagement:,}{flagged_msg}\n\n"
            f"{'Recommend reviewing flagged items and monitoring negative volume closely.' if crisis_risk == 'elevated' else 'No immediate crisis signals detected.'}"
        )

    if any(kw in q_lower for kw in ("influencer", "author", "user", "top", "who")):
        top = [(m.author_handle or m.author_name or "unknown",
                (m.likes or 0) + (m.shares or 0) + (m.comments or 0),
                m.author_followers or 0) for m in high_eng]
        lines = "\n".join(
            f"• @{handle}: {eng} total engagement, {followers:,} followers"
            for handle, eng, followers in top
        )
        return f"Top contributors from the last {total} mentions:\n\n{lines}"

    if any(kw in q_lower for kw in ("summary", "summarize", "overview", "brief", "tell me")):
        dominant = max(sentiment_counts, key=lambda k: sentiment_counts[k], default="unknown")
        return (
            f"**Mention Summary** (last {total} mentions)\n\n"
            f"• Sentiment: {pos} positive · {neu} neutral · {neg} negative\n"
            f"• Top platforms: {platform_summary or 'N/A'}\n"
            f"• Avg engagement per mention: {avg_engagement}\n"
            f"• Total engagement: {total_engagement:,}\n"
            f"• Flagged for review: {len(flagged)}\n\n"
            f"The dominant sentiment is **{dominant}**. "
            f"{'Consider investigating flagged items.' if flagged else 'No flagged mentions currently.'}"
        )

    if any(kw in q_lower for kw in ("trend", "over time", "recent", "latest", "growing")):
        return (
            f"Trend insight from the last {total} mentions:\n\n"
            f"• Engagement average: {avg_engagement} per mention\n"
            f"• Top platform: {top_platforms[0][0] if top_platforms else 'N/A'}\n"
            f"• Negative share: {pct(neg)}\n\n"
            "For full trend charts, visit the Analytics page."
        )

    # --- Generic fallback ---
    dominant = max(sentiment_counts, key=lambda k: sentiment_counts[k], default="unknown")
    return (
        f"Here's what I found across the last {total} mentions:\n\n"
        f"• Sentiment: {pos} positive · {neu} neutral · {neg} negative (dominant: {dominant})\n"
        f"• Platforms: {platform_summary or 'N/A'}\n"
        f"• Total engagement: {total_engagement:,} (avg {avg_engagement}/mention)\n"
        f"• Flagged items: {len(flagged)}\n\n"
        "For deeper analysis, try asking about sentiment trends, crisis risks, top influencers, or platform breakdowns."
    )


@router.post(
    "/ask",
    response_model=CopilotResponse,
    summary="Ask the AI Copilot a question",
    description=(
        "Ask a natural-language question about a project's mention data. "
        "Uses Claude API when available; falls back to rule-based aggregation."
    ),
)
async def ask_copilot(
    payload: CopilotRequest,
    request: Request,
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Return an AI-generated or rule-based answer about recent mention data."""
    # --- Authorise access to the project ---
    org_id = get_user_org_id(request)
    project = await db.get(Project, payload.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if org_id and project.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Project not found")

    # --- Fetch recent mentions ---
    result = await db.execute(
        select(Mention)
        .where(Mention.project_id == payload.project_id)
        .order_by(Mention.published_at.desc())
        .limit(_MAX_CONTEXT_MENTIONS)
    )
    mentions = list(result.scalars().all())

    # --- Attempt LLM answer ---
    used_llm = False
    answer: str | None = None

    claude_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
    if claude_key and mentions:
        try:
            # Import lazily to avoid hard dependency
            from src.nlp.llm_insights import LLMInsights

            mention_dicts = []
            for m in mentions:
                mention_dicts.append({
                    "platform": m.platform.value if hasattr(m.platform, "value") else str(m.platform),
                    "author_handle": m.author_handle,
                    "author_name": m.author_name,
                    "author_followers": m.author_followers or 0,
                    "sentiment": m.sentiment.value if hasattr(m.sentiment, "value") else str(m.sentiment or ""),
                    "text": m.text or "",
                    "likes": m.likes or 0,
                    "shares": m.shares or 0,
                    "comments": m.comments or 0,
                })

            llm = LLMInsights(api_key=claude_key, project_id=str(payload.project_id))
            answer = await llm.answer_question(
                question=payload.question,
                mentions=mention_dicts,
                project_id=str(payload.project_id),
            )
            # answer_question returns the unavailable msg string when client is None
            if answer and "unavailable" not in answer.lower():
                used_llm = True
            else:
                answer = None
        except Exception as exc:
            logger.warning("Copilot: LLM call failed, falling back to rule-based: %s", exc)
            answer = None

    # --- Rule-based fallback ---
    if not answer:
        answer = _rule_based_answer(payload.question, mentions)

    return CopilotResponse(
        answer=answer,
        mention_count=len(mentions),
        used_llm=used_llm,
    )
