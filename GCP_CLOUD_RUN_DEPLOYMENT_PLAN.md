# Google Cloud Run Deployment Plan - Dev & Prod Environments

## Overview
This document provides a comprehensive plan for deploying Synapse frontend and backend to Google Cloud Run with separate development and production environments.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloud Run Services                      │
├──────────────────────────┬──────────────────────────────────┤
│   Development (Mumbai)   │   Production (Mumbai)            │
├──────────────────────────┼──────────────────────────────────┤
│ synapse-frontend-dev     │ synapse-frontend-prod            │
│ synapse-backend-dev      │ synapse-backend-prod             │
└──────────────────────────┴──────────────────────────────────┘
                 ↓                        ↓
┌─────────────────────────────────────────────────────────────┐
│              Cloud SQL PostgreSQL (Mumbai)                   │
│  - dev database (dev_user)                                  │
│  - prod database (prod_user)                                │
└─────────────────────────────────────────────────────────────┘
                 ↓                        ↓
┌─────────────────────────────────────────────────────────────┐
│         Google Cloud Storage (Mumbai)                        │
│  Bucket: synapse_storage                                    │
│  - dev/ folder (dev environment)                            │
│  - prod/ folder (prod environment)                          │
└─────────────────────────────────────────────────────────────┘
                 ↓                        ↓
┌─────────────────────────────────────────────────────────────┐
│              Secret Manager (Project-wide)                   │
│  - dev-secret-key, dev-openai-key, dev-db-password         │
│  - prod-secret-key, prod-openai-key, prod-db-password      │
└─────────────────────────────────────────────────────────────┘
```

## 1. Dockerfile Strategy

### 1.1 Backend Dockerfile (Production-Optimized)

**Current Status:** ✅ Already exists at `backend/Dockerfile`

**Recommended Enhancements:**
- Multi-stage build for smaller image size
- Non-root user for security
- Health check optimization

**Updated Dockerfile:**

```dockerfile
# backend/Dockerfile.cloudrun
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 appuser

# Copy Python packages from builder
COPY --from=builder /root/.local /home/appuser/.local

# Copy application code
COPY --chown=appuser:appuser . .

# Set PATH to include user-installed packages
ENV PATH=/home/appuser/.local/bin:$PATH

# Create keys directory (for Cloud Run service account)
RUN mkdir -p /app/keys && chown appuser:appuser /app/keys

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### 1.2 Frontend Dockerfile (Production-Optimized)

**Current Status:** ✅ Already exists at `frontend/Dockerfile`

**Recommended Enhancements:**
- Separate Dockerfiles for dev/prod
- Environment-specific build arguments
- Nginx configuration for Cloud Run

**Updated Dockerfile for Cloud Run:**

```dockerfile
# frontend/Dockerfile.cloudrun
# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build arguments for environment-specific builds
ARG VITE_BACKEND_API_URL
ARG BUILD_ENV=production

# Set environment variables for build
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL
ENV NODE_ENV=production

# Build the application
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration for Cloud Run
COPY nginx.cloudrun.conf /etc/nginx/conf.d/default.conf

# Create nginx user
RUN adduser -D -u 1000 nginx || true

# Expose port (Cloud Run uses PORT env variable)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

**nginx.cloudrun.conf:**

```nginx
server {
    # Cloud Run uses port 8080
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript application/vnd.ms-fontobject application/x-font-ttf font/opentype image/svg+xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;

    # SPA routing - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # API calls go directly to backend Cloud Run service
    # (configured via VITE_BACKEND_API_URL environment variable at build time)
}
```

## 2. Secrets Management with Google Secret Manager

### 2.1 Create Secrets

**Development Secrets:**
```bash
# Create development secrets
echo -n "your-dev-secret-key-here" | gcloud secrets create dev-secret-key \
    --data-file=- \
    --replication-policy="user-managed" \
    --locations="asia-south1"

echo -n "sk-..." | gcloud secrets create dev-openai-key \
    --data-file=- \
    --replication-policy="user-managed" \
    --locations="asia-south1"

echo -n "dev_password_here" | gcloud secrets create dev-db-password \
    --data-file=- \
    --replication-policy="user-managed" \
    --locations="asia-south1"
```

**Production Secrets:**
```bash
# Create production secrets
echo -n "your-prod-secret-key-here" | gcloud secrets create prod-secret-key \
    --data-file=- \
    --replication-policy="user-managed" \
    --locations="asia-south1"

echo -n "sk-..." | gcloud secrets create prod-openai-key \
    --data-file=- \
    --replication-policy="user-managed" \
    --locations="asia-south1"

echo -n "prod_password_here" | gcloud secrets create prod-db-password \
    --data-file=- \
    --replication-policy="user-managed" \
    --locations="asia-south1"
```

### 2.2 Grant Secret Access to Cloud Run Service Accounts

```bash
# Get the project number
PROJECT_NUMBER=$(gcloud projects describe synapse-473918 --format="value(projectNumber)")

# Development backend service account
DEV_BACKEND_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant access to dev secrets
gcloud secrets add-iam-policy-binding dev-secret-key \
    --member="serviceAccount:${DEV_BACKEND_SA}" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding dev-openai-key \
    --member="serviceAccount:${DEV_BACKEND_SA}" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding dev-db-password \
    --member="serviceAccount:${DEV_BACKEND_SA}" \
    --role="roles/secretmanager.secretAccessor"

# Production backend service account
PROD_BACKEND_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant access to prod secrets
gcloud secrets add-iam-policy-binding prod-secret-key \
    --member="serviceAccount:${PROD_BACKEND_SA}" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding prod-openai-key \
    --member="serviceAccount:${PROD_BACKEND_SA}" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding prod-db-password \
    --member="serviceAccount:${PROD_BACKEND_SA}" \
    --role="roles/secretmanager.secretAccessor"
```

## 3. Cloud SQL Authentication

### 3.1 Enable Cloud SQL Admin API
```bash
gcloud services enable sqladmin.googleapis.com
```

### 3.2 Grant Cloud SQL Client Role
```bash
# Development
gcloud projects add-iam-policy-binding synapse-473918 \
    --member="serviceAccount:${DEV_BACKEND_SA}" \
    --role="roles/cloudsql.client"

# Production
gcloud projects add-iam-policy-binding synapse-473918 \
    --member="serviceAccount:${PROD_BACKEND_SA}" \
    --role="roles/cloudsql.client"
```

### 3.3 Database Connection Configuration

Cloud Run connects to Cloud SQL via Unix sockets automatically. The backend code already handles this in `app/core/database.py:28-50`.

**Key Configuration:**
- Set `CLOUD_SQL_CONNECTION_NAME` environment variable on Cloud Run
- Database URL format: `postgresql+asyncpg://user:password@/database`
- No host/port needed - Cloud Run automatically mounts `/cloudsql/PROJECT:REGION:INSTANCE`

## 4. Google Cloud Storage Authentication

### 4.1 Grant Storage Access
```bash
# Development
gcloud projects add-iam-policy-binding synapse-473918 \
    --member="serviceAccount:${DEV_BACKEND_SA}" \
    --role="roles/storage.objectAdmin" \
    --condition=None

# Production
gcloud projects add-iam-policy-binding synapse-473918 \
    --member="serviceAccount:${PROD_BACKEND_SA}" \
    --role="roles/storage.objectAdmin" \
    --condition=None
```

### 4.2 Storage Configuration

The backend already uses Application Default Credentials (ADC) when `GOOGLE_APPLICATION_CREDENTIALS` is not set (see `app/core/storage.py:194-205`).

**Key Configuration:**
- Set `STORAGE_BACKEND=gcs`
- Set `GCS_BUCKET_NAME=synapse_storage`
- Set `GCS_PROJECT_ID=synapse-473918`
- Set `ENVIRONMENT=development` or `ENVIRONMENT=production` (auto-creates dev/ or prod/ folders)

## 5. URL Configuration & Service Discovery

### 5.1 Backend URL Structure

**Development:**
```
https://synapse-backend-dev-<HASH>-el.a.run.app
```

**Production:**
```
https://synapse-backend-prod-<HASH>-el.a.run.app
```

### 5.2 Frontend Build-time Configuration

The frontend needs to know the backend URL at **build time** because Vite bundles it into the JavaScript.

**Development Build:**
```bash
docker build \
  --build-arg VITE_BACKEND_API_URL=https://synapse-backend-dev-HASH-el.a.run.app \
  -f frontend/Dockerfile.cloudrun \
  -t gcr.io/synapse-473918/synapse-frontend-dev:latest \
  ./frontend
```

**Production Build:**
```bash
docker build \
  --build-arg VITE_BACKEND_API_URL=https://synapse-backend-prod-HASH-el.a.run.app \
  -f frontend/Dockerfile.cloudrun \
  -t gcr.io/synapse-473918/synapse-frontend-prod:latest \
  ./frontend
```

### 5.3 Two-Stage Deployment Process

Since the frontend needs the backend URL at build time, deployment follows this order:

1. **Deploy Backend First**
   - Deploy backend to Cloud Run
   - Get the backend URL from Cloud Run

2. **Build & Deploy Frontend**
   - Use backend URL as build argument
   - Build frontend Docker image
   - Deploy frontend to Cloud Run

## 6. Deployment Scripts

### 6.1 Backend Deployment Script

**File: `scripts/deploy-backend-dev.sh`**

```bash
#!/bin/bash
set -e

PROJECT_ID="synapse-473918"
REGION="asia-south1"
SERVICE_NAME="synapse-backend-dev"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🔨 Building backend Docker image..."
docker build -f backend/Dockerfile.cloudrun -t ${IMAGE_NAME}:latest ./backend

echo "📤 Pushing image to Google Container Registry..."
docker push ${IMAGE_NAME}:latest

echo "🚀 Deploying to Cloud Run (Dev)..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --max-instances 10 \
  --min-instances 0 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars ENVIRONMENT=development \
  --set-env-vars API_V1_STR=/api/v1 \
  --set-env-vars CLOUD_SQL_CONNECTION_NAME=synapse-473918:asia-south1:synapse \
  --set-env-vars STORAGE_BACKEND=gcs \
  --set-env-vars GCS_BUCKET_NAME=synapse_storage \
  --set-env-vars GCS_PROJECT_ID=synapse-473918 \
  --set-env-vars DATABASE_URL=postgresql+asyncpg://dev_user:PASSWORD_PLACEHOLDER@/dev \
  --set-secrets SECRET_KEY=dev-secret-key:latest \
  --set-secrets OPENAI_API_KEY=dev-openai-key:latest \
  --add-cloudsql-instances synapse-473918:asia-south1:synapse \
  --service-account ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com

echo "✅ Backend deployed successfully!"
echo "🌐 Service URL:"
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(status.url)"
```

**File: `scripts/deploy-backend-prod.sh`**

```bash
#!/bin/bash
set -e

PROJECT_ID="synapse-473918"
REGION="asia-south1"
SERVICE_NAME="synapse-backend-prod"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🔨 Building backend Docker image..."
docker build -f backend/Dockerfile.cloudrun -t ${IMAGE_NAME}:latest ./backend

echo "📤 Pushing image to Google Container Registry..."
docker push ${IMAGE_NAME}:latest

echo "🚀 Deploying to Cloud Run (Production)..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --max-instances 20 \
  --min-instances 1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --set-env-vars ENVIRONMENT=production \
  --set-env-vars API_V1_STR=/api/v1 \
  --set-env-vars CLOUD_SQL_CONNECTION_NAME=synapse-473918:asia-south1:synapse \
  --set-env-vars STORAGE_BACKEND=gcs \
  --set-env-vars GCS_BUCKET_NAME=synapse_storage \
  --set-env-vars GCS_PROJECT_ID=synapse-473918 \
  --set-env-vars DATABASE_URL=postgresql+asyncpg://prod_user:PASSWORD_PLACEHOLDER@/prod \
  --set-secrets SECRET_KEY=prod-secret-key:latest \
  --set-secrets OPENAI_API_KEY=prod-openai-key:latest \
  --add-cloudsql-instances synapse-473918:asia-south1:synapse \
  --service-account ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com

echo "✅ Backend deployed successfully!"
echo "🌐 Service URL:"
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(status.url)"
```

### 6.2 Frontend Deployment Script

**File: `scripts/deploy-frontend-dev.sh`**

```bash
#!/bin/bash
set -e

PROJECT_ID="synapse-473918"
REGION="asia-south1"
SERVICE_NAME="synapse-frontend-dev"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Get backend URL
BACKEND_URL=$(gcloud run services describe synapse-backend-dev \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format="value(status.url)")

echo "🔗 Backend URL: ${BACKEND_URL}"

echo "🔨 Building frontend Docker image..."
docker build \
  --build-arg VITE_BACKEND_API_URL=${BACKEND_URL} \
  -f frontend/Dockerfile.cloudrun \
  -t ${IMAGE_NAME}:latest \
  ./frontend

echo "📤 Pushing image to Google Container Registry..."
docker push ${IMAGE_NAME}:latest

echo "🚀 Deploying to Cloud Run (Dev)..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --max-instances 10 \
  --min-instances 0 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60 \
  --port 8080

echo "✅ Frontend deployed successfully!"
echo "🌐 Service URL:"
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(status.url)"
```

**File: `scripts/deploy-frontend-prod.sh`**

```bash
#!/bin/bash
set -e

PROJECT_ID="synapse-473918"
REGION="asia-south1"
SERVICE_NAME="synapse-frontend-prod"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Get backend URL
BACKEND_URL=$(gcloud run services describe synapse-backend-prod \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --format="value(status.url)")

echo "🔗 Backend URL: ${BACKEND_URL}"

echo "🔨 Building frontend Docker image..."
docker build \
  --build-arg VITE_BACKEND_API_URL=${BACKEND_URL} \
  -f frontend/Dockerfile.cloudrun \
  -t ${IMAGE_NAME}:latest \
  ./frontend

echo "📤 Pushing image to Google Container Registry..."
docker push ${IMAGE_NAME}:latest

echo "🚀 Deploying to Cloud Run (Production)..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --max-instances 20 \
  --min-instances 1 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --port 8080

echo "✅ Frontend deployed successfully!"
echo "🌐 Service URL:"
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(status.url)"
```

### 6.3 Complete Deployment Script

**File: `scripts/deploy-all-dev.sh`**

```bash
#!/bin/bash
set -e

echo "🚀 Starting complete development deployment..."

# Deploy backend first
./scripts/deploy-backend-dev.sh

# Wait for backend to be ready
echo "⏳ Waiting for backend to be ready..."
sleep 30

# Deploy frontend (will automatically use backend URL)
./scripts/deploy-frontend-dev.sh

echo "✅ Development deployment complete!"
```

**File: `scripts/deploy-all-prod.sh`**

```bash
#!/bin/bash
set -e

echo "🚀 Starting complete production deployment..."

# Deploy backend first
./scripts/deploy-backend-prod.sh

# Wait for backend to be ready
echo "⏳ Waiting for backend to be ready..."
sleep 30

# Deploy frontend (will automatically use backend URL)
./scripts/deploy-frontend-prod.sh

echo "✅ Production deployment complete!"
```

## 7. Environment Variables Summary

### 7.1 Backend Environment Variables

| Variable | Dev Value | Prod Value | Source |
|----------|-----------|------------|--------|
| ENVIRONMENT | development | production | Cloud Run Env |
| API_V1_STR | /api/v1 | /api/v1 | Cloud Run Env |
| DATABASE_URL | postgresql+asyncpg://dev_user:{password}@/dev | postgresql+asyncpg://prod_user:{password}@/prod | Cloud Run Env + Secret |
| CLOUD_SQL_CONNECTION_NAME | synapse-473918:asia-south1:synapse | synapse-473918:asia-south1:synapse | Cloud Run Env |
| SECRET_KEY | {secret} | {secret} | Secret Manager |
| OPENAI_API_KEY | {secret} | {secret} | Secret Manager |
| STORAGE_BACKEND | gcs | gcs | Cloud Run Env |
| GCS_BUCKET_NAME | synapse_storage | synapse_storage | Cloud Run Env |
| GCS_PROJECT_ID | synapse-473918 | synapse-473918 | Cloud Run Env |

### 7.2 Frontend Build Arguments

| Variable | Dev Value | Prod Value | Source |
|----------|-----------|------------|--------|
| VITE_BACKEND_API_URL | https://synapse-backend-dev-{hash}-el.a.run.app | https://synapse-backend-prod-{hash}-el.a.run.app | Build Arg (from Cloud Run) |

## 8. CI/CD Pipeline (GitHub Actions)

### 8.1 GitHub Secrets Setup

Add these secrets to your GitHub repository:

```
GCP_PROJECT_ID=synapse-473918
GCP_SA_KEY={service-account-json-key}
```

### 8.2 Workflow File

**File: `.github/workflows/deploy-dev.yml`**

```yaml
name: Deploy to Development

on:
  push:
    branches:
      - develop

env:
  PROJECT_ID: synapse-473918
  REGION: asia-south1

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    outputs:
      backend_url: ${{ steps.deploy.outputs.url }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for GCR
        run: gcloud auth configure-docker

      - name: Build and push backend image
        run: |
          docker build -f backend/Dockerfile.cloudrun -t gcr.io/${{ env.PROJECT_ID }}/synapse-backend-dev:${{ github.sha }} ./backend
          docker tag gcr.io/${{ env.PROJECT_ID }}/synapse-backend-dev:${{ github.sha }} gcr.io/${{ env.PROJECT_ID }}/synapse-backend-dev:latest
          docker push gcr.io/${{ env.PROJECT_ID }}/synapse-backend-dev:${{ github.sha }}
          docker push gcr.io/${{ env.PROJECT_ID }}/synapse-backend-dev:latest

      - name: Deploy backend to Cloud Run
        id: deploy
        run: |
          gcloud run deploy synapse-backend-dev \
            --image gcr.io/${{ env.PROJECT_ID }}/synapse-backend-dev:${{ github.sha }} \
            --platform managed \
            --region ${{ env.REGION }} \
            --project ${{ env.PROJECT_ID }} \
            --allow-unauthenticated \
            --max-instances 10 \
            --min-instances 0 \
            --memory 1Gi \
            --cpu 1 \
            --timeout 300 \
            --set-env-vars ENVIRONMENT=development,API_V1_STR=/api/v1,CLOUD_SQL_CONNECTION_NAME=synapse-473918:asia-south1:synapse,STORAGE_BACKEND=gcs,GCS_BUCKET_NAME=synapse_storage,GCS_PROJECT_ID=synapse-473918 \
            --set-secrets SECRET_KEY=dev-secret-key:latest,OPENAI_API_KEY=dev-openai-key:latest \
            --add-cloudsql-instances synapse-473918:asia-south1:synapse

          echo "url=$(gcloud run services describe synapse-backend-dev --region ${{ env.REGION }} --format='value(status.url)')" >> $GITHUB_OUTPUT

  deploy-frontend:
    runs-on: ubuntu-latest
    needs: deploy-backend

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for GCR
        run: gcloud auth configure-docker

      - name: Build and push frontend image
        run: |
          docker build \
            --build-arg VITE_BACKEND_API_URL=${{ needs.deploy-backend.outputs.backend_url }} \
            -f frontend/Dockerfile.cloudrun \
            -t gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-dev:${{ github.sha }} \
            ./frontend
          docker tag gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-dev:${{ github.sha }} gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-dev:latest
          docker push gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-dev:${{ github.sha }}
          docker push gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-dev:latest

      - name: Deploy frontend to Cloud Run
        run: |
          gcloud run deploy synapse-frontend-dev \
            --image gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-dev:${{ github.sha }} \
            --platform managed \
            --region ${{ env.REGION }} \
            --project ${{ env.PROJECT_ID }} \
            --allow-unauthenticated \
            --max-instances 10 \
            --min-instances 0 \
            --memory 512Mi \
            --cpu 1 \
            --timeout 60 \
            --port 8080
```

**File: `.github/workflows/deploy-prod.yml`**

```yaml
name: Deploy to Production

on:
  push:
    branches:
      - main
    tags:
      - 'v*'

env:
  PROJECT_ID: synapse-473918
  REGION: asia-south1

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    outputs:
      backend_url: ${{ steps.deploy.outputs.url }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for GCR
        run: gcloud auth configure-docker

      - name: Build and push backend image
        run: |
          docker build -f backend/Dockerfile.cloudrun -t gcr.io/${{ env.PROJECT_ID }}/synapse-backend-prod:${{ github.sha }} ./backend
          docker tag gcr.io/${{ env.PROJECT_ID }}/synapse-backend-prod:${{ github.sha }} gcr.io/${{ env.PROJECT_ID }}/synapse-backend-prod:latest
          docker push gcr.io/${{ env.PROJECT_ID }}/synapse-backend-prod:${{ github.sha }}
          docker push gcr.io/${{ env.PROJECT_ID }}/synapse-backend-prod:latest

      - name: Deploy backend to Cloud Run
        id: deploy
        run: |
          gcloud run deploy synapse-backend-prod \
            --image gcr.io/${{ env.PROJECT_ID }}/synapse-backend-prod:${{ github.sha }} \
            --platform managed \
            --region ${{ env.REGION }} \
            --project ${{ env.PROJECT_ID }} \
            --allow-unauthenticated \
            --max-instances 20 \
            --min-instances 1 \
            --memory 2Gi \
            --cpu 2 \
            --timeout 300 \
            --set-env-vars ENVIRONMENT=production,API_V1_STR=/api/v1,CLOUD_SQL_CONNECTION_NAME=synapse-473918:asia-south1:synapse,STORAGE_BACKEND=gcs,GCS_BUCKET_NAME=synapse_storage,GCS_PROJECT_ID=synapse-473918 \
            --set-secrets SECRET_KEY=prod-secret-key:latest,OPENAI_API_KEY=prod-openai-key:latest \
            --add-cloudsql-instances synapse-473918:asia-south1:synapse

          echo "url=$(gcloud run services describe synapse-backend-prod --region ${{ env.REGION }} --format='value(status.url)')" >> $GITHUB_OUTPUT

  deploy-frontend:
    runs-on: ubuntu-latest
    needs: deploy-backend

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for GCR
        run: gcloud auth configure-docker

      - name: Build and push frontend image
        run: |
          docker build \
            --build-arg VITE_BACKEND_API_URL=${{ needs.deploy-backend.outputs.backend_url }} \
            -f frontend/Dockerfile.cloudrun \
            -t gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-prod:${{ github.sha }} \
            ./frontend
          docker tag gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-prod:${{ github.sha }} gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-prod:latest
          docker push gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-prod:${{ github.sha }}
          docker push gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-prod:latest

      - name: Deploy frontend to Cloud Run
        run: |
          gcloud run deploy synapse-frontend-prod \
            --image gcr.io/${{ env.PROJECT_ID }}/synapse-frontend-prod:${{ github.sha }} \
            --platform managed \
            --region ${{ env.REGION }} \
            --project ${{ env.PROJECT_ID }} \
            --allow-unauthenticated \
            --max-instances 20 \
            --min-instances 1 \
            --memory 1Gi \
            --cpu 1 \
            --timeout 60 \
            --port 8080
```

## 9. Pre-Deployment Checklist

### 9.1 GCP Project Setup
- [ ] Enable required APIs:
  ```bash
  gcloud services enable run.googleapis.com
  gcloud services enable containerregistry.googleapis.com
  gcloud services enable sqladmin.googleapis.com
  gcloud services enable secretmanager.googleapis.com
  gcloud services enable storage-api.googleapis.com
  ```

### 9.2 Cloud SQL Setup
- [ ] Cloud SQL instance running in `asia-south1`
- [ ] Dev database (`dev`) and user (`dev_user`) created
- [ ] Prod database (`prod`) and user (`prod_user`) created
- [ ] Connection name: `synapse-473918:asia-south1:synapse`

### 9.3 Cloud Storage Setup
- [ ] GCS bucket `synapse_storage` created in `asia-south1`
- [ ] Bucket has public access disabled
- [ ] `dev/` and `prod/` folders created (or will be auto-created)

### 9.4 Secret Manager Setup
- [ ] All secrets created (dev-secret-key, dev-openai-key, dev-db-password, prod-*)
- [ ] IAM permissions granted to service accounts

### 9.5 Service Accounts
- [ ] Default Compute Engine service account has:
  - [ ] Cloud SQL Client role
  - [ ] Storage Object Admin role
  - [ ] Secret Manager Secret Accessor role

## 10. Manual Deployment Steps (First Time)

### Step 1: Authenticate with GCP
```bash
gcloud auth login
gcloud config set project synapse-473918
gcloud auth configure-docker
```

### Step 2: Create Secrets
```bash
# Run secret creation commands from Section 2.1
```

### Step 3: Deploy Development Environment
```bash
# Make scripts executable
chmod +x scripts/*.sh

# Deploy backend first
./scripts/deploy-backend-dev.sh

# Note the backend URL, then deploy frontend
./scripts/deploy-frontend-dev.sh
```

### Step 4: Deploy Production Environment
```bash
./scripts/deploy-backend-prod.sh
./scripts/deploy-frontend-prod.sh
```

### Step 5: Verify Deployment
```bash
# Test backend health
curl https://synapse-backend-dev-{hash}-el.a.run.app/health

# Test frontend
curl https://synapse-frontend-dev-{hash}-el.a.run.app/health
```

## 11. Cost Optimization Tips

### 11.1 Cloud Run Settings
- **Dev Environment:**
  - Min instances: 0 (scale to zero when not in use)
  - Max instances: 10
  - Memory: 1Gi backend, 512Mi frontend

- **Prod Environment:**
  - Min instances: 1 (keep one instance warm)
  - Max instances: 20
  - Memory: 2Gi backend, 1Gi frontend

### 11.2 Cloud SQL
- Use **Shared-core** machine type for dev
- Use **Standard** machine type for prod
- Enable automatic storage increase
- Configure backup retention (7 days dev, 30 days prod)

### 11.3 Cloud Storage
- Use **Standard** storage class for frequently accessed files
- Use **Nearline** for archived content
- Set lifecycle policies to delete old temp files

## 12. Monitoring & Logging

### 12.1 Cloud Run Metrics
- Request count
- Request latency
- Container instance count
- CPU/Memory utilization

### 12.2 Logging
All logs automatically sent to Cloud Logging:
```bash
# View backend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=synapse-backend-dev" --limit 50

# View frontend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=synapse-frontend-dev" --limit 50
```

### 12.3 Alerts Setup
```bash
# Create uptime check for backend
gcloud monitoring uptime create synapse-backend-dev-uptime \
  --display-name="Synapse Backend Dev Uptime" \
  --resource-type="uptime-url" \
  --path="/health" \
  --hostname="synapse-backend-dev-{hash}-el.a.run.app"
```

## 13. Database Password Management

**Important:** The deployment scripts have `PASSWORD_PLACEHOLDER` in the DATABASE_URL. You need to update the scripts to use the actual password from Secret Manager.

**Updated approach - Use secret for complete DATABASE_URL:**

1. Create database URL secrets:
```bash
echo -n "postgresql+asyncpg://dev_user:actual_dev_password@/dev" | gcloud secrets create dev-database-url --data-file=-
echo -n "postgresql+asyncpg://prod_user:actual_prod_password@/prod" | gcloud secrets create prod-database-url --data-file=-
```

2. Update deployment scripts to use:
```bash
--set-secrets DATABASE_URL=dev-database-url:latest
```

## 14. Troubleshooting

### Common Issues

**Issue 1: Cloud SQL connection fails**
- Check Cloud SQL instance is running
- Verify Cloud SQL connection name matches
- Check service account has Cloud SQL Client role
- Review logs: `gcloud logging read "severity>=ERROR"`

**Issue 2: Frontend can't reach backend**
- Verify backend URL is correct in frontend build
- Check CORS settings in backend
- Test backend directly with curl

**Issue 3: Secrets not accessible**
- Verify secret exists: `gcloud secrets list`
- Check IAM permissions: `gcloud secrets get-iam-policy {secret-name}`
- Verify service account has Secret Accessor role

**Issue 4: Storage upload fails**
- Check GCS bucket exists: `gsutil ls`
- Verify service account has Storage Object Admin role
- Check bucket location matches region

## 15. Next Steps

1. ✅ Review this deployment plan
2. ⬜ Create Dockerfiles for Cloud Run
3. ⬜ Create nginx configuration for Cloud Run
4. ⬜ Set up secrets in Secret Manager
5. ⬜ Create deployment scripts
6. ⬜ Test development deployment
7. ⬜ Test production deployment
8. ⬜ Set up CI/CD pipeline
9. ⬜ Configure monitoring and alerts
10. ⬜ Set up custom domain (optional)

---

**Questions or Issues?**
- Review GCP Cloud Run docs: https://cloud.google.com/run/docs
- Check Cloud SQL connection guide: https://cloud.google.com/sql/docs/postgres/connect-run
- Secret Manager guide: https://cloud.google.com/secret-manager/docs
