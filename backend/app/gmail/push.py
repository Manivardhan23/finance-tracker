"""
Gmail Push Notifications via Google Cloud Pub/Sub.

Flow:
  1. On startup: call setup_gmail_watch() → tells Gmail to push notifications
     to our Pub/Sub topic whenever a new email arrives.
  2. Gmail → Pub/Sub → POST /api/gmail/webhook (this server).
  3. Webhook decodes the historyId, fetches new messages via Gmail History API,
     parses and stores them.

The Gmail watch() expires every 7 days — setup_gmail_watch() is idempotent and
safe to call on every startup, which auto-renews the subscription.
"""
import base64
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..database import get_db
from .. import models
from ..categorize import categorize_transaction
from ..config import settings
from .client import get_gmail_service
from .parser import parse_hdfc_email

push_router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_stored_history_id(db: Session) -> str | None:
    row = db.query(models.AppConfig).filter(
        models.AppConfig.key == "gmail_history_id"
    ).first()
    return row.value if row else None


def _set_stored_history_id(db: Session, history_id: str) -> None:
    row = db.query(models.AppConfig).filter(
        models.AppConfig.key == "gmail_history_id"
    ).first()
    if row:
        row.value = history_id
    else:
        db.add(models.AppConfig(key="gmail_history_id", value=history_id))
    db.commit()


def _process_message(service, msg_id: str, db: Session) -> bool:
    """Fetch a single Gmail message, parse it, and store if new. Returns True if added."""
    # Skip if already stored
    existing = db.query(models.Transaction).filter(
        models.Transaction.gmail_message_id == msg_id
    ).first()
    if existing:
        return False

    try:
        msg = service.users().messages().get(userId="me", id=msg_id, format="full").execute()
    except Exception as e:
        print(f"[push] Failed to fetch message {msg_id}: {e}")
        return False

    headers = msg["payload"].get("headers", [])
    subject = next(
        (h["value"] for h in headers if h["name"].lower() == "subject"), ""
    )

    import re

    def extract_text(payload):
        if "parts" in payload:
            text, html = "", ""
            for part in payload["parts"]:
                mime = part.get("mimeType", "")
                if mime == "text/plain":
                    data = part["body"].get("data")
                    if data:
                        text += base64.urlsafe_b64decode(data).decode("utf-8")
                elif mime == "text/html":
                    data = part["body"].get("data")
                    if data:
                        html += base64.urlsafe_b64decode(data).decode("utf-8")
                elif mime.startswith("multipart/"):
                    text += extract_text(part)
            return text if text else html
        else:
            data = payload["body"].get("data")
            return base64.urlsafe_b64decode(data).decode("utf-8") if data else ""

    body = extract_text(msg["payload"])
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"\s+", " ", body)

    parsed = parse_hdfc_email(body, subject)
    if not parsed:
        return False

    category = categorize_transaction(parsed["merchant"], db)
    new_tx = models.Transaction(
        amount=parsed["amount"],
        merchant=parsed["merchant"],
        transaction_type=parsed["transaction_type"],
        category=category,
        date=parsed["date"],
        raw_email_snippet=body[:200],
        gmail_message_id=msg_id,
        source="email",
    )
    db.add(new_tx)
    try:
        db.commit()
        print(f"[push] Saved: {parsed['merchant']} ₹{parsed['amount']}")
        return True
    except IntegrityError:
        db.rollback()
        return False


# ── Gmail Watch Setup ──────────────────────────────────────────────────────────

def setup_gmail_watch(db: Session) -> None:
    """
    Register (or renew) the Gmail push subscription.
    Only runs if PUBLIC_URL is configured (required for Pub/Sub push delivery).
    """
    if not settings.PUBLIC_URL:
        print("[startup] PUBLIC_URL not set — skipping Gmail watch setup (OK for local dev).")
        return

    try:
        service = get_gmail_service(db)
        if not service:
            print("[startup] Gmail service unavailable — skipping watch setup.")
            return

        topic = f"projects/{settings.GOOGLE_CLOUD_PROJECT}/topics/{settings.PUBSUB_TOPIC}"
        response = service.users().watch(
            userId="me",
            body={"labelIds": ["INBOX"], "topicName": topic},
        ).execute()

        history_id = str(response.get("historyId", ""))
        expiration = response.get("expiration", "")
        exp_dt = datetime.fromtimestamp(int(expiration) / 1000) if expiration else "unknown"

        _set_stored_history_id(db, history_id)
        print(f"[startup] Gmail watch registered. historyId={history_id}, expires={exp_dt}")
    except Exception as e:
        print(f"[startup] Gmail watch setup failed: {e}")


# ── Webhook Endpoint ───────────────────────────────────────────────────────────

@push_router.post("/gmail/webhook")
async def gmail_push_webhook(
    request: Request,
    token: str = Query(default=""),
    db: Session = Depends(get_db),
):
    """
    Receives push notifications from Google Cloud Pub/Sub when a new Gmail
    message arrives. Verifies the secret token, decodes the historyId, fetches
    new messages via the Gmail History API, and stores any new HDFC transactions.
    """
    # Verify the shared secret token
    if token != settings.WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Invalid webhook token")

    try:
        body = await request.json()
        message = body.get("message", {})
        data_b64 = message.get("data", "")
        data = json.loads(base64.b64decode(data_b64).decode("utf-8"))
        new_history_id = str(data.get("historyId", ""))
    except Exception as e:
        print(f"[push] Failed to parse Pub/Sub message: {e}")
        # Return 200 so Pub/Sub doesn't keep retrying a malformed message
        return {"status": "ignored"}

    if not new_history_id:
        return {"status": "no historyId"}

    last_history_id = _get_stored_history_id(db)
    if not last_history_id:
        # No baseline — store this historyId and wait for the next push
        _set_stored_history_id(db, new_history_id)
        return {"status": "baseline set"}

    try:
        service = get_gmail_service(db)
        if not service:
            return {"status": "gmail unavailable"}

        # Fetch all changes since the last known historyId
        history_response = service.users().history().list(
            userId="me",
            startHistoryId=last_history_id,
            historyTypes=["messageAdded"],
        ).execute()

        added_count = 0
        for record in history_response.get("history", []):
            for msg_added in record.get("messagesAdded", []):
                msg_id = msg_added["message"]["id"]
                if _process_message(service, msg_id, db):
                    added_count += 1

        _set_stored_history_id(db, new_history_id)
        return {"status": "ok", "added": added_count}

    except Exception as e:
        print(f"[push] Webhook processing error: {e}")
        return {"status": "error", "detail": str(e)}
