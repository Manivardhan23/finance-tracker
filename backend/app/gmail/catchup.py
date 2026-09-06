"""
Catch-up sync: on server startup (and on manual /sync), fetch HDFC emails
from the last N days and store any that are not already in the database.

Uses IMAP + Gmail App Password — no OAuth, no expiring tokens.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..config import settings
from .. import models
from ..categorize import categorize_transaction
from .imap_client import fetch_hdfc_emails_imap
from .parser import parse_hdfc_email


def run_catchup_sync(db: Session, days: int = 7) -> int:
    """
    Fetch HDFC emails from the last `days` days and insert any missing ones.
    Returns the number of new transactions added.
    """
    print(f"[startup] Running catch-up sync for the last {days} days...")

    if not settings.GMAIL_USER or not settings.GMAIL_APP_PASSWORD:
        print("[startup] GMAIL_USER or GMAIL_APP_PASSWORD not set — skipping catch-up.")
        return 0

    since_dt = datetime.now() - timedelta(days=days)
    # IMAP SINCE format: DD-Mon-YYYY (e.g. "01-Sep-2025")
    since_date = since_dt.strftime("%d-%b-%Y")

    try:
        emails = fetch_hdfc_emails_imap(
            gmail_user=settings.GMAIL_USER,
            app_password=settings.GMAIL_APP_PASSWORD,
            max_results=100,
            since_date=since_date,
        )
    except Exception as e:
        print(f"[startup] IMAP fetch failed — skipping catch-up: {e}")
        return 0

    added = 0
    for email_data in emails:
        # Skip if already stored
        existing = db.query(models.Transaction).filter(
            models.Transaction.gmail_message_id == email_data["message_id"]
        ).first()
        if existing:
            continue

        parsed = parse_hdfc_email(email_data["body"], email_data["subject"])
        if not parsed:
            continue

        category = categorize_transaction(parsed["merchant"], db)
        new_tx = models.Transaction(
            amount=parsed["amount"],
            merchant=parsed["merchant"],
            transaction_type=parsed["transaction_type"],
            category=category,
            date=parsed["date"],
            raw_email_snippet=email_data["body"][:200],
            gmail_message_id=email_data["message_id"],
            source="email",
        )
        db.add(new_tx)
        try:
            db.commit()
            added += 1
        except IntegrityError:
            db.rollback()

    print(f"[startup] Catch-up sync complete — added {added} new transaction(s).")
    return added
