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
    """
    # Look for the primary UPI transaction pattern
    # e.g., "Rs.69.00 is debited from your account ending 9864 towards VPA paytmqr1aipcb1ex2@paytm (USHODAYA MILK AND VEGETABLES) on 20-08-26."
    match = re.search(r'Rs\.([\d,]+\.\d+)\s+is\s+(debited|credited).*?towards\s+(.*?)\s+on\s+(\d{2}-\d{2}-\d{2,4})', body, re.IGNORECASE | re.DOTALL)
    
    if not match:
        return None
        
    try:
        amount = float(match.group(1).replace(',', ''))
        txn_type = "debit" if match.group(2).lower() == "debited" else "credit"
        merchant_raw = match.group(3).strip()
        date_str = match.group(4).strip()
        
        # Clean up merchant name (if it has parentheses, that's usually the clean store name)
        m_paren = re.search(r'\((.*?)\)', merchant_raw)
        if m_paren:
            merchant = m_paren.group(1).strip()
        else:
            merchant = merchant_raw.replace('VPA ', '').strip()
            
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
