from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionBase(BaseModel):
    amount: float
    merchant: Optional[str] = None
    transaction_type: str
    category: str = "Uncategorized"
    date: date
    raw_email_snippet: Optional[str] = None
    gmail_message_id: Optional[str] = None
    source: str = "email"
    note: Optional[str] = None

class TransactionCreate(BaseModel):
    """Schema for manually adding a transaction."""
    amount: float
    merchant: str
    transaction_type: str          # "debit" or "credit"
    category: str = "Uncategorized"
    date: date
    note: Optional[str] = None

class TransactionUpdateCategory(BaseModel):
    category: str

class TransactionResponse(TransactionBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Summary ───────────────────────────────────────────────────────────────────

class CategorySummary(BaseModel):
    category: str
    total_amount: float
    transaction_count: int


# ── Statement upload ──────────────────────────────────────────────────────────

class StatementUploadResponse(BaseModel):
    message: str
    added: int
    skipped: int
    total_found: int


# ── Categories ────────────────────────────────────────────────────────────────

class CategoryRuleCreate(BaseModel):
    keyword: str

class CategoryRuleResponse(BaseModel):
    id: int
    keyword: str
    category_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name: str

class CategoryResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    rules: List[CategoryRuleResponse] = []

    class Config:
        from_attributes = True
