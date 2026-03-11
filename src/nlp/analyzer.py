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

from shared.pii_masking import mask_pii
from src.config.settings import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model versioning — bump when model config or NLP logic changes
# ---------------------------------------------------------------------------
MODEL_VERSION = "1.2.0"

# Minimum text length for reliable language detection
MIN_TEXT_LENGTH_FOR_LANGDETECT = 20

# ---------------------------------------------------------------------------
# Configurable model names and thresholds (env vars)
# ---------------------------------------------------------------------------
NLP_SENTIMENT_MODEL = os.getenv(
    "NLP_SENTIMENT_MODEL",
    "cardiffnlp/twitter-roberta-base-sentiment-latest",
)
NLP_SPACY_MODEL = os.getenv("NLP_SPACY_MODEL", "en_core_web_sm")
NLP_EMOTION_MODEL = os.getenv(
    "NLP_EMOTION_MODEL",
    "j-hartmann/emotion-english-distilroberta-base",
)
NLP_CONFIDENCE_THRESHOLD = float(os.getenv("NLP_CONFIDENCE_THRESHOLD", "0.6"))

# ---------------------------------------------------------------------------
# Module-level model cache (singleton pattern — load once, reuse)
# ---------------------------------------------------------------------------
_MODEL_CACHE: dict = {}


def _get_device() -> int:
    """Return transformer device id: 0 for CUDA, -1 for CPU."""
    try:
        import torch

        if torch.cuda.is_available():
            logger.info("CUDA is available — using GPU (device=0)")
            return 0
    except ImportError:
        pass
    logger.info("Using CPU for transformer models (device=-1)")
    return -1


# ---------------------------------------------------------------------------
# Toxicity / content moderation (keyword-based baseline)
# ---------------------------------------------------------------------------

_TOXICITY_CATEGORIES: dict[str, list[str]] = {
    "hate_speech": [
        "racial slur", "go back to your country", "subhuman", "white power",
        "kill all", "ethnic cleansing", "gas the",
    ],
    "nsfw": [
        "porn", "xxx", "nsfw", "onlyfans", "nude", "explicit content",
    ],
    "threats": [
        "i will kill", "gonna kill", "death threat", "bomb threat",
        "i'll shoot", "going to hurt", "burn your house",
    ],
    "harassment": [
        "kill yourself", "kys", "you're worthless", "nobody loves you",
        "you should die", "ugly piece", "fat ugly", "dox",
    ],
}


def classify_toxicity(text: str) -> dict:
    """Keyword-based content moderation baseline.

    Returns ``{"is_flagged": bool, "categories": list[str], "confidence": float}``.
    Confidence is 1.0 when any keyword matches (exact-match approach).
    """
    text_lower = text.lower()
    flagged_categories: list[str] = []

    for category, keywords in _TOXICITY_CATEGORIES.items():
        for kw in keywords:
            if kw in text_lower:
                flagged_categories.append(category)
                break  # one match per category is enough

    return {
        "is_flagged": len(flagged_categories) > 0,
        "categories": flagged_categories,
        "confidence": 1.0 if flagged_categories else 0.0,
    }


# ---------------------------------------------------------------------------
# Sarcasm detection helpers — emoji sentiment mapping
# ---------------------------------------------------------------------------

_POSITIVE_EMOJIS = set("\U0001f600\U0001f603\U0001f604\U0001f601\U0001f606\U0001f60a\U0001f970\U0001f60d\U0001f929"
                       "\U0001f618\U0001f973\U0001f44f\U0001f389\U0001f4aa\U0001f44d\U0001f525\U0001f4af"
                       "\u2728\U0001f64c\u2764\ufe0f\U0001f495")
_NEGATIVE_EMOJIS = set("\U0001f622\U0001f62d\U0001f624\U0001f621\U0001f92c\U0001f631\U0001f628\U0001f480"
                       "\U0001f44e\U0001f595\U0001f612\U0001f61e\U0001f614\U0001f629\U0001f62b\U0001f92e"
                       "\U0001f637\U0001f494")


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
    moderation: dict = field(default_factory=dict)  # content moderation result
    model_version: str = MODEL_VERSION  # tracks NLP model configuration version


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
        """Tier 2: DeBERTa/RoBERTa sentiment pipeline (lazy loaded, cached)."""
        if self._transformer_pipeline is None:
            cache_key = f"sentiment:{NLP_SENTIMENT_MODEL}"
            if cache_key in _MODEL_CACHE:
                self._transformer_pipeline = _MODEL_CACHE[cache_key]
            else:
                try:
                    from transformers import pipeline as tf_pipeline

                    device = _get_device() if settings.use_gpu else -1
                    pipe = tf_pipeline(
                        "sentiment-analysis",
                        model=NLP_SENTIMENT_MODEL,
                        device=device,
                        truncation=True,
                        max_length=512,
                    )
                    _MODEL_CACHE[cache_key] = pipe
                    self._transformer_pipeline = pipe
                    logger.info("Transformer sentiment model loaded: %s", NLP_SENTIMENT_MODEL)
                except Exception as e:
                    logger.warning(f"Failed to load transformer sentiment model: {e}")
                    self._transformer_pipeline = False  # sentinel so we don't retry
        return self._transformer_pipeline if self._transformer_pipeline is not False else None

    @property
    def emotion_pipe(self):
        """Emotion classification pipeline (lazy loaded, cached)."""
        if self._emotion_pipeline is None:
            cache_key = f"emotion:{NLP_EMOTION_MODEL}"
            if cache_key in _MODEL_CACHE:
                self._emotion_pipeline = _MODEL_CACHE[cache_key]
            else:
                try:
                    from transformers import pipeline as tf_pipeline

                    device = _get_device() if settings.use_gpu else -1
                    pipe = tf_pipeline(
                        "text-classification",
                        model=NLP_EMOTION_MODEL,
                        top_k=None,
                        device=device,
                        truncation=True,
                        max_length=512,
                    )
                    _MODEL_CACHE[cache_key] = pipe
                    self._emotion_pipeline = pipe
                    logger.info("Emotion detection model loaded: %s", NLP_EMOTION_MODEL)
                except Exception as e:
                    logger.warning(f"Failed to load emotion model: {e}")
                    self._emotion_pipeline = False
        return self._emotion_pipeline if self._emotion_pipeline is not False else None

    @property
    def spacy_nlp(self):
        """spaCy NLP model (lazy loaded, cached)."""
        if self._spacy_nlp is None:
            cache_key = f"spacy:{NLP_SPACY_MODEL}"
            if cache_key in _MODEL_CACHE:
                self._spacy_nlp = _MODEL_CACHE[cache_key]
            else:
                try:
                    import spacy

                    nlp = spacy.load(NLP_SPACY_MODEL)
                    _MODEL_CACHE[cache_key] = nlp
                    self._spacy_nlp = nlp
                    logger.info("spaCy model loaded: %s", NLP_SPACY_MODEL)
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
        # --- PII masking (before any processing) ---
        text = mask_pii(text)

        language = self._detect_language(text)

        # --- Content moderation ---
        moderation = classify_toxicity(text)

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
            moderation=moderation,
            model_version=MODEL_VERSION,
        )

    def analyze_batch(self, texts: list[str], use_transformer: bool = False) -> list[AnalysisResult]:
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
                    if engagement > high_engagement_threshold and self.anthropic_client:
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
                    validated.append(
                        {
                            "aspect": str(a["aspect"]),
                            "sentiment": str(a.get("sentiment", "neutral")),
                            "score": float(a.get("score", 0.0)),
                        }
                    )
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
                results.append(
                    {
                        "aspect": aspect,
                        "sentiment": sentiment,
                        "score": round(compound, 4),
                    }
                )
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
        """Detect language of text. Returns 'unknown' for short or undetectable text."""
        if len(text.strip()) < MIN_TEXT_LENGTH_FOR_LANGDETECT:
            logger.debug(
                "Text too short for language detection (%d chars), returning 'unknown'",
                len(text.strip()),
            )
            return "unknown"
        try:
            return detect(text)
        except Exception:
            logger.warning(
                "Language detection failed for text (length=%d), returning 'unknown'",
                len(text),
            )
            return "unknown"


# ---------------------------------------------------------------------------
# Sarcasm Detection
# ---------------------------------------------------------------------------


# Compiled patterns for sarcasm detection (module-level for performance)
_ALL_CAPS_PATTERN = re.compile(r"(?:\b[A-Z]{2,}\b\s+){2,}\b[A-Z]{2,}\b")
_EXCESSIVE_PUNCTUATION_PATTERN = re.compile(r"[!?]{3,}")
_PRAISE_IN_QUOTES_PATTERN = re.compile(
    r'["\u201c](great|amazing|wonderful|fantastic|love|best|awesome|brilliant)["\u201d]',
)
_SARCASM_STARTERS_PATTERN = re.compile(
    r"\b(wow|oh great|oh wonderful|oh amazing|oh fantastic|sure|yeah right)\b",
)
_NEGATIVE_WORDS_PATTERN = re.compile(
    r"\b(terrible|awful|horrible|worst|hate|never|broken|fail|disaster|useless)\b",
)
_INTENSIFIER_POSITIVE_PATTERN = re.compile(
    r"\b(totally|really|so)\s+(great|amazing|wonderful|helpful|useful)\b",
)
_POSITIVE_WORDS_PATTERN = re.compile(
    r"\b(great|amazing|wonderful|love|best|awesome|fantastic|perfect|excellent)\b",
)


def detect_sarcasm(text: str) -> bool:
    """Heuristic sarcasm detection.

    Checks for common sarcasm indicators:
    - Quotation marks around typically positive words
    - "wow"/"great"/"amazing" combined with negative context words
    - Excessive exclamation marks with negative content
    - Explicit /s tag
    - ALL CAPS phrases (3+ consecutive capitalized words)
    - Excessive punctuation patterns (!!!, ???, !?!?, etc.)
    - Contradictory emoji patterns (positive text + negative emoji or vice versa)
    """
    text_lower = text.lower()

    # Explicit sarcasm tag
    if "/s" in text_lower:
        return True

    # ALL CAPS phrases (3+ consecutive ALL-CAPS words) — often sarcastic emphasis
    if _ALL_CAPS_PATTERN.search(text):
        return True

    # Excessive punctuation (3+ of ! or ? in a row) with positive words — sarcastic
    if _EXCESSIVE_PUNCTUATION_PATTERN.search(text) and _POSITIVE_WORDS_PATTERN.search(text_lower):
        return True

    # Contradictory emoji patterns: positive text + negative emoji or vice versa
    has_positive_emoji = any(ch in _POSITIVE_EMOJIS for ch in text)
    has_negative_emoji = any(ch in _NEGATIVE_EMOJIS for ch in text)
    if has_positive_emoji and has_negative_emoji:
        return True
    negative_words = _NEGATIVE_WORDS_PATTERN.search(text_lower)
    if has_positive_emoji and negative_words:
        return True
    positive_text = _POSITIVE_WORDS_PATTERN.search(text_lower)
    if has_negative_emoji and positive_text:
        return True

    # Quotation marks around praise words
    if _PRAISE_IN_QUOTES_PATTERN.search(text_lower):
        return True

    # Sarcastic "wow/oh great/oh wonderful" + negative context
    sarcasm_starters = _SARCASM_STARTERS_PATTERN.search(text_lower)
    if sarcasm_starters and negative_words:
        return True

    # Excessive exclamation marks (3+) with negative words
    if re.search(r"!{3,}", text) and negative_words:
        return True

    # "totally" or "really" + positive word + negative context
    intensifier_positive = _INTENSIFIER_POSITIVE_PATTERN.search(text_lower)
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
