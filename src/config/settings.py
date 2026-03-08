from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://khushfus:khushfus_dev@localhost:5432/khushfus"
    database_url_sync: str = "postgresql://khushfus:khushfus_dev@localhost:5432/khushfus"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # OpenSearch (env var kept as ELASTICSEARCH_URL for backward compatibility)
    elasticsearch_url: str = "http://localhost:9200"

    # Social Media API Keys
    twitter_bearer_token: str = ""
    twitter_api_key: str = ""
    twitter_api_secret: str = ""
    twitter_access_token: str = ""
    twitter_access_secret: str = ""

    facebook_app_id: str = ""
    facebook_app_secret: str = ""
    facebook_page_access_token: str = ""

    instagram_access_token: str = ""

    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_access_token: str = ""

    youtube_api_key: str = ""

    news_api_key: str = ""

    # GDELT (free, no key needed — placeholder for future config)
    gdelt_enabled: bool = True

    # Telegram (public channels only — no token needed)
    telegram_channels: str = ""  # comma-separated channel names, e.g. "channel1,channel2"

    # Web Scraper
    scraper_target_urls: str = ""  # comma-separated URLs to monitor

    # App
    secret_key: str = "change-me-in-production"
    environment: str = "development"
    log_level: str = "INFO"

    # NLP
    sentiment_model: str = "hybrid"  # vader, transformer, hybrid
    use_gpu: bool = False

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
