from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base, SessionLocal
from .config import settings
from . import routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup tasks: bootstrap DB, seed data, catch-up sync."""
    db = SessionLocal()
    try:
        # 1. Create all tables
        Base.metadata.create_all(bind=engine)

        # 2. Create admin user if not exists
        from .auth import ensure_admin_user
        ensure_admin_user(db)

        # 3. Seed default categories if empty
        from .categorize import seed_default_categories
        seed_default_categories(db)

        # 4. Catch-up sync — fetch last 7 days of HDFC emails via IMAP
        from .gmail.catchup import run_catchup_sync
        run_catchup_sync(db, days=7)

    finally:
        db.close()

    yield  # app runs here


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# CORS — allow the plain HTML frontend served from any origin locally,
# and the future Fly.io frontend URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this after deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router, prefix="/api")


@app.get("/")
def root():
    return {"message": f"Welcome to {settings.PROJECT_NAME} API"}
