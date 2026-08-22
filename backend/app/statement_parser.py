import re
from datetime import datetime
from typing import List, Dict, Any, Optional

import pdfplumber

# A transaction row starts with a date, then narration (first line only),
# then withdrawal/deposit/closing-balance amounts, e.g.:
#   "02/07/2026 UPI-TECH ALMOND 0.00 50.00 16,461.31"
# Any following lines that don't match this pattern are wrapped continuations
# of the narration (HDFC wraps long UPI narration strings across several
# lines) and get appended until the next transaction line begins.
TXN_LINE_PATTERN = re.compile(
    r'^(\d{2}/\d{2}/\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$'
)

# Lines that can appear interleaved with transaction rows but aren't part of
# any transaction's narration (table headers, balance labels, page footers).
_SKIP_LINE_MARKERS = ("Txn Date", "Opening Balance", "Page ", "Closing Balance",
                       "SUMMARY", "Debit Amount", "Credit Amount")


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

    IMPORTANT: this uses line-based text parsing, NOT pdfplumber's
    extract_tables(). HDFC's statement layout doesn't have real horizontal
    line separators between transaction rows (only between the header and
    the first row), so extract_tables() merges every row on a page into a
    single giant cell, no matter which table-detection strategy is used.
    Plain text extraction (page.extract_text()) preserves one line per
    visual row, which HDFC's layout does support reliably: each transaction
    starts with "DD/MM/YYYY <narration-start> <withdrawal> <deposit>
    <balance>" and any wrapped narration continues on the following lines
    until the next date-prefixed line appears.
    """
    transactions: List[Dict[str, Any]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text(layout=False) or ""
            current: Optional[Dict[str, Any]] = None

            for raw_line in text.split("\n"):
                line = raw_line.strip()
                if not line:
                    continue

                match = TXN_LINE_PATTERN.match(line)
                if match:
                    # Flush the previous transaction before starting a new one
                    if current:
                        transactions.append(current)

                    date_str, narration, withdrawal_str, deposit_str, _balance_str = match.groups()

                    if "UPI" not in narration.upper():
                        current = None  # skip non-UPI rows (card/ATM/NEFT/etc.)
                        continue

                    parsed_date = _parse_date(date_str)
                    if not parsed_date:
                        current = None
                        continue

                    withdrawal = _clean_amount(withdrawal_str)
                    deposit = _clean_amount(deposit_str)
                    if withdrawal:
                        amount, txn_type = withdrawal, "debit"
                    elif deposit:
                        amount, txn_type = deposit, "credit"
                    else:
                        current = None
                        continue

                    current = {
                        "date": parsed_date,
                        "amount": amount,
                        "_narration": narration,
                        "transaction_type": txn_type,
                    }
                elif current and not any(marker in line for marker in _SKIP_LINE_MARKERS):
                    # Wrapped continuation of the current transaction's narration
                    current["_narration"] += " " + line

            if current:
                transactions.append(current)

    # Finalize merchant names now that full (possibly multi-line) narration is assembled
    results = []
    for txn in transactions:
        narration = txn.pop("_narration")
        results.append({
            **txn,
            "merchant": _extract_merchant(narration),
            "raw_line": narration,
        })

    return results


def _debug_dump_tables(pdf_path: str) -> None:
    """
    Not used by the API. Run this manually (e.g. `python -c "from app.statement_parser
    import _debug_dump_tables; _debug_dump_tables('statement.pdf')"`) to see exactly
    what pdfplumber's text extraction produces per page, in case a different HDFC
    statement layout needs adjustments to TXN_LINE_PATTERN.
    """
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            print(f"--- Page {i + 1} ---")
            print(page.extract_text(layout=False))