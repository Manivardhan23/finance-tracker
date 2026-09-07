<h1 align="center">💹 FinanceTrack</h1>

<p align="center">
  <strong>A self-hosted personal finance dashboard for HDFC bank transactions</strong><br>
  Auto-syncs from Gmail · PDF statement import · Smart categorisation · Dark dashboard UI
</p>

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-0.141-009688?style=flat-square&logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python" alt="Python">
  <img src="https://img.shields.io/badge/SQLAlchemy-2.0-red?style=flat-square" alt="SQLAlchemy">
  <img src="https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?style=flat-square&logo=javascript" alt="JS">
  <img src="https://img.shields.io/badge/Charts-Chart.js-FF6384?style=flat-square&logo=chartdotjs" alt="Chart.js">
  <img src="https://img.shields.io/badge/DB-PostgreSQL%20%2F%20SQLite-4169E1?style=flat-square&logo=postgresql" alt="DB">
  <img src="https://img.shields.io/badge/Deploy-GitHub%20Pages%20%2B%20Render-black?style=flat-square" alt="Deploy">
</p>

---

## 📸 Screenshots

### Dashboard Overview
![Dashboard](docs/screenshots/dashboard.png)

### Expense Breakdown & Top Merchants
![Expense Breakdown](docs/screenshots/expense_breakdown.png)

### Monthly Overview
![Monthly](docs/screenshots/monthly.png)

### All Transactions
![Transactions](docs/screenshots/transactions.png)

---

## ✨ Features

| Feature | Description |
|---|---|
| 📧 **Gmail Auto-Sync** | Connects via IMAP App Password — pulls HDFC debit/credit alerts from the last 14 days on every sync |
| 📄 **PDF Statement Import** | Upload your HDFC bank statement PDF; transactions are parsed and de-duplicated automatically |
| ✍️ **Manual Transactions** | Add cash payments or UPI transfers that never generated an email alert |
| 🏷️ **Smart Categorisation** | Keyword-rule engine auto-categorises merchants (Swiggy → Food, Uber → Transport, etc.) |
| 📊 **Dashboard** | KPI cards · Income vs Expenses bar chart · Expense breakdown by category · Top merchants |
| 📅 **Monthly View** | Navigate month-by-month with donut chart, daily spend bars, category progress bars |
| 🔍 **Transaction Filters** | Filter by search term, time range, source (email / statement / manual), and type (debit / credit) |
| 💰 **Available Balance** | Set a starting balance; the app computes your current balance from all transactions |
| 🔐 **Auth** | JWT-secured API; single admin account; 7-day session tokens |
| 🔁 **Re-categorise** | Re-apply all keyword rules to historical transactions in one click |

---

## 🏗️ Architecture

```
finance-tracker/
├── backend/               # FastAPI Python backend
│   ├── app/
│   │   ├── main.py        # FastAPI app, CORS, lifespan startup
│   │   ├── routes.py      # All API endpoints (/api/...)
│   │   ├── models.py      # SQLAlchemy ORM models
│   │   ├── schemas.py     # Pydantic request/response schemas
│   │   ├── auth.py        # JWT auth & password hashing
│   │   ├── categorize.py  # Keyword rule engine + default seeds
│   │   ├── statement_parser.py  # HDFC PDF parser (pdfplumber)
│   │   ├── config.py      # Pydantic settings (reads .env)
│   │   ├── database.py    # SQLAlchemy engine & session
│   │   └── gmail/         # IMAP sync module
│   ├── requirements.txt
│   └── .env.example
├── docs/                  # Frontend (served by GitHub Pages)
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── screenshots/       # UI screenshots for README
└── alembic/               # DB migrations
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/transactions` | List all transactions |
| `POST` | `/api/transactions` | Add manual transaction |
| `PATCH` | `/api/transactions/{id}/category` | Recategorise single transaction |
| `DELETE` | `/api/transactions/{id}` | Delete transaction |
| `POST` | `/api/sync` | Gmail IMAP sync + recategorise |
| `GET` | `/api/summary` | Category totals |
| `GET` | `/api/categories` | List categories & rules |
| `POST` | `/api/categories` | Create category |
| `DELETE` | `/api/categories/{id}` | Delete category |
| `POST` | `/api/categories/{id}/rules` | Add keyword rule |
| `DELETE` | `/api/rules/{id}` | Remove keyword rule |
| `POST` | `/api/statement/upload` | Upload & parse PDF statement |
| `POST` | `/api/recategorize` | Re-apply all rules to all transactions |

---

## 🚀 Quick Start (Local Dev)

### Prerequisites

- Python 3.12+
- A Gmail account with HDFC bank alerts
- A [Gmail App Password](https://myaccount.google.com/apppasswords) (16-char, not your regular password)

### 1. Clone & set up the backend

```bash
git clone https://github.com/Manivardhan23/finance-tracker.git
cd finance-tracker/backend

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database (SQLite for local dev)
DATABASE_URL=sqlite:///./tracker.db

# Auth — change these!
SECRET_KEY=your-random-secret-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password

# Gmail IMAP (required for auto-sync)
GMAIL_USER=yourname@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

### 3. Run the backend

```bash
uvicorn app.main:app --reload
# API available at http://localhost:8000
# Swagger UI at http://localhost:8000/docs
```

### 4. Open the frontend

Open `docs/index.html` directly in your browser, **or** serve it with any static server:

```bash
cd ../docs
python -m http.server 3000
# Open http://localhost:3000
```

> **Note:** On first startup the backend auto-creates all tables, seeds default categories & keyword rules, and runs a 7-day Gmail catch-up sync.

---

## 🌐 Production Deployment

The recommended stack is **Render** (backend) + **GitHub Pages** (frontend) + **Supabase** (PostgreSQL).

### Backend on Render

1. Create a **Web Service** on [Render](https://render.com) pointing to this repo.
2. Set **Root Directory** → `backend`
3. Set **Start Command** → `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add these environment variables in the Render dashboard:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` (Supabase connection string) |
| `SECRET_KEY` | A strong random string |
| `ADMIN_USERNAME` | Your admin username |
| `ADMIN_PASSWORD` | Your admin password |
| `GMAIL_USER` | `yourname@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-char App Password |

### Frontend on GitHub Pages

1. Go to your repo → **Settings → Pages**
2. Set source to **Deploy from branch**, branch `main`, folder `/docs`
3. Update the `API_URL` constant in `docs/app.js` to your Render backend URL.

---

## 🏷️ Default Categories & Keywords

The app ships with these pre-seeded categories (fully editable from the UI):

| Category | Sample Keywords |
|---|---|
| 🍕 Food | swiggy, zomato, dominos, mcdonalds, kfc, restaurant, cafe... |
| 🚗 Transport | uber, ola, rapido, irctc, petrol, metro, indigo... |
| 🛍️ Shopping | amazon, flipkart, myntra, ajio, meesho, dmart... |
| 🥦 Groceries | blinkit, bigbasket, zepto, instamart, kirana, milk... |
| 🎬 Entertainment | netflix, spotify, prime, hotstar, bookmyshow, pvr... |
| 📱 Bills | airtel, jio, bescom, electricity, broadband, recharge... |
| 💊 Health | apollo, medplus, pharmacy, hospital, doctor, 1mg... |
| 💆 Personal Care | salon, spa, parlour, beauty, lakme, naturals... |

You can add new keywords or create entirely new categories from the **Categories** tab in the dashboard.

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI · SQLAlchemy 2.0 · Pydantic v2 · Uvicorn |
| **Auth** | python-jose (JWT) · bcrypt |
| **Database** | SQLite (dev) / PostgreSQL (prod) · Alembic migrations |
| **Gmail Sync** | Python `imaplib` with App Password |
| **PDF Parsing** | pdfplumber · pdfminer.six |
| **Frontend** | Vanilla HTML/CSS/JS · Chart.js |
| **Hosting** | Render (backend) · GitHub Pages (frontend) |

---

## 📄 License

MIT — do whatever you want with it.

---

<p align="center">Built for personal use · No telemetry · Your data stays on your server</p>
