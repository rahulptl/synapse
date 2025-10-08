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

# Set environment variables for model paths
# Models will be cached in /app/.cache to persist across container restarts
ENV DOCLING_SERVE_ARTIFACTS_PATH=/app/.cache/docling/models
ENV EASYOCR_MODULE_PATH=/app/.cache/easyocr

# Create model cache directories
RUN mkdir -p /app/.cache/docling/models /app/.cache/easyocr

# Download models during build (before copying application code)
# This ensures models are baked into the image and don't need runtime downloads
COPY scripts/download_models.py /tmp/download_models.py
RUN python /tmp/download_models.py --languages en && rm /tmp/download_models.py

# Copy application code
COPY . .

# Create keys directory
RUN mkdir -p /app/keys

# Expose port
EXPOSE 8000

# Run with uvicorn (can be overridden by docker-compose)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
