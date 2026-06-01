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

    # Google OAuth (sign-in / sign-up). Optional: leave the id/secret blank to
    # disable — the "Continue with Google" button hides and the OAuth routes
    # 404. `frontend_url` is where the backend redirects the SPA after a
    # successful callback.
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://127.0.0.1:8000/api/auth/google/callback"
    frontend_url: str = "http://localhost:3000"

    # Automation
    followup_interval_minutes: int = 15
    enable_scheduler: bool = True

    # Comma-separated list of emails that should be auto-granted the admin
    # role. Applied at startup (sweeps existing users) and when a new user
    # finishes email verification. Case-insensitive.
    admin_emails: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def ai_providers_list(self) -> list[str]:
        return [p.strip().lower() for p in self.ai_providers.split(",") if p.strip()]

    @property
    def admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
