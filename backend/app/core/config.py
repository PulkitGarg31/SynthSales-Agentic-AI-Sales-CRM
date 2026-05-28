from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # App
    app_name: str = "Reachly API"
    environment: str = "development"
    cors_origins: str = "http://localhost:3000"

    # Security
    secret_key: str = "dev-secret-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # Database
    database_url: str = (
        "postgresql+psycopg://reachly:reachly_dev_pw@localhost:5432/reachly"
    )

    # AI provider selection.
    # `ai_providers` is a comma-separated priority list with automatic failover
    # on rate-limit errors, e.g. "gemini,groq,openrouter". If left blank,
    # `ai_provider` picks a single backend; "auto" prefers any with a key
    # (gemini → groq → openrouter).
    ai_providers: str = ""
    ai_provider: str = "auto"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct:free"

    # Email verification (paid layer — optional; the free MX/syntax layer always runs).
    # ZeroBounce is preferred; Verifalia is supported as an alternative.
    zerobounce_api_key: str = ""
    verifalia_username: str = ""
    verifalia_password: str = ""

    # Email
    gmail_credentials_file: str = ""
    gmail_token_file: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from: str = "Reachly <no-reply@reachly.example>"

    # Automation
    followup_interval_minutes: int = 15
    enable_scheduler: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def ai_providers_list(self) -> list[str]:
        return [p.strip().lower() for p in self.ai_providers.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
