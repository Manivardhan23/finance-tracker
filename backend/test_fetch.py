from app.gmail.client import get_gmail_service, fetch_hdfc_emails
from app.gmail.parser import parse_hdfc_email

def test():
    service = get_gmail_service()
    if not service:
        print("No service returned")
        return
        
    emails = fetch_hdfc_emails(service, max_results=5)
    print(f"Found {len(emails)} emails")
    for e in emails:
        print(f"\n--- Subject: {e['subject']} ---")
        print(f"Body preview: {e['body'][:500]!r}")
        parsed = parse_hdfc_email(e['body'], e['subject'])
        if parsed:
            print(f"SUCCESS MATCH: {parsed}")
        else:
            print("FAILED MATCH")

test()
