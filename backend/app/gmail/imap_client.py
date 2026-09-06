"""
Gmail IMAP client — fetches HDFC transaction alert emails using an App Password.

No OAuth, no tokens, no Google Cloud Console needed.
Works forever as long as the App Password is valid.
"""
import imaplib
import email
import re
from email.header import decode_header


def _decode_str(value: str | bytes | None) -> str:
    """Decode an email header value to a plain string."""
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    parts = decode_header(value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded)


def _extract_text(msg: email.message.Message) -> str:
    """Extract plain text (or stripped HTML) from an email message."""
    text_parts = []
    html_parts = []

    if msg.is_multipart():
        for part in msg.walk():
            mime = part.get_content_type()
            if mime == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    text_parts.append(payload.decode(part.get_content_charset() or "utf-8", errors="replace"))
            elif mime == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    html_parts.append(payload.decode(part.get_content_charset() or "utf-8", errors="replace"))
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            text_parts.append(payload.decode(msg.get_content_charset() or "utf-8", errors="replace"))

    raw = " ".join(text_parts) if text_parts else " ".join(html_parts)
    # Strip HTML tags and normalise whitespace
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = re.sub(r"\s+", " ", raw)
    return raw.strip()


def fetch_hdfc_emails_imap(
    gmail_user: str,
    app_password: str,
    max_results: int = 50,
    since_date: str | None = None,
) -> list[dict]:
    """
    Connect to Gmail via IMAP and return HDFC alert emails.

    Args:
        gmail_user:   Your Gmail address (e.g. you@gmail.com)
        app_password: 16-char Gmail App Password (no spaces)
        max_results:  Maximum number of emails to fetch
        since_date:   Optional date string in DD-Mon-YYYY format (e.g. '01-Sep-2025')
                      to limit results to emails received on or after this date.

    Returns:
        List of dicts with keys: message_id, subject, body
    """
    results = []

    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(gmail_user, app_password)
        mail.select("INBOX")

        # Build IMAP search query
        search_parts = ['FROM "alerts@hdfcbank.bank.in"']
        if since_date:
            search_parts.append(f'SINCE "{since_date}"')

        search_query = " ".join(search_parts)
        status, data = mail.search(None, search_query)

        if status != "OK" or not data or not data[0]:
            mail.logout()
            return []

        msg_ids = data[0].split()
        # Take the most recent `max_results` emails (ids are oldest-first)
        msg_ids = msg_ids[-max_results:]
        # Process newest first
        msg_ids = list(reversed(msg_ids))

        for msg_num in msg_ids:
            status, msg_data = mail.fetch(msg_num, "(RFC822)")
            if status != "OK":
                continue

            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            subject = _decode_str(msg.get("Subject", ""))
            # Use the IMAP UID as a stable message ID
            message_id_header = msg.get("Message-ID", "")
            # Fall back to a hash of subject+date if no Message-ID header
            stable_id = message_id_header.strip() or f"{subject}_{msg.get('Date', '')}"

            body = _extract_text(msg)

            results.append({
                "message_id": stable_id,
                "subject": subject,
                "body": body,
            })

        mail.logout()

    except imaplib.IMAP4.error as e:
        print(f"[imap] IMAP error: {e}")
    except Exception as e:
        print(f"[imap] Unexpected error: {e}")

    return results
