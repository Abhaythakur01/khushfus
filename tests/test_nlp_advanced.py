"""Advanced NLP tests for sarcasm detection, emotion, and aspect-based sentiment."""

import pytest

from src.nlp.analyzer import SentimentAnalyzer, detect_sarcasm


class TestSarcasmDetection:
    def test_explicit_sarcasm_tag(self):
        assert detect_sarcasm("Oh great, another update that breaks everything /s") is True

    def test_not_sarcasm(self):
        assert detect_sarcasm("This product is really good, I love it") is False

    def test_praise_in_quotes(self):
        assert detect_sarcasm('Their "amazing" support took three weeks to respond') is True

    def test_sarcastic_starter_with_negative(self):
        assert detect_sarcasm("Wow, what a terrible experience with this product") is True

    def test_excessive_exclamation_negative(self):
        assert detect_sarcasm("This is so great!!! The worst product ever") is True

    def test_plain_positive(self):
        assert detect_sarcasm("I genuinely enjoyed this product") is False

    def test_plain_negative(self):
        # Negative without sarcasm indicators
        assert detect_sarcasm("The product broke after one day") is False

    def test_intensifier_with_negative(self):
        assert detect_sarcasm("Really great how they managed to make it even worse and more useless") is True


class TestAnalyzerTopics:
    def test_customer_service_topic(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("The support team helped with my issue")
        assert "customer_service" in result.topics

    def test_product_topic(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("The product quality and features are outstanding")
        assert "product" in result.topics

    def test_technology_topic(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Their app and website platform are well designed")
        assert "technology" in result.topics

    def test_no_topics(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Hello world")
        assert result.topics == []


class TestAnalyzerEntityExtraction:
    def test_mentions(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Hey @alice and @bob check this out")
        handles = [e["value"] for e in result.entities if e["type"] == "mention"]
        assert "alice" in handles
        assert "bob" in handles

    def test_hashtags(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Check out #python and #coding trends")
        hashtags = [e["value"] for e in result.entities if e["type"] == "hashtag"]
        assert "python" in hashtags
        assert "coding" in hashtags

    def test_no_entities(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("A simple sentence without mentions or hashtags")
        assert result.entities == []


class TestAnalyzerLanguage:
    def test_english_detection(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("This is a perfectly normal English sentence about testing")
        assert result.language == "en"


class TestAnalyzerSarcasmIntegration:
    def test_sarcasm_in_analysis_result(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Oh great, another broken update /s")
        assert result.sarcasm is True

    def test_no_sarcasm_in_analysis_result(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("The product launch went well and customers are satisfied")
        assert result.sarcasm is False


class TestRegexAspects:
    def test_pricing_aspect(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects("The pricing is too expensive for what you get")
        aspect_names = [a["aspect"] for a in aspects]
        assert "pricing" in aspect_names

    def test_quality_aspect(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects("The quality of this product is excellent and durable")
        aspect_names = [a["aspect"] for a in aspects]
        assert "quality" in aspect_names

    def test_no_aspects(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects("Hello world")
        assert aspects == []


@pytest.mark.slow
class TestEmotionDetection:
    """Test emotion classification (requires model download)."""

    pass  # These tests require the transformer model to be downloaded


@pytest.mark.slow
class TestAspectSentiment:
    """Test aspect-based sentiment extraction."""

    pass  # These tests require API key or model availability
