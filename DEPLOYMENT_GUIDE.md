# Synapse - GCP Deployment Guide

## Overview

This guide provides step-by-step instructions to build and deploy the Synapse application to Google Cloud Platform (GCP) using Cloud Run.

## Prerequisites

- GCP Project with billing enabled
- Cloud SQL instances set up (local, dev, prod databases)
- Cloud Storage buckets created (synapse-storage-local, synapse-storage-dev, synapse-storage-prod)
- Docker installed locally (optional, for local builds)
- gcloud CLI installed and configured

## Architecture

### Environments

| Environment | Backend | Frontend | Database | Storage Bucket |
|-------------|---------|----------|----------|----------------|
| **Local** | localhost:8000 | localhost:8080 | synapse_local (via proxy) | synapse-storage-local |
| **Dev** | Cloud Run | Cloud Run | synapse_dev | synapse-storage-dev |
| **Prod** | Cloud Run | Cloud Run | synapse_prod | synapse-storage-prod |

## Code Changes Summary

### Backend Changes

✅ **config.py** - Added:
- `GCS_BUCKET_NAME` - GCS bucket name
- `GCS_PROJECT_ID` - GCP project ID
- `GOOGLE_APPLICATION_CREDENTIALS` - Service account key path (local only)
- `CLOUD_SQL_CONNECTION_NAME` - Cloud SQL connection string

✅ **storage.py** - Added:
- `GCSStorageBackend` class for Google Cloud Storage

✅ **database.py** - Added:
- `get_database_url()` function to handle Cloud SQL Unix socket connections

### Frontend Changes

✅ **Dockerfile** - Created multi-stage build with nginx
✅ **nginx.conf** - Created nginx configuration for SPA routing

## Environment Files

### Backend Environment Files

**`.env.local`** - Local development
```bash
ENVIRONMENT=local
DATABASE_URL=postgresql+asyncpg://synapse_local_user:PASSWORD@localhost:5432/synapse_local
STORAGE_BACKEND=local
```

**`.env.dev`** - Development (Cloud Run)
```bash
ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://synapse_dev_user:PASSWORD@/synapse_dev
CLOUD_SQL_CONNECTION_NAME=PROJECT_ID:us-central1:synapse-dev
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=synapse-storage-dev
```

**`.env.prod`** - Production (Cloud Run)
```bash
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://synapse_prod_user:PASSWORD@/synapse_prod
CLOUD_SQL_CONNECTION_NAME=PROJECT_ID:us-central1:synapse-prod
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=synapse-storage-prod
```

### Frontend Environment Files

**`.env.local`**
```bash
VITE_BACKEND_API_URL=http://localhost:8000
```

**`.env.development`**
```bash
VITE_BACKEND_API_URL=https://synapse-backend-dev-xxx.run.app
```

**`.env.production`**
```bash
VITE_BACKEND_API_URL=https://synapse-backend-prod-xxx.run.app
```

## Local Development Setup

### 1. Install Cloud SQL Proxy

**macOS (ARM):**
```bash
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.arm64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/
```

**macOS (Intel):**
```bash
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.amd64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/
```

**Windows:**
Download from: https://cloud.google.com/sql/docs/postgres/sql-proxy

### 2. Create Service Account for Local Development

```bash
# Create service account
gcloud iam service-accounts create synapse-local-dev \
  --display-name="Synapse Local Development"

# Grant permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:synapse-local-dev@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:synapse-local-dev@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Create and download key
gcloud iam service-accounts keys create synapse-local-dev-key.json \
  --iam-account=synapse-local-dev@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 3. Update Environment Files

Update `backend/.env.local`:
```bash
# Replace placeholders
DATABASE_URL=postgresql+asyncpg://synapse_local_user:YOUR_ACTUAL_PASSWORD@localhost:5432/synapse_local
OPENAI_API_KEY=your-actual-openai-key

# For GCS local dev (optional)
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=synapse-storage-local
GCS_PROJECT_ID=YOUR_PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS=/path/to/synapse-local-dev-key.json
```

Update `frontend/.env.local`:
```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-actual-anon-key
```

### 4. Run Locally

**Terminal 1 - Start Cloud SQL Proxy:**
```bash
cloud-sql-proxy YOUR_PROJECT_ID:us-central1:synapse-dev
```

**Terminal 2 - Start Backend:**
```bash
cd backend
source env/bin/activate  # or 'venv\Scripts\activate' on Windows
uvicorn app.main:app --reload --env-file .env.local
```

**Terminal 3 - Start Frontend:**
```bash
cd frontend
npm install  # first time only
npm run dev
```

Access app at: http://localhost:8080

## Building Docker Images

### Option 1: Local Build (using Docker)

#### Backend

```bash
cd backend

# Build for dev
docker build -t gcr.io/YOUR_PROJECT_ID/synapse-backend:dev .

# Build for prod
docker build -t gcr.io/YOUR_PROJECT_ID/synapse-backend:prod .

# Push to Google Container Registry
gcloud auth configure-docker
docker push gcr.io/YOUR_PROJECT_ID/synapse-backend:dev
docker push gcr.io/YOUR_PROJECT_ID/synapse-backend:prod
```

#### Frontend

**Important:** Frontend needs backend URL baked in at build time.

```bash
cd frontend

# Build for dev
docker build \
  --build-arg VITE_BACKEND_API_URL=https://synapse-backend-dev-xxx.run.app \
  --build-arg VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=your-key \
  -t gcr.io/YOUR_PROJECT_ID/synapse-frontend:dev .

# Build for prod
docker build \
  --build-arg VITE_BACKEND_API_URL=https://synapse-backend-prod-xxx.run.app \
  --build-arg VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=your-key \
  -t gcr.io/YOUR_PROJECT_ID/synapse-frontend:prod .

# Push images
docker push gcr.io/YOUR_PROJECT_ID/synapse-frontend:dev
docker push gcr.io/YOUR_PROJECT_ID/synapse-frontend:prod
```

### Option 2: Cloud Build (using GCP)

#### Setup Artifact Registry

```bash
# Create repository (one-time setup)
gcloud artifacts repositories create synapse \
  --repository-format=docker \
  --location=us-central1 \
  --description="Synapse container images"

# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev
```

#### Build Backend

```bash
cd backend

gcloud builds submit \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/backend:dev

gcloud builds submit \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/backend:prod
```

#### Build Frontend

```bash
cd frontend

# Dev build
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/frontend:dev \
  --substitutions=\
_VITE_BACKEND_API_URL="https://synapse-backend-dev-xxx.run.app",\
_VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co",\
_VITE_SUPABASE_PUBLISHABLE_KEY="your-key"

# Prod build
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/frontend:prod \
  --substitutions=\
_VITE_BACKEND_API_URL="https://synapse-backend-prod-xxx.run.app",\
_VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co",\
_VITE_SUPABASE_PUBLISHABLE_KEY="your-key"
```

## Deploying to Cloud Run

### Prerequisites - Secret Manager Setup

Create secrets before deploying:

```bash
# Create secrets
echo -n "YOUR_SECRET_KEY" | gcloud secrets create jwt-secret-key --data-file=-
echo -n "YOUR_OPENAI_KEY" | gcloud secrets create openai-api-key --data-file=-
echo -n "DEV_DB_PASSWORD" | gcloud secrets create db-password-dev --data-file=-
echo -n "PROD_DB_PASSWORD" | gcloud secrets create db-password-prod --data-file=-

# Grant Cloud Run service account access
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

for secret in jwt-secret-key openai-api-key db-password-dev db-password-prod; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

### Deploy Backend - Development

```bash
gcloud run deploy synapse-backend-dev \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/backend:dev \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "\
ENVIRONMENT=development,\
STORAGE_BACKEND=gcs,\
GCS_BUCKET_NAME=synapse-storage-dev,\
GCS_PROJECT_ID=YOUR_PROJECT_ID,\
CLOUD_SQL_CONNECTION_NAME=YOUR_PROJECT_ID:us-central1:synapse-dev,\
DATABASE_URL=postgresql+asyncpg://synapse_dev_user@/synapse_dev" \
  --set-secrets "\
SECRET_KEY=jwt-secret-key:latest,\
OPENAI_API_KEY=openai-api-key:latest" \
  --add-cloudsql-instances YOUR_PROJECT_ID:us-central1:synapse-dev \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300
```

**Get the backend URL:**
```bash
gcloud run services describe synapse-backend-dev \
  --region us-central1 \
  --format "value(status.url)"
```

### Deploy Backend - Production

```bash
gcloud run deploy synapse-backend-prod \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/backend:prod \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "\
ENVIRONMENT=production,\
STORAGE_BACKEND=gcs,\
GCS_BUCKET_NAME=synapse-storage-prod,\
GCS_PROJECT_ID=YOUR_PROJECT_ID,\
CLOUD_SQL_CONNECTION_NAME=YOUR_PROJECT_ID:us-central1:synapse-prod,\
DATABASE_URL=postgresql+asyncpg://synapse_prod_user@/synapse_prod" \
  --set-secrets "\
SECRET_KEY=jwt-secret-key:latest,\
OPENAI_API_KEY=openai-api-key:latest" \
  --add-cloudsql-instances YOUR_PROJECT_ID:us-central1:synapse-prod \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 50 \
  --timeout 300
```

### Rebuild Frontend with Backend URLs

After backend deployment, rebuild frontend with correct URLs:

```bash
cd frontend

# Dev frontend
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/frontend:dev \
  --substitutions=\
_VITE_BACKEND_API_URL="https://ACTUAL_BACKEND_DEV_URL",\
_VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co",\
_VITE_SUPABASE_PUBLISHABLE_KEY="your-key"

# Prod frontend
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/frontend:prod \
  --substitutions=\
_VITE_BACKEND_API_URL="https://ACTUAL_BACKEND_PROD_URL",\
_VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co",\
_VITE_SUPABASE_PUBLISHABLE_KEY="your-key"
```

### Deploy Frontend - Development

```bash
gcloud run deploy synapse-frontend-dev \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/frontend:dev \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --timeout 60
```

### Deploy Frontend - Production

```bash
gcloud run deploy synapse-frontend-prod \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/frontend:prod \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 20 \
  --timeout 60
```

## Deployment Workflow Summary

### First-Time Deployment

1. **Setup GCP resources** (one-time):
   - Cloud SQL instances
   - Cloud Storage buckets
   - Secret Manager secrets
   - Artifact Registry repository

2. **Build and deploy backend**:
   ```bash
   # Build backend image
   cd backend && gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT/synapse/backend:dev

   # Deploy backend
   gcloud run deploy synapse-backend-dev [options...]

   # Get backend URL
   gcloud run services describe synapse-backend-dev --format="value(status.url)"
   ```

3. **Build and deploy frontend** (with backend URL):
   ```bash
   # Build frontend with backend URL
   cd frontend && gcloud builds submit --tag ... --substitutions _VITE_BACKEND_API_URL="[backend-url]"

   # Deploy frontend
   gcloud run deploy synapse-frontend-dev [options...]
   ```

### Subsequent Deployments

**Backend updates:**
```bash
cd backend
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT/synapse/backend:dev
gcloud run deploy synapse-backend-dev --image us-central1-docker.pkg.dev/PROJECT/synapse/backend:dev
```

**Frontend updates:**
```bash
cd frontend
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT/synapse/frontend:dev \
  --substitutions _VITE_BACKEND_API_URL="[backend-url]"
gcloud run deploy synapse-frontend-dev --image us-central1-docker.pkg.dev/PROJECT/synapse/frontend:dev
```

## Testing Deployments

### Test Backend

```bash
# Health check
curl https://synapse-backend-dev-xxx.run.app/health

# API endpoint (requires authentication)
curl https://synapse-backend-dev-xxx.run.app/api/v1/folders \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Frontend

Visit in browser:
- Dev: https://synapse-frontend-dev-xxx.run.app
- Prod: https://synapse-frontend-prod-xxx.run.app

## Troubleshooting

### Backend won't start

1. **Check logs:**
   ```bash
   gcloud run services logs read synapse-backend-dev --limit 50
   ```

2. **Common issues:**
   - Cloud SQL connection: Verify `CLOUD_SQL_CONNECTION_NAME`
   - Database password: Check secret is accessible
   - GCS bucket: Verify service account has permissions

### Frontend shows connection errors

1. **Check backend URL in build:**
   - Frontend must be rebuilt with correct `VITE_BACKEND_API_URL`

2. **Check CORS settings** in `backend/app/middleware/cors.py`

### Database connection errors

1. **Verify Cloud SQL instance is running**
2. **Check database exists and user has permissions**
3. **Verify Cloud Run service has Cloud SQL connection configured**

## Monitoring

### View Logs

```bash
# Backend logs
gcloud run services logs read synapse-backend-dev --limit 100

# Frontend logs
gcloud run services logs read synapse-frontend-dev --limit 100
```

### Monitor in Console

1. Go to **Cloud Run** → Select service
2. Click **LOGS** tab
3. Use **Metrics** tab for performance monitoring

## Cost Optimization

### Development Environment

```bash
# Set min instances to 0 (scales to zero)
gcloud run services update synapse-backend-dev --min-instances 0
gcloud run services update synapse-frontend-dev --min-instances 0
```

### Production Environment

```bash
# Set appropriate min instances for uptime
gcloud run services update synapse-backend-prod --min-instances 1
gcloud run services update synapse-frontend-prod --min-instances 1
```

## CI/CD Setup (Optional)

See `GCP_MIGRATION_UI_GUIDE.md` for setting up automated deployments with Cloud Build triggers.

## Rollback

### Rollback to previous revision

```bash
# List revisions
gcloud run revisions list --service synapse-backend-dev

# Rollback
gcloud run services update-traffic synapse-backend-dev \
  --to-revisions REVISION_NAME=100
```

## Summary Checklist

- [ ] Local development working with Cloud SQL Proxy
- [ ] Backend Docker image builds successfully
- [ ] Frontend Docker image builds successfully
- [ ] Secrets created in Secret Manager
- [ ] Backend deployed to Cloud Run (dev)
- [ ] Backend URL obtained and tested
- [ ] Frontend rebuilt with backend URL
- [ ] Frontend deployed to Cloud Run (dev)
- [ ] Application tested end-to-end (dev)
- [ ] Production deployment completed
- [ ] Custom domains configured (optional)
- [ ] Monitoring and alerts set up

---

**For detailed UI-based deployment instructions, see `GCP_MIGRATION_UI_GUIDE.md`**

**For cost analysis, see `GCP_COST_BREAKDOWN.md`**
