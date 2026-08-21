"""
Catch-up sync: on server startup, fetch HDFC emails from the last N days
and store any that are not already in the database.
This ensures no emails are missed when the server was down.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..config import settings
from .. import models
from ..categorize import categorize_transaction
from .client import get_gmail_service, fetch_hdfc_emails
from .parser import parse_hdfc_email


def run_catchup_sync(db: Session, days: int = 3) -> int:
    """
    Fetch HDFC emails from the last `days` days and insert any missing ones.
    Returns the number of new transactions added.
    """
    print(f"[startup] Running catch-up sync for the last {days} days...")

    try:
        service = get_gmail_service()
        if not service:
            print("[startup] Gmail service unavailable — skipping catch-up.")
            return 0
    except Exception as e:
        print(f"[startup] Gmail init failed — skipping catch-up: {e}")
        return 0

    # Build date-filtered query
    since_date = (datetime.now() - timedelta(days=days)).strftime("%Y/%m/%d")
    emails = fetch_hdfc_emails(service, max_results=50, extra_query=f"after:{since_date}")

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
