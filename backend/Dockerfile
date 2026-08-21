# Use slim Python image — keeps image size small for faster Cloud Run cold starts
FROM python:3.12-slim

# Install system deps needed by pdfplumber / psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Cloud Run injects PORT env var (default 8080)
ENV PORT=8080

# Run the server
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
