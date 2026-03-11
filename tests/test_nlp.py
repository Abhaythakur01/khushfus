"""Tests for the NLP analysis pipeline — VADER sentiment, language detection,
entity extraction, and topic detection.

All heavy ML models (DeBERTa, spaCy, BERTopic, emotion pipeline) are mocked
so tests run without GPU or model downloads.
"""

from src.nlp.analyzer import SentimentAnalyzer

# ---------------------------------------------------------------------------
# VADER Sentiment (Tier 1)
# ---------------------------------------------------------------------------


class TestVaderSentiment:
    def test_positive(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("This product is absolutely amazing! I love it so much!")
        assert result.sentiment == "positive"
        assert result.sentiment_score > 0

    def test_negative(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Terrible service, worst experience ever. Very disappointed.")
        assert result.sentiment == "negative"
        assert result.sentiment_score < 0

    def test_neutral(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("The meeting is scheduled for 3pm tomorrow.")
        assert result.sentiment == "neutral"

    def test_mixed_sentiment(self):
        analyzer = SentimentAnalyzer()
        # Text with strong positive AND negative words -> mixed
        result = analyzer.analyze(
            "The product is absolutely amazing and wonderful but the service is terrible and awful."
        )
        assert result.sentiment == "mixed"

    def test_empty_text(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("")
        assert result.sentiment in ("neutral", "positive", "negative", "mixed")
        assert isinstance(result.sentiment_score, float)

    def test_very_long_text(self):
        analyzer = SentimentAnalyzer()
        long_text = "I love this product. " * 500
        result = analyzer.analyze(long_text)
        assert result.sentiment == "positive"
        assert result.sentiment_score > 0

    def test_single_word_positive(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Excellent!")
        assert result.sentiment == "positive"

    def test_single_word_negative(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Terrible!")
        assert result.sentiment == "negative"

    def test_sentiment_tier_is_vader_by_default(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Good product")
        assert result.sentiment_tier == "vader"


# ---------------------------------------------------------------------------
# Language Detection
# ---------------------------------------------------------------------------


class TestLanguageDetection:
    def test_english(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("This is an English sentence about technology.")
        assert result.language == "en"

    def test_empty_text_defaults_unknown(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("")
        # Empty text is too short for detection; returns "unknown"
        assert result.language == "unknown"

    def test_short_text(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("ok")
        # Short text may not be reliably detected but should not crash
        assert isinstance(result.language, str)
        assert len(result.language) >= 2


# ---------------------------------------------------------------------------
# Entity Extraction (mentions / hashtags)
# ---------------------------------------------------------------------------


class TestEntityExtraction:
    def test_mentions(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Hey @johndoe check out #trending topic")
        handles = [e["value"] for e in result.entities if e["type"] == "mention"]
        hashtags = [e["value"] for e in result.entities if e["type"] == "hashtag"]
        assert "johndoe" in handles
        assert "trending" in hashtags

    def test_multiple_mentions(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Hey @alice and @bob check this out")
        handles = [e["value"] for e in result.entities if e["type"] == "mention"]
        assert "alice" in handles
        assert "bob" in handles

    def test_multiple_hashtags(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Check out #python and #coding trends")
        hashtags = [e["value"] for e in result.entities if e["type"] == "hashtag"]
        assert "python" in hashtags
        assert "coding" in hashtags

    def test_no_entities(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("A simple sentence without mentions or hashtags")
        assert result.entities == []

    def test_entity_structure(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Hello @world")
        for entity in result.entities:
            assert "type" in entity
            assert "value" in entity
            assert entity["type"] in ("mention", "hashtag")

    def test_empty_text_no_entities(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("")
        assert result.entities == []


# ---------------------------------------------------------------------------
# Topic Detection (keyword-based)
# ---------------------------------------------------------------------------


class TestTopicDetection:
    def test_customer_service_topic(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("The customer support service was terrible and they didn't help at all")
        assert "customer_service" in result.topics

    def test_product_topic(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("The product quality and features are outstanding")
        assert "product" in result.topics

    def test_technology_topic(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Their app and website platform are well designed")
        assert "technology" in result.topics

    def test_brand_topic(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("The company brand and reputation are top-notch")
        assert "brand" in result.topics

    def test_policy_topic(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("New government regulation and policy changes")
        assert "policy" in result.topics

    def test_no_topics(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Hello world")
        assert result.topics == []

    def test_multiple_topics(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze(
            "The company brand has great product features and excellent support service"
        )
        assert "brand" in result.topics
        assert "product" in result.topics
        assert "customer_service" in result.topics


# ---------------------------------------------------------------------------
# Batch analysis
# ---------------------------------------------------------------------------


class TestBatchAnalysis:
    def test_batch_returns_list(self):
        analyzer = SentimentAnalyzer()
        results = analyzer.analyze_batch(["Good product", "Bad service", "Hello"])
        assert len(results) == 3

    def test_batch_empty(self):
        analyzer = SentimentAnalyzer()
        results = analyzer.analyze_batch([])
        assert results == []

    def test_batch_sentiments_vary(self):
        analyzer = SentimentAnalyzer()
        results = analyzer.analyze_batch(["Amazing!", "Terrible!", "The time is noon."])
        sentiments = [r.sentiment for r in results]
        assert "positive" in sentiments
        assert "negative" in sentiments
