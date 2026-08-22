from sqlalchemy.orm import Session
from . import models

# Default categories seeded on first run
DEFAULT_CATEGORIES = {
    "Food":          [
                        "swiggy", "zomato", "dominos", "mcdonalds", "kfc",
                        "burger king", "subway", "pizza", "biryani", "restaurant",
                        "cafe", "hotel", "dhaba", "bakery", "sweet", "juice",
                        "canteen", "mess", "tiffin", "chai", "tea",
                    ],
    "Transport":     [
                        "uber", "ola", "rapido", "irctc", "redbus", "makemytrip",
                        "petrol", "diesel", "fuel", "parking", "toll", "metro",
                        "auto", "cab", "bus", "train", "flight", "indigo", "spicejet",
                    ],
    "Shopping":      [
                        "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa",
                        "reliance", "dmart", "big bazaar", "max fashion", "lifestyle",
                        "shoppers stop", "h&m", "zara", "decathlon",
                    ],
    "Groceries":     [
                        "blinkit", "instamart", "bigbasket", "zepto", "dunzo", "jiomart",
                        "milk", "dairy", "vegetable", "vegetables", "fruits", "grocery",
                        "groceries", "kirana", "provision", "supermarket", "mart",
                        "fresh", "organic", "farm", "sabzi", "ration",
                        "ushoday", "heritage", "nandini", "aavin", "amul",
                    ],
    "Entertainment": [
                        "netflix", "spotify", "prime", "hotstar", "bookmyshow",
                        "pvr", "inox", "cinepolis", "youtube", "apple music",
                        "gaming", "steam", "playstation",
                    ],
    "Bills":         [
                        "airtel", "jio", "bsnl", "vi ", "vodafone", "idea",
                        "electricity", "water", "gas", "bescom", "tata power",
                        "adani electricity", "broadband", "wifi", "recharge",
                        "postpaid", "prepaid",
                    ],
    "Health":        [
                        "pharmacy", "apollo", "medplus", "practo", "1mg", "netmeds",
                        "hospital", "clinic", "doctor", "medical", "health",
                        "diagnostic", "lab", "pathology", "chemist", "medicine",
                        "ayurvedic", "dental", "eye care", "opticals",
                    ],
    "Personal Care": [
                        "salon", "saloon", "spa", "parlour", "parlor", "beauty",
                        "barber", "hair", "facial", "grooming", "waxing",
                        "lakme", "naturals", "jawed habib", "toni & guy",
                    ],
    "Uncategorized": [],
}


def seed_default_categories(db: Session) -> None:
    """Seed default categories + rules if the categories table is empty."""
    existing = db.query(models.Category).first()
    if existing:
        # Already seeded — still sync any NEW keywords added to DEFAULT_CATEGORIES
        sync_default_rules(db)
        return

    print("[startup] Seeding default categories...")
    for name, keywords in DEFAULT_CATEGORIES.items():
        cat = models.Category(name=name)
        db.add(cat)
        db.flush()  # get cat.id
        for kw in keywords:
            db.add(models.CategoryRule(keyword=kw, category_id=cat.id))

    db.commit()
    print(f"[startup] Seeded {len(DEFAULT_CATEGORIES)} categories.")


def sync_default_rules(db: Session) -> None:
    """Add any missing default keywords to existing categories (safe to run multiple times)."""
    for cat_name, keywords in DEFAULT_CATEGORIES.items():
        cat = db.query(models.Category).filter(models.Category.name == cat_name).first()
        if not cat:
            # Category doesn't exist yet — create it
            cat = models.Category(name=cat_name)
            db.add(cat)
            db.flush()

        existing_keywords = {
            r.keyword.lower()
            for r in db.query(models.CategoryRule).filter(
                models.CategoryRule.category_id == cat.id
            ).all()
        }
        for kw in keywords:
            if kw.lower() not in existing_keywords:
                db.add(models.CategoryRule(keyword=kw.lower(), category_id=cat.id))

    db.commit()


def recategorize_all(db: Session) -> int:
    """Re-apply all category rules to every existing transaction.
    Useful after adding new keywords. Returns number of transactions updated."""
    transactions = db.query(models.Transaction).all()
    updated = 0
    for tx in transactions:
        new_cat = categorize_transaction(tx.merchant, db)
        if new_cat != tx.category:
            tx.category = new_cat
            updated += 1
    db.commit()
    return updated



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
