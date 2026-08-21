import re
from datetime import datetime
from typing import List, Dict, Any, Optional

import pdfplumber

DATE_PATTERN = re.compile(r'^\d{2}/\d{2}/\d{2,4}$')


def _parse_date(date_str: str) -> Optional[Any]:
    date_str = (date_str or "").strip()
    for fmt in ("%d/%m/%y", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def _extract_merchant(narration: str) -> str:
    # Typical HDFC UPI narration: "UPI-SWIGGY-swiggy@ybl-123456789012-Payment"
    m = re.search(r'UPI[-/]([A-Za-z0-9 &.\']+?)[-/]', narration, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return narration.strip()[:50]


def _clean_amount(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    value = value.replace(",", "").strip()
    if not value or value in ("-", "0", "0.00"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_hdfc_statement(pdf_path: str) -> List[Dict[str, Any]]:
    """
    Parses an HDFC savings account statement PDF and returns ONLY UPI
    transactions (debit or credit). Card swipes, ATM withdrawals, NEFT/IMPS,
    and other narration types are skipped on purpose.

    Expected HDFC table columns (typical layout):
        Date | Narration | Chq/Ref No | Value Date | Withdrawal Amt | Deposit Amt | Closing Balance

    This assumes the last two amount-looking columns before the closing
    balance are Withdrawal / Deposit. Statement layouts can shift slightly
    between account types — if this returns 0 results on a real file, run
    `_debug_dump_tables(path)` below to see the raw rows pdfplumber found
    and adjust the column indices accordingly.
    """
    transactions: List[Dict[str, Any]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row or len(row) < 5:
                        continue

                    row = [cell.strip() if isinstance(cell, str) else cell for cell in row]

                    date_cell = row[0] or ""
                    narration = row[1] or ""

                    if not DATE_PATTERN.match(date_cell):
                        continue  # not a transaction row (header/footer/etc.)

                    if "UPI" not in narration.upper():
                        continue  # skip card/ATM/NEFT/IMPS/etc. on purpose

                    parsed_date = _parse_date(date_cell)
                    if not parsed_date:
                        continue

                    # Withdrawal and Deposit are usually the 3rd and 2nd last columns
                    withdrawal = _clean_amount(row[-3]) if len(row) >= 3 else None
                    deposit = _clean_amount(row[-2]) if len(row) >= 2 else None

                    if withdrawal:
                        amount, txn_type = withdrawal, "debit"
                    elif deposit:
                        amount, txn_type = deposit, "credit"
                    else:
                        continue

                    merchant = _extract_merchant(narration)

                    transactions.append({
                        "date": parsed_date,
                        "amount": amount,
                        "merchant": merchant,
                        "transaction_type": txn_type,
                        "raw_line": narration,
                    })

    return transactions


def _debug_dump_tables(pdf_path: str) -> None:
    """
    Not used by the API. Run this manually (e.g. `python -c "from app.statement_parser
    import _debug_dump_tables; _debug_dump_tables('statement.pdf')"`) to see exactly
    what pdfplumber extracts from your statement, so you can fix the column
    indices in parse_hdfc_statement if they don't line up.
    """
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            print(f"--- Page {i + 1} ---")
            for table in page.extract_tables():
                for row in table:
                    print(row)
