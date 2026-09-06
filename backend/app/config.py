import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "HDFC Transaction Tracker"
    # Local dev: sqlite:///./tracker.db
    # Cloud Run: postgresql://user:pass@host:5432/dbname
    DATABASE_URL: str = "sqlite:///./tracker.db"

    # JWT Auth
    SECRET_KEY: str = "change-this-to-a-random-secret-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Admin credentials (set these in .env / Cloud Run secrets)
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "changeme"

    # Gmail IMAP credentials (App Password — never expires, no OAuth needed)
    # Set these in Render environment variables.
    GMAIL_USER: str = ""          # your Gmail address e.g. you@gmail.com
    GMAIL_APP_PASSWORD: str = ""  # 16-char App Password from myaccount.google.com/apppasswords

    # Legacy OAuth fields (kept so old .env files don't break, but no longer used)
    SCOPES: list[str] = ["https://www.googleapis.com/auth/gmail.readonly"]
    CREDENTIALS_FILE: str = "credentials.json"
    TOKEN_FILE: str = "token.json"
    CREDENTIALS_JSON: str = ""
    TOKEN_JSON: str = ""

    # Gmail Push / Pub/Sub
    GOOGLE_CLOUD_PROJECT: str = "finance-tracker-506109"
    PUBSUB_TOPIC: str = "gmail-push"
    WEBHOOK_SECRET: str = "change-this-webhook-secret"
    # Public URL of the deployed server (no trailing slash)
    # e.g. https://finance-tracker-xxxx.run.app
    PUBLIC_URL: str = ""

    class Config:
        # Absolute path ensures .env loads correctly whether running from
        # backend/ (uvicorn) or the project root (alembic)
        env_file = os.path.join(os.path.dirname(__file__), "..", ".env")


settings = Settings()
