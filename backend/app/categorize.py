from sqlalchemy.orm import Session
from . import models

# Default categories seeded on first run
DEFAULT_CATEGORIES = {
    "Food":          ["swiggy", "zomato", "dominos", "mcdonalds", "kfc", "burger king", "subway"],
    "Transport":     ["uber", "ola", "rapido", "irctc", "redbus", "makemytrip"],
    "Shopping":      ["amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa"],
    "Groceries":     ["blinkit", "instamart", "bigbasket", "zepto", "dunzo", "jiomart"],
    "Entertainment": ["netflix", "spotify", "prime", "hotstar", "bookmyshow", "pvr", "inox"],
    "Bills":         ["airtel", "jio", "bsnl", "electricity", "water", "gas", "bescom"],
    "Health":        ["pharmacy", "apollo", "medplus", "practo", "1mg", "netmeds"],
    "Uncategorized": [],
}


def seed_default_categories(db: Session) -> None:
    """Seed default categories + rules if the categories table is empty."""
    existing = db.query(models.Category).first()
    if existing:
        return  # already seeded

    print("[startup] Seeding default categories...")
    for name, keywords in DEFAULT_CATEGORIES.items():
        cat = models.Category(name=name)
        db.add(cat)
        db.flush()  # get cat.id
        for kw in keywords:
            db.add(models.CategoryRule(keyword=kw, category_id=cat.id))

    db.commit()
    print(f"[startup] Seeded {len(DEFAULT_CATEGORIES)} categories.")


def categorize_transaction(merchant: str, db: Session) -> str:
    """
    Categorize a transaction merchant string using keyword rules stored in the DB.
    Falls back to 'Uncategorized' if no rule matches.
    """
    if not merchant:
        return "Uncategorized"

    merchant_lower = merchant.lower()

    rules = db.query(models.CategoryRule).all()
    for rule in rules:
        if rule.keyword.lower() in merchant_lower:
            cat = db.query(models.Category).filter(
                models.Category.id == rule.category_id
            ).first()
            if cat and cat.name != "Uncategorized":
                return cat.name

    return "Uncategorized"
