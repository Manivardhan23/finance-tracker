import os
import tempfile
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List

from . import schemas, models
from .database import get_db
from .auth import verify_password, create_access_token, get_current_user

router = APIRouter()


# ── Auth ───────────────────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=schemas.TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.username == form_data.username
    ).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    token = create_access_token({"sub": user.username})
    return schemas.TokenResponse(access_token=token)


# ── Transactions ───────────────────────────────────────────────────────────────

@router.get("/transactions", response_model=List[schemas.TransactionResponse])
def get_transactions(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Transaction)
        .order_by(models.Transaction.date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("/transactions", response_model=schemas.TransactionResponse)
def create_manual_transaction(
    tx: schemas.TransactionCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Manually add a transaction (cash payment, UPI without alert, etc.)."""
    new_tx = models.Transaction(
        amount=tx.amount,
        merchant=tx.merchant,
        transaction_type=tx.transaction_type,
        category=tx.category,
        date=tx.date,
        source="manual",
        note=tx.note,
        gmail_message_id=None,  # no email
    )
    db.add(new_tx)
    db.commit()
    db.refresh(new_tx)
    return new_tx


@router.patch("/transactions/{transaction_id}/category", response_model=schemas.TransactionResponse)
def update_transaction_category(
    transaction_id: int,
    category_update: schemas.TransactionUpdateCategory,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    transaction.category = category_update.category
    db.commit()
    db.refresh(transaction)
    return transaction


@router.delete("/transactions/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(transaction)
    db.commit()
    return {"message": "Transaction deleted"}


# ── Manual Gmail Sync ──────────────────────────────────────────────────────────

@router.post("/sync")
def manual_sync(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Manually trigger a Gmail catch-up sync + re-categorize all transactions."""
    from .gmail.catchup import run_catchup_sync
    from .categorize import sync_default_rules, recategorize_all
    try:
        # 1. Push any new default keywords to the DB
        sync_default_rules(db)
        # 2. Fetch new emails from Gmail
        added = run_catchup_sync(db, days=14)
        # 3. Re-apply rules to ALL existing transactions (fixes old Uncategorized ones)
        updated = recategorize_all(db)
        return {
            "message": f"Sync complete. Added {added} new transaction(s), fixed {updated} categor{'y' if updated == 1 else 'ies'}.",
            "added": added,
            "recategorized": updated,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {e}")


@router.post("/recategorize")
def recategorize_all_transactions(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Re-apply all category keyword rules to every existing transaction."""
    from .categorize import recategorize_all
    try:
        updated = recategorize_all(db)
        return {
            "message": f"Done! Fixed {updated} transaction{'s' if updated != 1 else ''}.",
            "updated": updated,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recategorize failed: {e}")


# ── Summary ────────────────────────────────────────────────────────────────────


@router.get("/summary", response_model=List[schemas.CategorySummary])
def get_summary(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    results = db.query(
        models.Transaction.category,
        func.sum(models.Transaction.amount).label("total_amount"),
        func.count(models.Transaction.id).label("transaction_count"),
    ).group_by(models.Transaction.category).all()

    return [
        schemas.CategorySummary(
            category=row.category,
            total_amount=row.total_amount or 0.0,
            transaction_count=row.transaction_count,
        )
        for row in results
    ]


# ── Categories ─────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[schemas.CategoryResponse])
def list_categories(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return db.query(models.Category).order_by(models.Category.name).all()


@router.post("/categories", response_model=schemas.CategoryResponse)
def create_category(
    category: schemas.CategoryCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    existing = db.query(models.Category).filter(
        models.Category.name == category.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    new_cat = models.Category(name=category.name)
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return new_cat


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    cat = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.name == "Uncategorized":
        raise HTTPException(status_code=400, detail="Cannot delete the Uncategorized category")
    db.delete(cat)
    db.commit()
    return {"message": f"Category '{cat.name}' deleted"}


@router.post("/categories/{category_id}/rules", response_model=schemas.CategoryRuleResponse)
def add_category_rule(
    category_id: int,
    rule: schemas.CategoryRuleCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    cat = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    new_rule = models.CategoryRule(keyword=rule.keyword.lower(), category_id=category_id)
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)
    return new_rule


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    rule = db.query(models.CategoryRule).filter(models.CategoryRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"message": "Rule deleted"}


# ── Statement Upload ───────────────────────────────────────────────────────────

@router.post("/statement/upload", response_model=schemas.StatementUploadResponse)
async def upload_statement(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    from .statement_parser import parse_hdfc_statement
    from .categorize import categorize_transaction

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF bank statement.")

    tmp_path = None
    try:
        contents = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        parsed_transactions = parse_hdfc_statement(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read this PDF: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    added_count = 0
    skipped_count = 0

    for txn in parsed_transactions:
        existing = db.query(models.Transaction).filter(
            models.Transaction.date == txn["date"],
            models.Transaction.amount == txn["amount"],
            models.Transaction.merchant == txn["merchant"],
            models.Transaction.transaction_type == txn["transaction_type"],
        ).first()

        if existing:
            skipped_count += 1
            continue

        category = categorize_transaction(txn["merchant"], db)
        new_tx = models.Transaction(
            amount=txn["amount"],
            merchant=txn["merchant"],
            transaction_type=txn["transaction_type"],
            category=category,
            date=txn["date"],
            raw_email_snippet=txn.get("raw_line", "")[:200],
            gmail_message_id=None,
            source="statement",
        )
        db.add(new_tx)
        try:
            db.commit()
            added_count += 1
        except Exception:
            db.rollback()
            skipped_count += 1

    return schemas.StatementUploadResponse(
        message=f"Statement processed. Added {added_count} transactions, skipped {skipped_count}.",
        added=added_count,
        skipped=skipped_count,
        total_found=len(parsed_transactions),
    )
