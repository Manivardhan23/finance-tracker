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

    # Gmail API settings
    SCOPES: list[str] = ["https://www.googleapis.com/auth/gmail.readonly"]
    CREDENTIALS_FILE: str = "credentials.json"
    TOKEN_FILE: str = "token.json"

    # On Cloud Run, pass the entire JSON file contents as env vars instead of files.
    # Leave empty when running locally (local files are used instead).
    CREDENTIALS_JSON: str = ""   # full content of credentials.json
    TOKEN_JSON: str = ""         # full content of token.json

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
