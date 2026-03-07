from src.nlp.analyzer import SentimentAnalyzer


def test_vader_positive():
    analyzer = SentimentAnalyzer()
    result = analyzer.analyze("This product is absolutely amazing! I love it so much!")
    assert result.sentiment == "positive"
    assert result.sentiment_score > 0


def test_vader_negative():
    analyzer = SentimentAnalyzer()
    result = analyzer.analyze("Terrible service, worst experience ever. Very disappointed.")
    assert result.sentiment == "negative"
    assert result.sentiment_score < 0


def test_vader_neutral():
    analyzer = SentimentAnalyzer()
    result = analyzer.analyze("The meeting is scheduled for 3pm tomorrow.")
    assert result.sentiment == "neutral"


def test_language_detection():
    analyzer = SentimentAnalyzer()
    result = analyzer.analyze("This is an English sentence about technology.")
    assert result.language == "en"


def test_entity_extraction_mentions():
    analyzer = SentimentAnalyzer()
    result = analyzer.analyze("Hey @johndoe check out #trending topic")
    handles = [e["value"] for e in result.entities if e["type"] == "mention"]
    hashtags = [e["value"] for e in result.entities if e["type"] == "hashtag"]
    assert "johndoe" in handles
    assert "trending" in hashtags


def test_topic_detection():
    analyzer = SentimentAnalyzer()
    result = analyzer.analyze("The customer support service was terrible and they didn't help at all")
    assert "customer_service" in result.topics
