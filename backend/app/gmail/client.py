import os
import re
import json
import tempfile
import base64

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from ..config import settings


def _resolve_credential_paths() -> tuple[str, str]:
    """
    Returns (creds_path, token_path).

    On Cloud Run, CREDENTIALS_JSON and TOKEN_JSON env vars contain the full
    JSON content of the respective files. We write them to /tmp so the rest
    of the code can treat them as normal file paths.

    Locally, fall back to the paths defined in settings (credentials.json /
    token.json in the backend folder).
    """
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

    # ── credentials.json ──────────────────────────────────────────────────────
    if settings.CREDENTIALS_JSON:
        creds_path = os.path.join(tempfile.gettempdir(), "credentials.json")
        with open(creds_path, "w") as f:
            f.write(settings.CREDENTIALS_JSON)
    else:
        creds_path = os.path.join(backend_dir, settings.CREDENTIALS_FILE)

    # ── token.json ────────────────────────────────────────────────────────────
    if settings.TOKEN_JSON:
        token_path = os.path.join(tempfile.gettempdir(), "token.json")
        # Only write if the file doesn't already exist in this container run
        # (avoids clobbering a refreshed token written later in the same session)
        if not os.path.exists(token_path):
            with open(token_path, "w") as f:
                f.write(settings.TOKEN_JSON)
    else:
        token_path = os.path.join(backend_dir, settings.TOKEN_FILE)

    return creds_path, token_path


def get_gmail_service():
    """Build and return an authenticated Gmail API service object."""
    creds_path, token_path = _resolve_credential_paths()
    creds = None

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, settings.SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # Persist refreshed token (stays in /tmp for Cloud Run, or local file locally)
            with open(token_path, "w") as token:
                token.write(creds.to_json())
        else:
            if not os.path.exists(creds_path):
                raise FileNotFoundError(
                    f"Missing credentials file. Set CREDENTIALS_JSON env var on Cloud Run "
                    f"or place credentials.json in the backend folder locally."
                )
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, settings.SCOPES)
            creds = flow.run_local_server(port=0)
            with open(token_path, "w") as token:
                token.write(creds.to_json())

    try:
        service = build("gmail", "v1", credentials=creds)
        return service
    except Exception as error:
        print(f"[gmail] Failed to build service: {error}")
        return None


def fetch_hdfc_emails(service, max_results=50, extra_query: str = ""):
    """Fetch recent HDFC transaction alert emails."""
    query = (
        'from:alerts@hdfcbank.bank.in '
        '(subject:"UPI txn" OR subject:"debited" OR subject:"credited" OR subject:"update")'
    )
    if extra_query:
        query += f" {extra_query}"

    results = service.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()
    messages = results.get("messages", [])

    email_data = []

    for message in messages:
        msg_id = message["id"]
        msg = service.users().messages().get(
            userId="me", id=msg_id, format="full"
        ).execute()

        headers = msg["payload"].get("headers", [])
        subject = next(
            (h["value"] for h in headers if h["name"].lower() == "subject"), ""
        )

        def extract_text(payload):
            if "parts" in payload:
                text_content, html_content = "", ""
                for part in payload["parts"]:
                    mime = part.get("mimeType", "")
                    if mime == "text/plain":
                        data = part["body"].get("data")
                        if data:
                            text_content += base64.urlsafe_b64decode(data).decode("utf-8")
                    elif mime == "text/html":
                        data = part["body"].get("data")
                        if data:
                            html_content += base64.urlsafe_b64decode(data).decode("utf-8")
                    elif mime.startswith("multipart/"):
                        text_content += extract_text(part)
                return text_content if text_content else html_content
            else:
                data = payload["body"].get("data")
                return base64.urlsafe_b64decode(data).decode("utf-8") if data else ""

        body = extract_text(msg["payload"])
        # Strip HTML tags and normalize whitespace
        body = re.sub(r"<[^>]+>", " ", body)
        body = re.sub(r"\s+", " ", body)

        email_data.append({
            "message_id": msg_id,
            "subject": subject,
            "body": body,
            "raw": msg,
        })

    return email_data
