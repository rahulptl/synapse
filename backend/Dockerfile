FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create keys directory
RUN mkdir -p /app/keys

# Expose port
EXPOSE 8000

# Run with uvicorn with increased limits for Cloud Run (32MB max)
# Note: Cloud Run has a 32MB request size limit
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--limit-max-requests", "0", "--timeout-keep-alive", "300"]
