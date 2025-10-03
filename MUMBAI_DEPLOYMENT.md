# Synapse - Mumbai (Asia-South1) Deployment Guide

## Your Specific Configuration

### Project Details
- **GCP Project ID**: `synapse`
- **Region**: `asia-south1` (Mumbai)
- **Cloud SQL Instance**: `synapse`

### Databases
- **Local**: `local` (user: `local_user`)
- **Development**: `dev` (user: `dev_user`)
- **Production**: `prod` (user: `prod_user`)

### Storage
- **Bucket**: `synapse_storage`
- **Folders**:
  - `local/` - Local development files
  - `dev/` - Development environment files
  - `prod/` - Production environment files

## Quick Setup Commands

### 1. Install Cloud SQL Proxy

**macOS (M1/M2/M3):**
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

### 2. Create Service Account for Local Development

```bash
# Create service account
gcloud iam service-accounts create synapse-local-dev \
  --project=synapse \
  --display-name="Synapse Local Development"

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding synapse \
  --member="serviceAccount:synapse-local-dev@synapse.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Grant Storage Object Admin role
gcloud projects add-iam-policy-binding synapse \
  --member="serviceAccount:synapse-local-dev@synapse.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Create and download key
gcloud iam service-accounts keys create ~/synapse-local-dev-key.json \
  --iam-account=synapse-local-dev@synapse.iam.gserviceaccount.com \
  --project=synapse
```

### 3. Update Environment Files

**`backend/.env.local`:**
```bash
# Update these values:
DATABASE_URL=postgresql+asyncpg://local_user:YOUR_ACTUAL_PASSWORD@localhost:5432/local
OPENAI_API_KEY=sk-YOUR_ACTUAL_OPENAI_KEY
GOOGLE_APPLICATION_CREDENTIALS=/Users/YOUR_USERNAME/synapse-local-dev-key.json
```

**`frontend/.env.local`:**
```bash
# Update Supabase values:
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-actual-supabase-anon-key
```

### 4. Run Locally

```bash
# Terminal 1: Start Cloud SQL Proxy for Mumbai
cloud-sql-proxy synapse:asia-south1:synapse

# Terminal 2: Start Backend
cd backend
source env/bin/activate
uvicorn app.main:app --reload --env-file .env.local

# Terminal 3: Start Frontend
cd frontend
npm run dev
```

Access at: http://localhost:8080

## Deployment to Cloud Run (Mumbai)

### 1. Enable Required APIs

```bash
gcloud services enable run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sql-component.googleapis.com \
  --project=synapse
```

### 2. Create Artifact Registry Repository

```bash
gcloud artifacts repositories create synapse \
  --repository-format=docker \
  --location=asia-south1 \
  --description="Synapse container images" \
  --project=synapse
```

### 3. Create Secrets in Secret Manager

```bash
# JWT Secret Key
echo -n "YOUR_SECURE_SECRET_KEY" | gcloud secrets create jwt-secret-key \
  --data-file=- \
  --project=synapse

# OpenAI API Key
echo -n "sk-YOUR_OPENAI_KEY" | gcloud secrets create openai-api-key \
  --data-file=- \
  --project=synapse

# Database Passwords
echo -n "YOUR_DEV_DB_PASSWORD" | gcloud secrets create db-password-dev \
  --data-file=- \
  --project=synapse

echo -n "YOUR_PROD_DB_PASSWORD" | gcloud secrets create db-password-prod \
  --data-file=- \
  --project=synapse
```

### 4. Grant Secret Access to Cloud Run

```bash
# Get project number
PROJECT_NUMBER=$(gcloud projects describe synapse --format="value(projectNumber)")

# Grant access to each secret
for secret in jwt-secret-key openai-api-key db-password-dev db-password-prod; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=synapse
done
```

### 5. Configure Storage Bucket Permissions

```bash
# Grant Cloud Run service account access to storage
gcloud storage buckets add-iam-policy-binding gs://synapse_storage \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin" \
  --project=synapse
```

### 6. Build Backend Image

```bash
cd backend

gcloud builds submit \
  --tag asia-south1-docker.pkg.dev/synapse/synapse/backend:dev \
  --project=synapse

gcloud builds submit \
  --tag asia-south1-docker.pkg.dev/synapse/synapse/backend:prod \
  --project=synapse
```

### 7. Deploy Backend - Development

```bash
gcloud run deploy synapse-backend-dev \
  --image asia-south1-docker.pkg.dev/synapse/synapse/backend:dev \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "\
ENVIRONMENT=development,\
STORAGE_BACKEND=gcs,\
GCS_BUCKET_NAME=synapse_storage,\
GCS_PROJECT_ID=synapse,\
CLOUD_SQL_CONNECTION_NAME=synapse:asia-south1:synapse,\
DATABASE_URL=postgresql+asyncpg://dev_user@/dev" \
  --set-secrets "\
SECRET_KEY=jwt-secret-key:latest,\
OPENAI_API_KEY=openai-api-key:latest" \
  --add-cloudsql-instances synapse:asia-south1:synapse \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --project=synapse
```

**Get the backend URL:**
```bash
gcloud run services describe synapse-backend-dev \
  --region asia-south1 \
  --format "value(status.url)" \
  --project=synapse
```

### 8. Deploy Backend - Production

```bash
gcloud run deploy synapse-backend-prod \
  --image asia-south1-docker.pkg.dev/synapse/synapse/backend:prod \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "\
ENVIRONMENT=production,\
STORAGE_BACKEND=gcs,\
GCS_BUCKET_NAME=synapse_storage,\
GCS_PROJECT_ID=synapse,\
CLOUD_SQL_CONNECTION_NAME=synapse:asia-south1:synapse,\
DATABASE_URL=postgresql+asyncpg://prod_user@/prod" \
  --set-secrets "\
SECRET_KEY=jwt-secret-key:latest,\
OPENAI_API_KEY=openai-api-key:latest" \
  --add-cloudsql-instances synapse:asia-south1:synapse \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 50 \
  --timeout 300 \
  --project=synapse
```

### 9. Build Frontend Images

**Important:** Replace `BACKEND_DEV_URL` and `BACKEND_PROD_URL` with actual URLs from step 7 and 8.

```bash
cd frontend

# Dev Frontend
gcloud builds submit \
  --tag asia-south1-docker.pkg.dev/synapse/synapse/frontend:dev \
  --substitutions=\
_VITE_BACKEND_API_URL="https://BACKEND_DEV_URL",\
_VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co",\
_VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-key" \
  --project=synapse

# Prod Frontend
gcloud builds submit \
  --tag asia-south1-docker.pkg.dev/synapse/synapse/frontend:prod \
  --substitutions=\
_VITE_BACKEND_API_URL="https://BACKEND_PROD_URL",\
_VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co",\
_VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-key" \
  --project=synapse
```

### 10. Deploy Frontend - Development

```bash
gcloud run deploy synapse-frontend-dev \
  --image asia-south1-docker.pkg.dev/synapse/synapse/frontend:dev \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5 \
  --timeout 60 \
  --project=synapse
```

### 11. Deploy Frontend - Production

```bash
gcloud run deploy synapse-frontend-prod \
  --image asia-south1-docker.pkg.dev/synapse/synapse/frontend:prod \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 20 \
  --timeout 60 \
  --project=synapse
```

### 12. Get Frontend URLs

```bash
# Dev Frontend URL
gcloud run services describe synapse-frontend-dev \
  --region asia-south1 \
  --format "value(status.url)" \
  --project=synapse

# Prod Frontend URL
gcloud run services describe synapse-frontend-prod \
  --region asia-south1 \
  --format "value(status.url)" \
  --project=synapse
```

## Storage Folder Structure

Your storage will automatically organize files by environment:

```
synapse_storage/
├── local/
│   ├── user_uploads/
│   └── processed_files/
├── dev/
│   ├── user_uploads/
│   └── processed_files/
└── prod/
    ├── user_uploads/
    └── processed_files/
```

The code automatically adds the correct folder prefix based on the `ENVIRONMENT` variable:
- Local: Files stored in `synapse_storage/local/...`
- Development: Files stored in `synapse_storage/dev/...`
- Production: Files stored in `synapse_storage/prod/...`

## Database Setup

### Verify Databases Exist

```bash
# Connect to Cloud SQL instance
gcloud sql connect synapse --user=postgres --project=synapse

# In psql, check databases:
\l

# Should see:
# - local
# - dev
# - prod
```

### Create Databases (if needed)

```sql
-- Create databases
CREATE DATABASE local;
CREATE DATABASE dev;
CREATE DATABASE prod;

-- Create users
CREATE USER local_user WITH PASSWORD 'your_local_password';
CREATE USER dev_user WITH PASSWORD 'your_dev_password';
CREATE USER prod_user WITH PASSWORD 'your_prod_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE local TO local_user;
GRANT ALL PRIVILEGES ON DATABASE dev TO dev_user;
GRANT ALL PRIVILEGES ON DATABASE prod TO prod_user;

-- Install pgvector extension (for each database)
\c local
CREATE EXTENSION IF NOT EXISTS vector;

\c dev
CREATE EXTENSION IF NOT EXISTS vector;

\c prod
CREATE EXTENSION IF NOT EXISTS vector;
```

## Testing

### Test Backend

```bash
# Health check
curl https://synapse-backend-dev-XXXXX-el.a.run.app/health

# Should return:
# {"status":"healthy","environment":"development"}
```

### Test Frontend

Visit in browser:
- Dev: https://synapse-frontend-dev-XXXXX-el.a.run.app
- Prod: https://synapse-frontend-prod-XXXXX-el.a.run.app

## Mumbai Region Specifics

### Cloud Run URL Format
- Mumbai region Cloud Run URLs end with `-el.a.run.app`
- Example: `https://synapse-backend-dev-abc123-el.a.run.app`

### Artifact Registry
- Location: `asia-south1`
- Registry path: `asia-south1-docker.pkg.dev/synapse/synapse/`

### Cloud SQL
- Connection name: `synapse:asia-south1:synapse`
- Instance region: `asia-south1` (Mumbai)

### Storage
- Bucket location: Multi-region or `asia-south1`
- Bucket name: `synapse_storage`

## Troubleshooting

### Cloud SQL Connection Issues

```bash
# Test Cloud SQL connection
gcloud sql connect synapse --user=postgres --project=synapse

# Check instance status
gcloud sql instances describe synapse --project=synapse
```

### Storage Permission Issues

```bash
# Verify bucket exists
gsutil ls gs://synapse_storage

# Check permissions
gsutil iam get gs://synapse_storage

# List files in dev folder
gsutil ls gs://synapse_storage/dev/
```

### Backend Logs

```bash
# View recent logs
gcloud run services logs read synapse-backend-dev \
  --region asia-south1 \
  --limit 50 \
  --project=synapse
```

### Frontend Build Issues

If frontend can't connect to backend:
1. Verify backend URL is correct in frontend build
2. Rebuild frontend with correct `VITE_BACKEND_API_URL`
3. Redeploy frontend

## Cost Optimization for Mumbai Region

Mumbai region pricing is slightly higher than US regions, but still within Cloud Run free tier:

**Monthly Estimates (Mumbai):**
- Dev Environment: ₹1,500 - ₹2,500 (~$18-30)
- Prod Environment: ₹8,000 - ₹15,000 (~$100-180)

**Free Tier (same worldwide):**
- 180,000 vCPU-seconds/month
- 360,000 GiB-seconds/month
- 2M requests/month

## Summary Checklist

- [ ] Install Cloud SQL Proxy
- [ ] Create service account for local dev
- [ ] Update `.env.local` with actual passwords and API keys
- [ ] Test local development (all 3 terminals)
- [ ] Enable required GCP APIs
- [ ] Create Artifact Registry repository (Mumbai)
- [ ] Create secrets in Secret Manager
- [ ] Grant secret access to Cloud Run
- [ ] Configure storage bucket permissions
- [ ] Build backend images (dev & prod)
- [ ] Deploy backend dev to Cloud Run (Mumbai)
- [ ] Deploy backend prod to Cloud Run (Mumbai)
- [ ] Get backend URLs
- [ ] Build frontend images with backend URLs
- [ ] Deploy frontend dev to Cloud Run (Mumbai)
- [ ] Deploy frontend prod to Cloud Run (Mumbai)
- [ ] Test both environments end-to-end
- [ ] Set up custom domains (optional)
- [ ] Configure monitoring and alerts

---

**Region**: Mumbai (asia-south1)
**Project**: synapse
**Instance**: synapse
**Bucket**: synapse_storage
**Databases**: local, dev, prod

All commands are specific to your Mumbai setup!
