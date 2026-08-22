import re
from datetime import datetime
from typing import Optional, Dict, Any

def parse_hdfc_email(body: str, subject: str) -> Optional[Dict[str, Any]]:
    """
    Parses an HDFC transaction alert email to extract:
    - amount
    - merchant
    - date
    - transaction_type (debit/credit)

    HDFC uses (at least) two different templates:
    1. UPI txn alert: "Rs.69.00 is debited from your account ending 9864
       towards VPA paytmqr1aipcb1ex2@paytm (USHODAYA MILK AND VEGETABLES)
       on 20-08-26."
    2. Account update / credit alert: "Rs.10.00 has been successfully
       credited to your HDFC Bank account ending in 9864. Transaction
       Details: a. Date: 22-08-26 b. Sender: Mr Varikuti Manivardhan Reddy
       (VPA: 9019190832-2@ybl) c. UPI Reference No.: 519317601050"
       This template is used for credits (and possibly some debits) and has
       no "towards ... on" phrase, so it needs its own pattern.
    """
    amount = txn_type = merchant_raw = date_str = None

    # Pattern 1: "Rs.X is debited/credited ... towards Y on DATE"
    match = re.search(
        r'Rs\.([\d,]+\.\d+)\s+is\s+(debited|credited).*?towards\s+(.*?)\s+on\s+(\d{2}-\d{2}-\d{2,4})',
        body, re.IGNORECASE | re.DOTALL
    )
    if match:
        amount, txn_type, merchant_raw, date_str = match.groups()
    else:
        # Pattern 2: "Rs.X has been successfully debited/credited from/to
        # your HDFC Bank account ... Date: DATE ... Sender/Beneficiary: NAME (VPA"
        match = re.search(
            r'Rs\.([\d,]+\.\d+)\s+has\s+been\s+successfully\s+(debited|credited)\s+(?:from|to)\s+your\s+HDFC\s+Bank\s+account'
            r'.*?Date:\s*(\d{2}-\d{2}-\d{2,4})'
            r'.*?(?:Sender|Beneficiary):\s*(.*?)\s*\(VPA',
            body, re.IGNORECASE | re.DOTALL
        )
        if match:
            amount, txn_type, date_str, merchant_raw = match.groups()

    if not match:
        return None

    try:
        amount = float(amount.replace(',', ''))
        txn_type = "debit" if txn_type.lower() == "debited" else "credit"
        merchant_raw = merchant_raw.strip()
        date_str = date_str.strip()
        
        # Clean up merchant name (if it has parentheses, that's usually the clean store name)
        m_paren = re.search(r'\((.*?)\)', merchant_raw)
        if m_paren:
            merchant = m_paren.group(1).strip()
        else:
            merchant = merchant_raw.replace('VPA ', '').strip()
            # Strip a leading honorific (e.g. "Mr Varikuti Manivardhan Reddy" -> "Varikuti Manivardhan Reddy")
            merchant = re.sub(r'^(Mr|Mrs|Ms|Dr)\.?\s+', '', merchant, flags=re.IGNORECASE)
            
        # Parse date. Example format: '20-08-26' (DD-MM-YY)
        try:
            parsed_date = datetime.strptime(date_str, '%d-%m-%y').date()
        except ValueError:
            parsed_date = datetime.strptime(date_str, '%d-%m-%Y').date()
            
        return {
            "amount": amount,
            "merchant": merchant,
            "transaction_type": txn_type,
            "date": parsed_date
        }
    except Exception as e:
        print(f"Error parsing matched email data: {e}")
        return None