"""
Geographic / linguistic analysis: language distribution and platform-language cross-tabulation.
"""

import logging
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention, Platform

logger = logging.getLogger(__name__)


class GeoAnalyzer:
    """Analyse geographic and linguistic distribution of mentions."""

    async def compute_language_distribution(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
    ) -> list[dict]:
        """Group mentions by language and return counts and percentages.

        Returns:
            List of dicts with ``language``, ``count``, ``percentage``, sorted
            descending by count.  Unknown languages are reported as ``"unknown"``.
        """
        stmt = (
            select(
                Mention.language,
                func.count().label("cnt"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(Mention.language)
            .order_by(func.count().desc())
        )

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return []

        total = sum(row.cnt for row in rows)
        distribution: list[dict] = []
        for row in rows:
            lang = row.language if row.language else "unknown"
            distribution.append({
                "language": lang,
                "count": int(row.cnt),
                "percentage": round(row.cnt / total * 100, 2) if total > 0 else 0.0,
            })

        logger.info("Language distribution: %d languages for project %d", len(distribution), project_id)
        return distribution

    async def compute_platform_language_matrix(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
    ) -> dict:
        """Build a cross-tabulation of platform x language.

        Returns:
            Dict with:
            - ``matrix``: dict mapping platform -> dict of language -> count
            - ``platforms``: list of platforms present
            - ``languages``: list of languages present
            - ``total``: total mention count
        """
        stmt = (
            select(
                Mention.platform,
                Mention.language,
                func.count().label("cnt"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
            )
            .group_by(Mention.platform, Mention.language)
        )

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return {
                "matrix": {},
                "platforms": [],
                "languages": [],
                "total": 0,
            }

        matrix: dict[str, dict[str, int]] = {}
        all_languages: set[str] = set()
        total = 0

        for row in rows:
            platform_val = row.platform.value if isinstance(row.platform, Platform) else str(row.platform)
            lang = row.language if row.language else "unknown"
            count = int(row.cnt)

            if platform_val not in matrix:
                matrix[platform_val] = {}
            matrix[platform_val][lang] = matrix[platform_val].get(lang, 0) + count
            all_languages.add(lang)
            total += count

        platforms = sorted(matrix.keys())
        languages = sorted(all_languages)

        logger.info(
            "Platform-language matrix: %d platforms x %d languages for project %d",
            len(platforms), len(languages), project_id,
        )
        return {
            "matrix": matrix,
            "platforms": platforms,
            "languages": languages,
            "total": total,
        }
