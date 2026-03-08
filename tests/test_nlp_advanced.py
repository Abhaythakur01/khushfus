"""Advanced NLP tests: sarcasm detection, emotion, aspect-based sentiment,
NER, topic modeling, and the 3-tier sentiment escalation logic.

All heavy ML models (DeBERTa, spaCy, BERTopic, emotion pipeline, Anthropic)
are mocked so tests run without GPU, model downloads, or API keys.
"""

from unittest.mock import MagicMock, PropertyMock, patch

import pytest

from src.nlp.analyzer import AnalysisResult, SentimentAnalyzer, TopicModeler, detect_sarcasm

# ===========================================================================
# Sarcasm Detection
# ===========================================================================


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
        assert detect_sarcasm("The product broke after one day") is False

    def test_intensifier_with_negative(self):
        assert detect_sarcasm("Really great how they managed to make it even worse and more useless") is True

    def test_empty_text(self):
        assert detect_sarcasm("") is False

    def test_only_punctuation(self):
        assert detect_sarcasm("!!!???") is False

    def test_yeah_right_with_negative(self):
        assert detect_sarcasm("Yeah right, like that terrible thing would ever work") is True

    def test_oh_wonderful_with_negative(self):
        assert detect_sarcasm("Oh wonderful, the worst update they could have released") is True

    def test_quotes_around_best(self):
        assert detect_sarcasm('Their "best" effort resulted in total failure') is True

    def test_totally_great_with_negative(self):
        assert detect_sarcasm("Totally great how they made it even more useless and broken") is True

    def test_normal_exclamation(self):
        assert detect_sarcasm("Great product! I love it!") is False


# ===========================================================================
# Sarcasm integration in full analysis
# ===========================================================================


class TestAnalyzerSarcasmIntegration:
    def test_sarcasm_in_analysis_result(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("Oh great, another broken update /s")
        assert result.sarcasm is True

    def test_no_sarcasm_in_analysis_result(self):
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze("The product launch went well and customers are satisfied")
        assert result.sarcasm is False


# ===========================================================================
# Regex-Based Aspect Extraction
# ===========================================================================


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

    def test_service_aspect(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects("The staff were very friendly and polite")
        aspect_names = [a["aspect"] for a in aspects]
        assert "service" in aspect_names

    def test_support_aspect(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects("Customer support took forever to respond")
        aspect_names = [a["aspect"] for a in aspects]
        assert "support" in aspect_names

    def test_delivery_aspect(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects("The shipping was late and the package was damaged")
        aspect_names = [a["aspect"] for a in aspects]
        assert "delivery" in aspect_names

    def test_features_aspect(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects("The feature set and interface design are impressive")
        aspect_names = [a["aspect"] for a in aspects]
        assert "features" in aspect_names

    def test_no_aspects(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects("Hello world")
        assert aspects == []

    def test_multiple_aspects(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects(
            "The price is cheap but the quality is broken and delivery was late"
        )
        aspect_names = [a["aspect"] for a in aspects]
        assert "pricing" in aspect_names
        assert "quality" in aspect_names
        assert "delivery" in aspect_names

    def test_aspect_structure(self):
        analyzer = SentimentAnalyzer()
        aspects = analyzer._regex_aspects("The price is fair")
        for aspect in aspects:
            assert "aspect" in aspect
            assert "sentiment" in aspect
            assert "score" in aspect
            assert aspect["sentiment"] in ("positive", "negative", "neutral")
            assert isinstance(aspect["score"], float)

    def test_aspects_triggered_by_high_engagement(self):
        """Aspects are extracted when engagement exceeds threshold."""
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze(
            "The price is expensive but quality is great",
            engagement=200,
            high_engagement_threshold=100,
        )
        if result.aspects:
            aspect_names = [a["aspect"] for a in result.aspects]
            assert "pricing" in aspect_names or "quality" in aspect_names

    def test_aspects_not_triggered_by_low_engagement(self):
        """Aspects are not extracted when engagement is below threshold."""
        analyzer = SentimentAnalyzer()
        result = analyzer.analyze(
            "The price is expensive but quality is great",
            engagement=10,
            high_engagement_threshold=100,
        )
        assert result.aspects == []


# ===========================================================================
# Emotion Detection (mocked)
# ===========================================================================


class TestEmotionDetection:
    def test_emotions_returned_when_pipeline_available(self):
        """With a mocked emotion pipeline, verify emotions dict structure."""
        analyzer = SentimentAnalyzer()
        mock_results = [
            [
                {"label": "joy", "score": 0.85},
                {"label": "anger", "score": 0.05},
                {"label": "sadness", "score": 0.03},
                {"label": "fear", "score": 0.02},
                {"label": "surprise", "score": 0.02},
                {"label": "disgust", "score": 0.02},
                {"label": "neutral", "score": 0.01},
            ]
        ]
        analyzer._emotion_pipeline = MagicMock(return_value=mock_results)

        emotions = analyzer._detect_emotions("I am so happy today!")
        assert "joy" in emotions
        assert emotions["joy"] == 0.85
        assert len(emotions) == 7

    def test_emotions_empty_when_pipeline_unavailable(self):
        """Without the emotion pipeline, emotions should be empty."""
        analyzer = SentimentAnalyzer()
        analyzer._emotion_pipeline = False  # sentinel for unavailable
        emotions = analyzer._detect_emotions("Some text")
        assert emotions == {}

    def test_emotions_error_handling(self):
        """If the pipeline raises, emotions should be empty."""
        analyzer = SentimentAnalyzer()
        mock_pipe = MagicMock(side_effect=RuntimeError("model error"))
        analyzer._emotion_pipeline = mock_pipe
        emotions = analyzer._detect_emotions("Some text")
        assert emotions == {}

    def test_emotions_in_full_analysis(self):
        """Emotions appear in the full AnalysisResult."""
        analyzer = SentimentAnalyzer()
        mock_results = [
            [
                {"label": "anger", "score": 0.9},
                {"label": "joy", "score": 0.05},
                {"label": "sadness", "score": 0.02},
                {"label": "fear", "score": 0.01},
                {"label": "surprise", "score": 0.01},
                {"label": "disgust", "score": 0.005},
                {"label": "neutral", "score": 0.005},
            ]
        ]
        analyzer._emotion_pipeline = MagicMock(return_value=mock_results)
        result = analyzer.analyze("I am furious about this terrible product!")
        assert "anger" in result.emotions
        assert result.emotions["anger"] == 0.9


# ===========================================================================
# Named Entity Recognition (mocked spaCy)
# ===========================================================================


class TestNERExtraction:
    def _make_mock_nlp(self, entities):
        """Create a mock spaCy NLP model that returns given entities."""
        mock_doc = MagicMock()
        mock_ents = []
        for text, label in entities:
            ent = MagicMock()
            ent.text = text
            ent.label_ = label
            mock_ents.append(ent)
        mock_doc.ents = mock_ents
        mock_nlp = MagicMock(return_value=mock_doc)
        return mock_nlp

    def test_persons_extracted(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = self._make_mock_nlp([("Elon Musk", "PERSON")])
        ner = analyzer._extract_ner("Elon Musk announced a new product")
        assert "Elon Musk" in ner["persons"]

    def test_organizations_extracted(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = self._make_mock_nlp([("Apple", "ORG")])
        ner = analyzer._extract_ner("Apple released a new phone")
        assert "Apple" in ner["organizations"]

    def test_locations_extracted(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = self._make_mock_nlp([("New York", "GPE")])
        ner = analyzer._extract_ner("The event was in New York")
        assert "New York" in ner["locations"]

    def test_products_extracted(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = self._make_mock_nlp([("iPhone", "PRODUCT")])
        ner = analyzer._extract_ner("I bought an iPhone")
        assert "iPhone" in ner["products"]

    def test_events_extracted(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = self._make_mock_nlp([("CES 2025", "EVENT")])
        ner = analyzer._extract_ner("CES 2025 was amazing")
        assert "CES 2025" in ner["events"]

    def test_multiple_entities(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = self._make_mock_nlp([
            ("Tim Cook", "PERSON"),
            ("Apple", "ORG"),
            ("San Francisco", "GPE"),
        ])
        ner = analyzer._extract_ner("Tim Cook of Apple spoke in San Francisco")
        assert "Tim Cook" in ner["persons"]
        assert "Apple" in ner["organizations"]
        assert "San Francisco" in ner["locations"]

    def test_ner_empty_when_unavailable(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = False  # sentinel
        ner = analyzer._extract_ner("Some text")
        assert ner == {}

    def test_ner_error_handling(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = MagicMock(side_effect=RuntimeError("spacy error"))
        ner = analyzer._extract_ner("Some text")
        assert ner == {}

    def test_ner_deduplication(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = self._make_mock_nlp([
            ("Apple", "ORG"),
            ("Apple", "ORG"),
        ])
        ner = analyzer._extract_ner("Apple and Apple")
        assert ner["organizations"].count("Apple") == 1

    def test_ner_in_full_analysis(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = self._make_mock_nlp([("Google", "ORG")])
        result = analyzer.analyze("Google announced new features")
        assert "Google" in result.ner_entities.get("organizations", [])

    def test_unmapped_entity_type_ignored(self):
        analyzer = SentimentAnalyzer()
        analyzer._spacy_nlp = self._make_mock_nlp([("$100", "MONEY")])
        ner = analyzer._extract_ner("It costs $100")
        # MONEY is not in entity_map, so all lists should be empty
        for values in ner.values():
            assert "$100" not in values


# ===========================================================================
# Topic Modeler (BERTopic — mocked)
# ===========================================================================


class TestTopicModeler:
    def test_fit_topics_without_model(self):
        """Without BERTopic, fallback returns -1 for all texts."""
        modeler = TopicModeler()
        modeler._model = False  # simulate unavailable
        result = modeler.fit_topics(["text one", "text two", "text three"])
        assert result == [-1, -1, -1]

    def test_fit_topics_with_mock_model(self):
        modeler = TopicModeler()
        mock_model = MagicMock()
        mock_model.fit_transform.return_value = ([0, 1, 0], None)
        modeler._model = mock_model

        result = modeler.fit_topics(["text one", "text two", "text three"])
        assert result == [0, 1, 0]
        assert modeler._fitted is True

    def test_get_topic_label_not_fitted(self):
        modeler = TopicModeler()
        modeler._model = MagicMock()
        modeler._fitted = False
        assert modeler.get_topic_label("some text") == "unknown"

    def test_get_topic_label_fitted(self):
        modeler = TopicModeler()
        mock_model = MagicMock()
        mock_model.transform.return_value = ([0], None)
        mock_model.get_topic.return_value = [("machine", 0.5), ("learning", 0.3), ("ai", 0.2)]
        modeler._model = mock_model
        modeler._fitted = True

        label = modeler.get_topic_label("machine learning is great")
        assert label == "machine_learning_ai"

    def test_get_topic_label_outlier(self):
        modeler = TopicModeler()
        mock_model = MagicMock()
        mock_model.transform.return_value = ([-1], None)
        modeler._model = mock_model
        modeler._fitted = True

        assert modeler.get_topic_label("random text") == "unknown"

    def test_get_topic_info_not_fitted(self):
        modeler = TopicModeler()
        modeler._model = MagicMock()
        modeler._fitted = False
        assert modeler.get_topic_info() is None

    def test_get_topic_info_fitted(self):
        modeler = TopicModeler()
        mock_model = MagicMock()
        mock_df = MagicMock()
        mock_model.get_topic_info.return_value = mock_df
        modeler._model = mock_model
        modeler._fitted = True

        assert modeler.get_topic_info() is mock_df

    def test_fit_topics_error_handling(self):
        modeler = TopicModeler()
        mock_model = MagicMock()
        mock_model.fit_transform.side_effect = RuntimeError("BERTopic error")
        modeler._model = mock_model

        result = modeler.fit_topics(["a", "b"])
        assert result == [-1, -1]


# ===========================================================================
# 3-Tier Sentiment Escalation Logic
# ===========================================================================


class TestTieredSentiment:
    """Test the VADER -> Transformer -> Claude escalation logic."""

    def test_tier1_vader_only(self):
        """Without transformer or Claude, VADER (tier 1) is used."""
        analyzer = SentimentAnalyzer()
        # Ensure transformer and Claude are unavailable
        analyzer._transformer_pipeline = False
        analyzer._anthropic_client = None
        analyzer._anthropic_checked = True

        sentiment, score, tier = analyzer._tiered_sentiment("Great product!")
        assert tier == "vader"
        assert sentiment == "positive"

    def test_tier2_transformer_high_confidence(self):
        """Tier 2 transformer used when available and confidence is high."""
        analyzer = SentimentAnalyzer()

        mock_pipe = MagicMock()
        mock_pipe.return_value = [{"label": "positive", "score": 0.95}]
        analyzer._transformer_pipeline = mock_pipe
        analyzer._anthropic_client = None
        analyzer._anthropic_checked = True

        with patch.object(type(analyzer), "transformer", new_callable=PropertyMock, return_value=mock_pipe):
            sentiment, score, tier = analyzer._tiered_sentiment(
                "Great product!",
                use_transformer=True,
            )

        assert tier == "transformer"
        assert sentiment == "positive"
        assert score == pytest.approx(0.95)

    def test_tier2_transformer_low_confidence_no_claude(self):
        """Low confidence transformer with no Claude still returns transformer result."""
        analyzer = SentimentAnalyzer()

        mock_pipe = MagicMock()
        mock_pipe.return_value = [{"label": "neutral", "score": 0.4}]
        analyzer._transformer_pipeline = mock_pipe
        analyzer._anthropic_client = None
        analyzer._anthropic_checked = True

        with patch.object(type(analyzer), "transformer", new_callable=PropertyMock, return_value=mock_pipe):
            sentiment, score, tier = analyzer._tiered_sentiment(
                "Hmm okay",
                use_transformer=True,
            )

        assert tier == "transformer"
        assert sentiment == "neutral"

    def test_tier3_claude_on_low_confidence(self):
        """Low confidence transformer triggers Claude (tier 3)."""
        analyzer = SentimentAnalyzer()

        mock_pipe = MagicMock()
        mock_pipe.return_value = [{"label": "neutral", "score": 0.4}]
        analyzer._transformer_pipeline = mock_pipe

        mock_claude = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='{"sentiment": "negative", "score": -0.7}')]
        mock_claude.messages.create.return_value = mock_response
        analyzer._anthropic_client = mock_claude
        analyzer._anthropic_checked = True

        with patch.object(type(analyzer), "transformer", new_callable=PropertyMock, return_value=mock_pipe):
            with patch.object(
                type(analyzer), "anthropic_client",
                new_callable=PropertyMock, return_value=mock_claude,
            ):
                sentiment, score, tier = analyzer._tiered_sentiment(
                    "The situation is complicated",
                    use_transformer=True,
                )

        assert tier == "claude"
        assert sentiment == "negative"
        assert score == pytest.approx(-0.7)

    def test_tier3_claude_on_high_engagement(self):
        """High engagement with high-confidence transformer still triggers Claude."""
        analyzer = SentimentAnalyzer()

        mock_pipe = MagicMock()
        mock_pipe.return_value = [{"label": "positive", "score": 0.9}]
        analyzer._transformer_pipeline = mock_pipe

        mock_claude = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='{"sentiment": "positive", "score": 0.85}')]
        mock_claude.messages.create.return_value = mock_response
        analyzer._anthropic_client = mock_claude
        analyzer._anthropic_checked = True

        with patch.object(type(analyzer), "transformer", new_callable=PropertyMock, return_value=mock_pipe):
            with patch.object(
                type(analyzer), "anthropic_client",
                new_callable=PropertyMock, return_value=mock_claude,
            ):
                sentiment, score, tier = analyzer._tiered_sentiment(
                    "This went viral!",
                    use_transformer=True,
                    engagement=500,
                    high_engagement_threshold=100,
                )

        assert tier == "claude"

    def test_tier3_claude_failure_fallback_to_tier2(self):
        """If Claude fails, fall back to transformer result."""
        analyzer = SentimentAnalyzer()

        mock_pipe = MagicMock()
        mock_pipe.return_value = [{"label": "positive", "score": 0.55}]
        analyzer._transformer_pipeline = mock_pipe

        mock_claude = MagicMock()
        mock_claude.messages.create.side_effect = RuntimeError("API error")
        analyzer._anthropic_client = mock_claude
        analyzer._anthropic_checked = True

        with patch.object(type(analyzer), "transformer", new_callable=PropertyMock, return_value=mock_pipe):
            with patch.object(
                type(analyzer), "anthropic_client",
                new_callable=PropertyMock, return_value=mock_claude,
            ):
                sentiment, score, tier = analyzer._tiered_sentiment(
                    "Hmm this is tricky",
                    use_transformer=True,
                )

        # Low confidence (0.55 < 0.6) -> tries Claude -> fails -> returns transformer
        assert tier == "transformer"

    def test_transformer_unavailable_falls_to_vader(self):
        """When transformer returns None, VADER is used."""
        analyzer = SentimentAnalyzer()
        analyzer._transformer_pipeline = False
        analyzer._anthropic_client = None
        analyzer._anthropic_checked = True

        sentiment, score, tier = analyzer._tiered_sentiment("Nice day")
        assert tier == "vader"

    def test_vader_internal_scoring(self):
        """Test the internal _vader_sentiment method directly."""
        analyzer = SentimentAnalyzer()
        sentiment, score = analyzer._vader_sentiment("I love this!")
        assert sentiment == "positive"
        assert score > 0

        sentiment, score = analyzer._vader_sentiment("I hate this!")
        assert sentiment == "negative"
        assert score < 0

        sentiment, score = analyzer._vader_sentiment("The cat sat on the mat.")
        assert sentiment == "neutral"

    def test_transformer_label_mapping(self):
        """Test that LABEL_0/1/2 are correctly mapped."""
        analyzer = SentimentAnalyzer()

        for label, expected in [("LABEL_0", "negative"), ("LABEL_1", "neutral"), ("LABEL_2", "positive")]:
            mock_pipe = MagicMock()
            mock_pipe.return_value = [{"label": label, "score": 0.9}]
            analyzer._transformer_pipeline = mock_pipe
            result = analyzer._transformer_sentiment("test text")
            assert result is not None
            assert result[0] == expected


# ===========================================================================
# Claude Sentiment (mocked)
# ===========================================================================


class TestClaudeSentiment:
    def test_claude_sentiment_parses_json(self):
        analyzer = SentimentAnalyzer()
        mock_claude = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='{"sentiment": "negative", "score": -0.8}')]
        mock_claude.messages.create.return_value = mock_response
        analyzer._anthropic_client = mock_claude
        analyzer._anthropic_checked = True

        result = analyzer._claude_sentiment("This is terrible")
        assert result is not None
        assert result[0] == "negative"
        assert result[1] == pytest.approx(-0.8)

    def test_claude_sentiment_no_client(self):
        analyzer = SentimentAnalyzer()
        analyzer._anthropic_client = None
        analyzer._anthropic_checked = True
        assert analyzer._claude_sentiment("test") is None

    def test_claude_sentiment_api_error(self):
        analyzer = SentimentAnalyzer()
        mock_claude = MagicMock()
        mock_claude.messages.create.side_effect = Exception("API timeout")
        analyzer._anthropic_client = mock_claude
        analyzer._anthropic_checked = True

        result = analyzer._claude_sentiment("test")
        assert result is None

    def test_claude_sentiment_invalid_json(self):
        analyzer = SentimentAnalyzer()
        mock_claude = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="not json at all")]
        mock_claude.messages.create.return_value = mock_response
        analyzer._anthropic_client = mock_claude
        analyzer._anthropic_checked = True

        result = analyzer._claude_sentiment("test")
        assert result is None


# ===========================================================================
# Claude Aspect Analysis (mocked)
# ===========================================================================


class TestClaudeAspects:
    def test_claude_aspects_parses_json(self):
        analyzer = SentimentAnalyzer()
        mock_claude = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="""[
            {"aspect": "pricing", "sentiment": "negative", "score": -0.7},
            {"aspect": "quality", "sentiment": "positive", "score": 0.8}
        ]""")]
        mock_claude.messages.create.return_value = mock_response

        aspects = analyzer._claude_aspects("The price is high but quality is great", mock_claude)
        assert len(aspects) == 2
        assert aspects[0]["aspect"] == "pricing"
        assert aspects[1]["aspect"] == "quality"

    def test_analyze_aspects_prefers_claude(self):
        """analyze_aspects tries Claude first, then falls back to regex."""
        analyzer = SentimentAnalyzer()
        mock_claude = MagicMock()
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='[{"aspect": "ux", "sentiment": "positive", "score": 0.9}]')]
        mock_claude.messages.create.return_value = mock_response
        analyzer._anthropic_client = mock_claude
        analyzer._anthropic_checked = True

        with patch.object(
            type(analyzer), "anthropic_client",
            new_callable=PropertyMock, return_value=mock_claude,
        ):
            aspects = analyzer.analyze_aspects("Great user experience")

        assert len(aspects) == 1
        assert aspects[0]["aspect"] == "ux"

    def test_analyze_aspects_falls_back_to_regex(self):
        analyzer = SentimentAnalyzer()
        analyzer._anthropic_client = None
        analyzer._anthropic_checked = True

        with patch.object(
            type(analyzer), "anthropic_client",
            new_callable=PropertyMock, return_value=None,
        ):
            aspects = analyzer.analyze_aspects("The price is too expensive")

        aspect_names = [a["aspect"] for a in aspects]
        assert "pricing" in aspect_names


# ===========================================================================
# AnalysisResult dataclass
# ===========================================================================


class TestAnalysisResult:
    def test_defaults(self):
        result = AnalysisResult(
            sentiment="neutral",
            sentiment_score=0.0,
            language="en",
            topics=[],
            entities=[],
        )
        assert result.emotions == {}
        assert result.aspects == []
        assert result.ner_entities == {}
        assert result.sarcasm is False
        assert result.sentiment_tier == "vader"

    def test_all_fields(self):
        result = AnalysisResult(
            sentiment="positive",
            sentiment_score=0.85,
            language="en",
            topics=["product"],
            entities=[{"type": "mention", "value": "alice"}],
            emotions={"joy": 0.9},
            aspects=[{"aspect": "quality", "sentiment": "positive", "score": 0.8}],
            ner_entities={"persons": ["Alice"]},
            sarcasm=False,
            sentiment_tier="transformer",
        )
        assert result.sentiment == "positive"
        assert result.emotions["joy"] == 0.9
        assert result.sentiment_tier == "transformer"


# ===========================================================================
# Full analysis integration (with mocked heavy models)
# ===========================================================================


class TestFullAnalysisIntegration:
    def _make_analyzer_with_mocks(self):
        """Create an analyzer with all heavy models mocked."""
        analyzer = SentimentAnalyzer()
        # Disable transformer
        analyzer._transformer_pipeline = False
        # Disable emotion
        analyzer._emotion_pipeline = False
        # Disable spaCy
        analyzer._spacy_nlp = False
        # Disable Claude
        analyzer._anthropic_client = None
        analyzer._anthropic_checked = True
        return analyzer

    def test_full_analysis_returns_correct_type(self):
        analyzer = self._make_analyzer_with_mocks()
        result = analyzer.analyze("Great product, I love the customer support")
        assert isinstance(result, AnalysisResult)

    def test_full_analysis_with_entities(self):
        analyzer = self._make_analyzer_with_mocks()
        result = analyzer.analyze("@alice said #python is great")
        assert len(result.entities) == 2

    def test_full_analysis_with_topics(self):
        analyzer = self._make_analyzer_with_mocks()
        result = analyzer.analyze("The product quality and support team are excellent")
        assert "product" in result.topics
        assert "customer_service" in result.topics

    def test_full_analysis_with_sarcasm(self):
        analyzer = self._make_analyzer_with_mocks()
        result = analyzer.analyze('Their "amazing" service was the worst experience /s')
        assert result.sarcasm is True

    def test_full_analysis_empty_text(self):
        analyzer = self._make_analyzer_with_mocks()
        result = analyzer.analyze("")
        assert isinstance(result, AnalysisResult)
        assert result.entities == []
        assert result.topics == []

    def test_full_analysis_unicode_text(self):
        analyzer = self._make_analyzer_with_mocks()
        result = analyzer.analyze("Great product! \U0001f60d Highly recommended \u2764\ufe0f")
        assert isinstance(result, AnalysisResult)
        assert result.sentiment in ("positive", "negative", "neutral", "mixed")

    def test_full_analysis_special_characters(self):
        analyzer = self._make_analyzer_with_mocks()
        result = analyzer.analyze("Price: $99.99! <sale> & 50% off => great deal")
        assert isinstance(result, AnalysisResult)
