"""
Topic analysis: keyword co-occurrence, clustering (TF-IDF + KMeans), and trend tracking.
"""

import logging
import string
from collections import Counter
from datetime import datetime
from itertools import combinations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Mention

logger = logging.getLogger(__name__)

# Minimal English stopwords (no external dependency needed)
_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "it", "its", "this", "that", "was",
    "are", "were", "be", "been", "being", "have", "has", "had", "do", "does",
    "did", "will", "would", "could", "should", "may", "might", "shall",
    "can", "not", "no", "nor", "so", "if", "as", "he", "she", "we", "they",
    "i", "me", "my", "you", "your", "our", "us", "them", "their", "him",
    "her", "his", "who", "what", "which", "when", "where", "how", "all",
    "each", "every", "both", "few", "more", "most", "other", "some", "such",
    "than", "too", "very", "just", "about", "up", "out", "into", "over",
    "after", "before", "between", "under", "again", "then", "once", "here",
    "there", "why", "am", "an", "any", "also", "only", "own", "same",
    "http", "https", "www", "com", "rt", "via",
})

_PUNCT_TABLE = str.maketrans("", "", string.punctuation)


def _tokenize(text: str, min_length: int = 3) -> list[str]:
    """Lowercase, strip punctuation, remove stopwords and short tokens."""
    tokens = text.lower().translate(_PUNCT_TABLE).split()
    return [t for t in tokens if len(t) >= min_length and t not in _STOPWORDS]


class TopicAnalyzer:
    """Extract topic insights from mention text content."""

    async def extract_keyword_cooccurrence(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
        top_n: int = 50,
    ) -> list[dict]:
        """Find the most frequent word-pair co-occurrences across mentions.

        Each mention is tokenized; unique word pairs within a mention are counted.

        Returns:
            List of dicts with ``word_a``, ``word_b``, ``weight`` (count), sorted
            descending by weight.
        """
        stmt = (
            select(Mention.text)
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
                Mention.text.isnot(None),
            )
        )
        result = await session.execute(stmt)
        texts = [row[0] for row in result.all() if row[0]]

        if not texts:
            return []

        pair_counts: Counter = Counter()
        for text in texts:
            tokens = list(set(_tokenize(text)))  # unique tokens per doc
            if len(tokens) < 2:
                continue
            for pair in combinations(sorted(tokens), 2):
                pair_counts[pair] += 1

        top_pairs = pair_counts.most_common(top_n)

        results = [
            {"word_a": a, "word_b": b, "weight": count}
            for (a, b), count in top_pairs
        ]
        logger.info("Extracted %d co-occurrence pairs for project %d", len(results), project_id)
        return results

    async def cluster_topics(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
        n_clusters: int = 8,
    ) -> list[dict]:
        """Cluster mention texts using TF-IDF + KMeans.

        Falls back to simple keyword frequency if scikit-learn is not installed.

        Returns:
            List of cluster dicts with ``cluster_id``, ``top_terms``, and ``mention_count``.
        """
        stmt = (
            select(Mention.text)
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
                Mention.text.isnot(None),
            )
        )
        result = await session.execute(stmt)
        texts = [row[0] for row in result.all() if row[0] and len(row[0].strip()) > 10]

        if not texts:
            return []

        try:
            return self._cluster_with_sklearn(texts, n_clusters)
        except ImportError:
            logger.warning("scikit-learn not available; falling back to keyword frequency clustering")
            return self._cluster_fallback(texts, n_clusters)

    @staticmethod
    def _cluster_with_sklearn(texts: list[str], n_clusters: int) -> list[dict]:
        from sklearn.cluster import KMeans
        from sklearn.feature_extraction.text import TfidfVectorizer

        actual_clusters = min(n_clusters, len(texts))
        if actual_clusters < 2:
            # Not enough documents to cluster meaningfully
            all_tokens = Counter()
            for t in texts:
                all_tokens.update(_tokenize(t))
            top_terms = [w for w, _ in all_tokens.most_common(10)]
            return [{"cluster_id": 0, "top_terms": top_terms, "mention_count": len(texts)}]

        vectorizer = TfidfVectorizer(
            max_features=5000,
            stop_words="english",
            max_df=0.85,
            min_df=2 if len(texts) > 10 else 1,
        )
        tfidf_matrix = vectorizer.fit_transform(texts)
        feature_names = vectorizer.get_feature_names_out()

        km = KMeans(n_clusters=actual_clusters, random_state=42, n_init=10)
        labels = km.fit_predict(tfidf_matrix)

        clusters: list[dict] = []
        for cid in range(actual_clusters):
            mask = labels == cid
            count = int(mask.sum())
            if count == 0:
                continue
            # Top terms by centroid weight
            centroid = km.cluster_centers_[cid]
            top_indices = centroid.argsort()[-10:][::-1]
            top_terms = [str(feature_names[i]) for i in top_indices]
            clusters.append({
                "cluster_id": cid,
                "top_terms": top_terms,
                "mention_count": count,
            })

        clusters.sort(key=lambda c: c["mention_count"], reverse=True)
        return clusters

    @staticmethod
    def _cluster_fallback(texts: list[str], n_clusters: int) -> list[dict]:
        """Simple keyword-frequency based pseudo-clustering."""
        word_counts: Counter = Counter()
        for text in texts:
            word_counts.update(_tokenize(text))

        top_words = [w for w, _ in word_counts.most_common(n_clusters * 5)]
        if not top_words:
            return []

        # Assign each text to a "cluster" based on its most frequent top keyword
        cluster_map: dict[str, list[str]] = {}
        unassigned: list[str] = []

        for text in texts:
            tokens = set(_tokenize(text))
            best_word = None
            for w in top_words:
                if w in tokens:
                    best_word = w
                    break
            if best_word:
                cluster_map.setdefault(best_word, []).append(text)
            else:
                unassigned.append(text)

        # Take the top n_clusters by size
        sorted_clusters = sorted(cluster_map.items(), key=lambda kv: len(kv[1]), reverse=True)[:n_clusters]

        results: list[dict] = []
        for idx, (keyword, cluster_texts) in enumerate(sorted_clusters):
            token_counter: Counter = Counter()
            for t in cluster_texts:
                token_counter.update(_tokenize(t))
            top_terms = [w for w, _ in token_counter.most_common(10)]
            results.append({
                "cluster_id": idx,
                "top_terms": top_terms,
                "mention_count": len(cluster_texts),
            })

        return results

    async def compute_topic_trends(
        self,
        session: AsyncSession,
        project_id: int,
        start: datetime,
        end: datetime,
    ) -> dict[str, list[dict]]:
        """Track daily occurrence counts for the most-used matched_keywords.

        Returns:
            Dict mapping each keyword to a list of ``{"date": ..., "count": ...}`` entries.
        """
        bucket_expr = func.strftime("%Y-%m-%d", Mention.collected_at)

        stmt = (
            select(
                Mention.matched_keywords,
                bucket_expr.label("day"),
                func.count().label("cnt"),
            )
            .where(
                Mention.project_id == project_id,
                Mention.collected_at >= start,
                Mention.collected_at <= end,
                Mention.matched_keywords.isnot(None),
            )
            .group_by(Mention.matched_keywords, bucket_expr)
            .order_by(bucket_expr)
        )

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            return {}

        # matched_keywords is comma-separated; split and aggregate
        keyword_day_counts: dict[str, Counter] = {}
        for row in rows:
            keywords_str = row.matched_keywords or ""
            day = row.day
            count = row.cnt
            for kw in keywords_str.split(","):
                kw = kw.strip()
                if not kw:
                    continue
                if kw not in keyword_day_counts:
                    keyword_day_counts[kw] = Counter()
                keyword_day_counts[kw][day] += count

        # Keep top 20 keywords by total volume
        keyword_totals = {kw: sum(dc.values()) for kw, dc in keyword_day_counts.items()}
        top_keywords = sorted(keyword_totals, key=keyword_totals.get, reverse=True)[:20]

        trends: dict[str, list[dict]] = {}
        for kw in top_keywords:
            daily = keyword_day_counts[kw]
            trends[kw] = [
                {"date": d, "count": c}
                for d, c in sorted(daily.items())
            ]

        logger.info("Computed topic trends for %d keywords in project %d", len(trends), project_id)
        return trends
