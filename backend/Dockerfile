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
# Use CPU-only PyTorch to save disk space (~400MB vs 2GB with CUDA)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Set environment variables for model paths
# Models will be lazy-loaded on first use and cached in /app/.cache
# This avoids downloading ~2.5GB during CI/CD builds
ENV DOCLING_SERVE_ARTIFACTS_PATH=/app/.cache/docling/models
ENV EASYOCR_MODULE_PATH=/app/.cache/easyocr

# Create model cache directories
# Models will be automatically downloaded by Docling/EasyOCR on first request
RUN mkdir -p /app/.cache/docling/models /app/.cache/easyocr

# Note: Models are NOT downloaded during build to save disk space in CI/CD
# They will be automatically downloaded on first use in the deployment environment
# First request will take ~2-3 minutes, subsequent requests use cached models

# Copy application code
COPY . .

# Create keys directory
RUN mkdir -p /app/keys

# Expose port
EXPOSE 8000

# Run with uvicorn (can be overridden by docker-compose)
# --proxy-headers: Trust X-Forwarded-* headers from Cloud Run proxy
# --forwarded-allow-ips='*': Allow forwarded headers from any Cloud Run instance
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
