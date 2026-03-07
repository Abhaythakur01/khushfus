"""
NLP Analysis Pipeline for KhushFus.

Tiered sentiment analysis (VADER -> DeBERTa/RoBERTa -> Claude API),
aspect-based sentiment, NER via spaCy, emotion detection,
topic modeling via BERTopic, and sarcasm detection.

All model loading is lazy to avoid startup crashes if models aren't downloaded.
"""

import json
import logging
import os
import re
from dataclasses import dataclass, field

from langdetect import detect
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from src.config.settings import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class AnalysisResult:
    sentiment: str  # positive, negative, neutral, mixed
    sentiment_score: float  # -1.0 to 1.0
    language: str
    topics: list[str]
    entities: list[dict]
    emotions: dict = field(default_factory=dict)  # emotion -> score
    aspects: list[dict] = field(default_factory=list)  # aspect-based sentiment
    ner_entities: dict = field(default_factory=dict)  # structured NER output
    sarcasm: bool = False
    sentiment_tier: str = "vader"  # which tier produced the sentiment


# ---------------------------------------------------------------------------
# Sentiment Analyzer (tiered)
# ---------------------------------------------------------------------------

class SentimentAnalyzer:
    """Tiered sentiment analyzer with emotion detection, NER, aspects, topics."""

    def __init__(self):
        self.vader = SentimentIntensityAnalyzer()
        self._transformer_pipeline = None
        self._emotion_pipeline = None
        self._spacy_nlp = None
        self._topic_modeler: TopicModeler | None = None
        self._anthropic_client = None
        self._anthropic_checked = False

    # ------------------------------------------------------------------
    # Lazy loaders
    # ------------------------------------------------------------------

    @property
    def transformer(self):
        """Tier 2: DeBERTa/RoBERTa sentiment pipeline (lazy loaded)."""
        if self._transformer_pipeline is None:
            try:
                from transformers import pipeline as tf_pipeline

                device = 0 if settings.use_gpu else -1
                self._transformer_pipeline = tf_pipeline(
                    "sentiment-analysis",
                    model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                    device=device,
                    truncation=True,
                    max_length=512,
                )
                logger.info("Transformer sentiment model loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load transformer sentiment model: {e}")
                self._transformer_pipeline = False  # sentinel so we don't retry
        return self._transformer_pipeline if self._transformer_pipeline is not False else None

    @property
    def emotion_pipe(self):
        """Emotion classification pipeline (lazy loaded)."""
        if self._emotion_pipeline is None:
            try:
                from transformers import pipeline as tf_pipeline

                device = 0 if settings.use_gpu else -1
                self._emotion_pipeline = tf_pipeline(
                    "text-classification",
                    model="j-hartmann/emotion-english-distilroberta-base",
                    top_k=None,
                    device=device,
                    truncation=True,
                    max_length=512,
                )
                logger.info("Emotion detection model loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load emotion model: {e}")
                self._emotion_pipeline = False
        return self._emotion_pipeline if self._emotion_pipeline is not False else None

    @property
    def spacy_nlp(self):
        """spaCy NLP model (lazy loaded)."""
        if self._spacy_nlp is None:
            try:
                import spacy

                self._spacy_nlp = spacy.load("en_core_web_sm")
                logger.info("spaCy en_core_web_sm model loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load spaCy model: {e}")
                self._spacy_nlp = False
        return self._spacy_nlp if self._spacy_nlp is not False else None

    @property
    def anthropic_client(self):
        """Claude API client (lazy loaded)."""
        if not self._anthropic_checked:
            self._anthropic_checked = True
            api_key = os.getenv("ANTHROPIC_API_KEY", "")
            if api_key:
                try:
                    import anthropic

                    self._anthropic_client = anthropic.Anthropic(api_key=api_key)
                    logger.info("Anthropic client initialized for Tier 3 sentiment")
                except Exception as e:
                    logger.warning(f"Failed to initialize Anthropic client: {e}")
        return self._anthropic_client

    @property
    def topic_modeler(self) -> "TopicModeler":
        if self._topic_modeler is None:
            self._topic_modeler = TopicModeler()
        return self._topic_modeler

    # ------------------------------------------------------------------
    # Main analysis entry points
    # ------------------------------------------------------------------

    def analyze(
        self,
        text: str,
        use_transformer: bool = False,
        engagement: int = 0,
        high_engagement_threshold: int = 100,
    ) -> AnalysisResult:
        """Full NLP analysis on a single text.

        Args:
            text: The text to analyze.
            use_transformer: Force Tier 2 transformer sentiment.
            engagement: Sum of likes+shares+comments for this mention.
            high_engagement_threshold: Threshold above which Tier 3 triggers.
        """
        language = self._detect_language(text)

        # --- Tiered Sentiment ---
        sentiment, score, tier = self._tiered_sentiment(
            text,
            use_transformer=use_transformer,
            engagement=engagement,
            high_engagement_threshold=high_engagement_threshold,
        )

        # --- Topics ---
        topics = self._extract_topics(text)

        # --- Legacy entity extraction (mentions/hashtags) ---
        entities = self._extract_entities_legacy(text)

        # --- Emotion detection ---
        emotions = self._detect_emotions(text)

        # --- NER ---
        ner_entities = self._extract_ner(text)

        # --- Sarcasm ---
        sarcasm = detect_sarcasm(text)

        # --- Aspects (only for high engagement or on demand) ---
        aspects: list[dict] = []
        if engagement > high_engagement_threshold:
            aspects = self.analyze_aspects(text)

        return AnalysisResult(
            sentiment=sentiment,
            sentiment_score=score,
            language=language,
            topics=topics,
            entities=entities,
            emotions=emotions,
            aspects=aspects,
            ner_entities=ner_entities,
            sarcasm=sarcasm,
            sentiment_tier=tier,
        )

    def analyze_batch(
        self, texts: list[str], use_transformer: bool = False
    ) -> list[AnalysisResult]:
        return [self.analyze(text, use_transformer) for text in texts]

    # ------------------------------------------------------------------
    # Tiered sentiment
    # ------------------------------------------------------------------

    def _tiered_sentiment(
        self,
        text: str,
        use_transformer: bool = False,
        engagement: int = 0,
        high_engagement_threshold: int = 100,
    ) -> tuple[str, float, str]:
        """Return (sentiment_label, score, tier_name)."""

        # Tier 1: VADER (always available)
        vader_sentiment, vader_score = self._vader_sentiment(text)

        # Tier 2: Transformer
        if use_transformer or settings.sentiment_model in ("transformer", "hybrid"):
            t2_result = self._transformer_sentiment(text)
            if t2_result is not None:
                t2_sentiment, t2_score, t2_confidence = t2_result

                # If confidence is high enough, use Tier 2
                if t2_confidence >= 0.6:
                    # Check if Tier 3 should kick in for high-engagement
                    if (
                        engagement > high_engagement_threshold
                        and self.anthropic_client
                    ):
                        t3 = self._claude_sentiment(text)
                        if t3 is not None:
                            return t3[0], t3[1], "claude"

                    return t2_sentiment, t2_score, "transformer"

                # Low confidence -> try Tier 3 if available
                if self.anthropic_client:
                    t3 = self._claude_sentiment(text)
                    if t3 is not None:
                        return t3[0], t3[1], "claude"

                # Still return Tier 2 even with low confidence (better than VADER)
                return t2_sentiment, t2_score, "transformer"

        return vader_sentiment, vader_score, "vader"

    # ------------------------------------------------------------------
    # Tier 1: VADER
    # ------------------------------------------------------------------

    def _vader_sentiment(self, text: str) -> tuple[str, float]:
        scores = self.vader.polarity_scores(text)
        compound = scores["compound"]

        if compound >= 0.05:
            sentiment = "positive"
        elif compound <= -0.05:
            sentiment = "negative"
        else:
            sentiment = "neutral"

        # Detect mixed sentiment
        if scores["pos"] > 0.2 and scores["neg"] > 0.2:
            sentiment = "mixed"

        return sentiment, compound

    # ------------------------------------------------------------------
    # Tier 2: Transformer (RoBERTa)
    # ------------------------------------------------------------------

    def _transformer_sentiment(self, text: str) -> tuple[str, float, float] | None:
        """Returns (label, score, confidence) or None if unavailable."""
        pipe = self.transformer
        if pipe is None:
            return None

        try:
            result = pipe(text)[0]
            label = result["label"]
            confidence = result["score"]

            # Map LABEL_0/1/2 or named labels
            label_mapping = {
                "LABEL_0": "negative",
                "LABEL_1": "neutral",
                "LABEL_2": "positive",
                "negative": "negative",
                "neutral": "neutral",
                "positive": "positive",
            }

            sentiment = label_mapping.get(label, "neutral")

            # Convert to -1..1 score
            score_map = {
                "positive": confidence,
                "negative": -confidence,
                "neutral": 0.0,
            }
            score = score_map.get(sentiment, 0.0)

            return sentiment, score, confidence
        except Exception as e:
            logger.warning(f"Transformer sentiment failed: {e}")
            return None

    # ------------------------------------------------------------------
    # Tier 3: Claude API
    # ------------------------------------------------------------------

    def _claude_sentiment(self, text: str) -> tuple[str, float] | None:
        """Use Claude for nuanced sentiment analysis."""
        client = self.anthropic_client
        if client is None:
            return None

        try:
            prompt = (
                "Analyze the sentiment of the following text. "
                "Respond with ONLY a JSON object: "
                '{"sentiment": "positive"|"negative"|"neutral"|"mixed", '
                '"score": <float from -1.0 to 1.0>}\n\n'
                f"Text: {text[:2000]}"
            )

            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}],
            )

            raw = response.content[0].text.strip()
            # Extract JSON from response
            json_match = re.search(r"\{.*\}", raw, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return data.get("sentiment", "neutral"), float(data.get("score", 0.0))
        except Exception as e:
            logger.warning(f"Claude sentiment analysis failed: {e}")

        return None

    # ------------------------------------------------------------------
    # Aspect-Based Sentiment
    # ------------------------------------------------------------------

    def analyze_aspects(self, text: str) -> list[dict]:
        """Extract aspects and their individual sentiments.

        Returns:
            List of dicts: [{"aspect": str, "sentiment": str, "score": float}, ...]
        """
        # Try Claude API first
        client = self.anthropic_client
        if client is not None:
            try:
                return self._claude_aspects(text, client)
            except Exception as e:
                logger.warning(f"Claude aspect analysis failed, using fallback: {e}")

        # Fallback: regex-based aspect extraction with VADER scoring
        return self._regex_aspects(text)

    def _claude_aspects(self, text: str, client) -> list[dict]:
        prompt = (
            "Extract aspects and their sentiments from this text. "
            "Return ONLY a JSON array of objects with keys: "
            '"aspect" (string), "sentiment" ("positive"|"negative"|"neutral"|"mixed"), '
            '"score" (float from -1.0 to 1.0).\n\n'
            f"Text: {text[:2000]}"
        )

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = response.content[0].text.strip()
        json_match = re.search(r"\[.*\]", raw, re.DOTALL)
        if json_match:
            aspects = json.loads(json_match.group())
            # Validate structure
            validated = []
            for a in aspects:
                if isinstance(a, dict) and "aspect" in a:
                    validated.append({
                        "aspect": str(a["aspect"]),
                        "sentiment": str(a.get("sentiment", "neutral")),
                        "score": float(a.get("score", 0.0)),
                    })
            return validated
        return []

    def _regex_aspects(self, text: str) -> list[dict]:
        """Fallback: extract common aspects using regex and score with VADER."""
        aspect_patterns = {
            "pricing": r"\b(price|pricing|cost|expensive|cheap|afford|value)\b",
            "quality": r"\b(quality|durable|broke|broken|defect|reliable|sturdy)\b",
            "service": r"\b(service|staff|employee|rude|polite|helpful|friendly)\b",
            "support": r"\b(support|help desk|ticket|response time|customer care)\b",
            "delivery": r"\b(delivery|shipping|arrived|package|dispatch|late)\b",
            "features": r"\b(feature|functionality|option|capability|interface|design)\b",
        }

        text_lower = text.lower()
        results = []
        for aspect, pattern in aspect_patterns.items():
            if re.search(pattern, text_lower):
                # Use VADER on the full text as a rough proxy
                scores = self.vader.polarity_scores(text)
                compound = scores["compound"]
                if compound >= 0.05:
                    sentiment = "positive"
                elif compound <= -0.05:
                    sentiment = "negative"
                else:
                    sentiment = "neutral"
                results.append({
                    "aspect": aspect,
                    "sentiment": sentiment,
                    "score": round(compound, 4),
                })
        return results

    # ------------------------------------------------------------------
    # Emotion Detection
    # ------------------------------------------------------------------

    def _detect_emotions(self, text: str) -> dict:
        """Detect emotions using transformer model.

        Returns dict mapping emotion name -> confidence score.
        """
        pipe = self.emotion_pipe
        if pipe is None:
            return {}

        try:
            results = pipe(text)
            if results and isinstance(results, list):
                # top_k=None returns list of lists; take first item
                emotions_list = results[0] if isinstance(results[0], list) else results
                return {
                    item["label"]: round(item["score"], 4)
                    for item in emotions_list
                    if isinstance(item, dict)
                }
        except Exception as e:
            logger.warning(f"Emotion detection failed: {e}")

        return {}

    # ------------------------------------------------------------------
    # Named Entity Recognition (spaCy)
    # ------------------------------------------------------------------

    def _extract_ner(self, text: str) -> dict:
        """Extract named entities using spaCy.

        Returns structured dict:
        {"persons": [...], "organizations": [...], "locations": [...], "products": [...]}
        """
        nlp = self.spacy_nlp
        if nlp is None:
            return {}

        try:
            doc = nlp(text[:10000])  # limit length for performance
            entity_map = {
                "PERSON": "persons",
                "ORG": "organizations",
                "GPE": "locations",
                "PRODUCT": "products",
                "EVENT": "events",
            }
            result: dict[str, list[str]] = {v: [] for v in entity_map.values()}

            for ent in doc.ents:
                key = entity_map.get(ent.label_)
                if key and ent.text not in result[key]:
                    result[key].append(ent.text)

            return result
        except Exception as e:
            logger.warning(f"NER extraction failed: {e}")
            return {}

    # ------------------------------------------------------------------
    # Legacy entity extraction (mentions / hashtags)
    # ------------------------------------------------------------------

    def _extract_entities_legacy(self, text: str) -> list[dict]:
        entities = []
        mentions = re.findall(r"@(\w+)", text)
        for m in mentions:
            entities.append({"type": "mention", "value": m})

        hashtags = re.findall(r"#(\w+)", text)
        for h in hashtags:
            entities.append({"type": "hashtag", "value": h})

        return entities

    # ------------------------------------------------------------------
    # Topic extraction (keyword fallback)
    # ------------------------------------------------------------------

    def _extract_topics(self, text: str) -> list[str]:
        """Keyword-based topic extraction (used when BERTopic is unavailable)."""
        topic_keywords = {
            "customer_service": ["support", "help", "issue", "problem", "complaint", "service"],
            "product": ["product", "feature", "quality", "price", "buy", "purchase"],
            "brand": ["brand", "company", "reputation", "trust"],
            "policy": ["policy", "government", "regulation", "law", "rule"],
            "technology": ["tech", "digital", "app", "website", "platform", "online"],
        }

        text_lower = text.lower()
        detected = []
        for topic, keywords in topic_keywords.items():
            if any(kw in text_lower for kw in keywords):
                detected.append(topic)

        return detected

    # ------------------------------------------------------------------
    # Language detection
    # ------------------------------------------------------------------

    def _detect_language(self, text: str) -> str:
        try:
            return detect(text)
        except Exception:
            return "en"


# ---------------------------------------------------------------------------
# Sarcasm Detection
# ---------------------------------------------------------------------------

def detect_sarcasm(text: str) -> bool:
    """Heuristic sarcasm detection.

    Checks for common sarcasm indicators:
    - Quotation marks around typically positive words
    - "wow"/"great"/"amazing" combined with negative context words
    - Excessive exclamation marks with negative content
    - Explicit /s tag
    """
    text_lower = text.lower()

    # Explicit sarcasm tag
    if "/s" in text_lower:
        return True

    # Quotation marks around praise words
    praise_in_quotes = re.search(
        r'["\u201c](great|amazing|wonderful|fantastic|love|best|awesome|brilliant)["\u201d]',
        text_lower,
    )
    if praise_in_quotes:
        return True

    # Sarcastic "wow/oh great/oh wonderful" + negative context
    sarcasm_starters = re.search(
        r"\b(wow|oh great|oh wonderful|oh amazing|oh fantastic|sure|yeah right)\b",
        text_lower,
    )
    negative_words = re.search(
        r"\b(terrible|awful|horrible|worst|hate|never|broken|fail|disaster|useless)\b",
        text_lower,
    )
    if sarcasm_starters and negative_words:
        return True

    # Excessive exclamation marks (3+) with negative words
    if re.search(r"!{3,}", text) and negative_words:
        return True

    # "totally" or "really" + positive word + negative context
    intensifier_positive = re.search(
        r"\b(totally|really|so)\s+(great|amazing|wonderful|helpful|useful)\b",
        text_lower,
    )
    if intensifier_positive and negative_words:
        return True

    return False


# ---------------------------------------------------------------------------
# Topic Modeler (BERTopic)
# ---------------------------------------------------------------------------

class TopicModeler:
    """BERTopic-based topic modeling with keyword extraction fallback."""

    def __init__(self):
        self._model = None
        self._fitted = False

    @property
    def model(self):
        if self._model is None:
            try:
                from bertopic import BERTopic

                self._model = BERTopic(verbose=False)
                logger.info("BERTopic model initialized")
            except Exception as e:
                logger.warning(f"BERTopic not available, using keyword fallback: {e}")
                self._model = False
        return self._model if self._model is not False else None

    def fit_topics(self, texts: list[str]) -> list[int]:
        """Cluster texts into topics. Returns list of topic IDs per text.

        -1 means outlier / no topic assigned.
        """
        m = self.model
        if m is None:
            # Fallback: return -1 for all (no clustering)
            return [-1] * len(texts)

        try:
            topics, _ = m.fit_transform(texts)
            self._fitted = True
            return topics
        except Exception as e:
            logger.warning(f"BERTopic fit_topics failed: {e}")
            return [-1] * len(texts)

    def get_topic_label(self, text: str) -> str:
        """Assign a single text to the nearest existing topic.

        Returns a human-readable topic label or 'unknown'.
        """
        m = self.model
        if m is None or not self._fitted:
            return "unknown"

        try:
            topics, _ = m.transform([text])
            topic_id = topics[0]
            if topic_id == -1:
                return "unknown"
            info = m.get_topic(topic_id)
            if info:
                # info is a list of (word, weight) tuples
                return "_".join(word for word, _ in info[:3])
            return f"topic_{topic_id}"
        except Exception as e:
            logger.warning(f"BERTopic get_topic_label failed: {e}")
            return "unknown"

    def get_topic_info(self):
        """Return topic info DataFrame if model is fitted."""
        m = self.model
        if m is None or not self._fitted:
            return None
        try:
            return m.get_topic_info()
        except Exception:
            return None
