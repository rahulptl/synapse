# Synapse Mumbai - Quick Start Guide

## Your Configuration Summary

- **Project**: `synapse`
- **Region**: `asia-south1` (Mumbai)
- **Cloud SQL Instance**: `synapse`
- **Databases**: `local`, `dev`, `prod`
- **Storage Bucket**: `synapse_storage`
- **Storage Folders**: `local/`, `dev/`, `prod/`

## Updated Files

All configuration files have been updated for Mumbai region:

### Backend Environment Files
- ✅ **backend/.env.local** - Local dev (via Cloud SQL Proxy)
  - Database: `local`
  - User: `local_user`
  - Storage: `synapse_storage/local`

- ✅ **backend/.env.dev** - Development (Cloud Run Mumbai)
  - Database: `dev`
  - User: `dev_user`
  - Storage: `synapse_storage` (files in `dev/` folder)
  - Connection: `synapse:asia-south1:synapse`

- ✅ **backend/.env.prod** - Production (Cloud Run Mumbai)
  - Database: `prod`
  - User: `prod_user`
  - Storage: `synapse_storage` (files in `prod/` folder)
  - Connection: `synapse:asia-south1:synapse`

### Frontend Environment Files
- ✅ **frontend/.env.local** - Points to `localhost:8000`
- ✅ **frontend/.env.development** - Points to Cloud Run dev (Mumbai)
- ✅ **frontend/.env.production** - Points to Cloud Run prod (Mumbai)

### Code Updates
- ✅ **backend/app/core/storage.py** - Auto-detects environment folders
  - Local → stores in `synapse_storage/local/`
  - Development → stores in `synapse_storage/dev/`
  - Production → stores in `synapse_storage/prod/`

## Quick Commands

### Option 1: Use Deployment Script (Easiest)

```bash
# Make script executable (one time)
chmod +x deploy-mumbai.sh

# Run local development
./deploy-mumbai.sh local

# Deploy to dev
./deploy-mumbai.sh dev

# Deploy to prod (with confirmation)
./deploy-mumbai.sh prod
```

### Option 2: Manual Commands

#### Local Development

```bash
# Terminal 1: Cloud SQL Proxy
cloud-sql-proxy synapse:asia-south1:synapse

# Terminal 2: Backend
cd backend
source env/bin/activate
uvicorn app.main:app --reload --env-file .env.local

# Terminal 3: Frontend
cd frontend
npm run dev
```

#### Deploy to Development (Mumbai)

```bash
# 1. Build backend
cd backend
gcloud builds submit --tag asia-south1-docker.pkg.dev/synapse/synapse/backend:dev

# 2. Deploy backend
gcloud run deploy synapse-backend-dev \
  --image asia-south1-docker.pkg.dev/synapse/synapse/backend:dev \
  --region asia-south1 \
  --set-env-vars "ENVIRONMENT=development,STORAGE_BACKEND=gcs,GCS_BUCKET_NAME=synapse_storage,GCS_PROJECT_ID=synapse,CLOUD_SQL_CONNECTION_NAME=synapse:asia-south1:synapse,DATABASE_URL=postgresql+asyncpg://dev_user@/dev" \
  --set-secrets "SECRET_KEY=jwt-secret-key:latest,OPENAI_API_KEY=openai-api-key:latest" \
  --add-cloudsql-instances synapse:asia-south1:synapse

# 3. Get backend URL
gcloud run services describe synapse-backend-dev --region asia-south1 --format "value(status.url)"

# 4. Build frontend (replace BACKEND_URL with actual URL)
cd frontend
gcloud builds submit --tag asia-south1-docker.pkg.dev/synapse/synapse/frontend:dev \
  --substitutions _VITE_BACKEND_API_URL="BACKEND_URL"

# 5. Deploy frontend
gcloud run deploy synapse-frontend-dev \
  --image asia-south1-docker.pkg.dev/synapse/synapse/frontend:dev \
  --region asia-south1
```

## Before First Run

### 1. Update Backend .env.local

```bash
# Edit backend/.env.local
DATABASE_URL=postgresql+asyncpg://local_user:YOUR_ACTUAL_PASSWORD@localhost:5432/local
OPENAI_API_KEY=sk-YOUR_ACTUAL_OPENAI_KEY
GOOGLE_APPLICATION_CREDENTIALS=/Users/YOUR_USERNAME/synapse-local-dev-key.json
```

### 2. Update Frontend .env.local

```bash
# Edit frontend/.env.local
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-actual-supabase-key
```

### 3. Create Service Account (One Time)

```bash
# Create service account
gcloud iam service-accounts create synapse-local-dev \
  --project=synapse \
  --display-name="Synapse Local Development"

# Grant permissions
gcloud projects add-iam-policy-binding synapse \
  --member="serviceAccount:synapse-local-dev@synapse.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding synapse \
  --member="serviceAccount:synapse-local-dev@synapse.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Download key
gcloud iam service-accounts keys create ~/synapse-local-dev-key.json \
  --iam-account=synapse-local-dev@synapse.iam.gserviceaccount.com
```

### 4. Create Secrets (One Time)

```bash
# Create secrets for dev/prod
echo -n "YOUR_SECRET_KEY" | gcloud secrets create jwt-secret-key --data-file=-
echo -n "sk-YOUR_OPENAI_KEY" | gcloud secrets create openai-api-key --data-file=-

# Grant access to Cloud Run
PROJECT_NUMBER=$(gcloud projects describe synapse --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding jwt-secret-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Storage Behavior

The code automatically organizes files by environment:

### Local Development
```python
# GCS_BUCKET_NAME=synapse_storage/local or synapse_storage
# ENVIRONMENT=local
# Files stored at: gs://synapse_storage/local/your-file.pdf
```

### Development (Cloud Run)
```python
# GCS_BUCKET_NAME=synapse_storage
# ENVIRONMENT=development
# Files stored at: gs://synapse_storage/dev/your-file.pdf
```

### Production (Cloud Run)
```python
# GCS_BUCKET_NAME=synapse_storage
# ENVIRONMENT=production
# Files stored at: gs://synapse_storage/prod/your-file.pdf
```

## Mumbai Region Notes

### Cloud Run URLs
- Format: `https://SERVICE-NAME-HASH-el.a.run.app`
- Example: `https://synapse-backend-dev-abc123-el.a.run.app`

### Artifact Registry
- Location: `asia-south1-docker.pkg.dev/synapse/synapse/`

### Latency
- Lower latency for users in India/Asia
- Higher latency for users in US/Europe

## Verification Checklist

### Local Development
- [ ] Cloud SQL Proxy installed
- [ ] Service account key downloaded
- [ ] `.env.local` updated with real values
- [ ] Can connect to Cloud SQL: `cloud-sql-proxy synapse:asia-south1:synapse`
- [ ] Backend starts: `uvicorn app.main:app --reload --env-file .env.local`
- [ ] Frontend starts: `npm run dev`
- [ ] Can access app at http://localhost:8080

### Cloud Deployment
- [ ] Artifact Registry created in Mumbai (`asia-south1`)
- [ ] Secrets created (jwt-secret-key, openai-api-key)
- [ ] Cloud Run service account has secret access
- [ ] Cloud Run service account has storage access
- [ ] Backend deployed to Cloud Run (dev)
- [ ] Frontend deployed to Cloud Run (dev)
- [ ] Can access dev URLs
- [ ] Files uploaded to correct folder (`dev/`)

## Common Issues

### Issue: "port 5432 already in use"
**Solution:** Kill existing Cloud SQL Proxy
```bash
pkill cloud-sql-proxy
# Then restart
cloud-sql-proxy synapse:asia-south1:synapse
```

### Issue: "permission denied" on storage
**Solution:** Grant storage permissions
```bash
PROJECT_NUMBER=$(gcloud projects describe synapse --format="value(projectNumber)")
gcloud storage buckets add-iam-policy-binding gs://synapse_storage \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### Issue: Backend can't connect to database
**Solution:** Verify Cloud SQL connection name
```bash
# Should be: synapse:asia-south1:synapse
gcloud run services describe synapse-backend-dev \
  --region asia-south1 \
  --format "value(spec.template.spec.containers[0].env)"
```

### Issue: Frontend shows "Network Error"
**Solution:** Rebuild frontend with correct backend URL
```bash
# Get backend URL
BACKEND_URL=$(gcloud run services describe synapse-backend-dev --region asia-south1 --format "value(status.url)")

# Rebuild frontend
cd frontend
gcloud builds submit --tag asia-south1-docker.pkg.dev/synapse/synapse/frontend:dev \
  --substitutions _VITE_BACKEND_API_URL="$BACKEND_URL"

# Redeploy
gcloud run deploy synapse-frontend-dev \
  --image asia-south1-docker.pkg.dev/synapse/synapse/frontend:dev \
  --region asia-south1
```

## Next Steps

1. **Test Local Development**
   - Run `./deploy-mumbai.sh local`
   - Verify all features work

2. **Deploy to Dev**
   - Run `./deploy-mumbai.sh dev`
   - Test deployed app

3. **Deploy to Prod**
   - Run `./deploy-mumbai.sh prod`
   - Monitor logs and performance

4. **Optional Enhancements**
   - Set up custom domains
   - Configure Cloud CDN
   - Set up monitoring alerts
   - Implement CI/CD with Cloud Build triggers

## File Reference

- **MUMBAI_DEPLOYMENT.md** - Detailed deployment guide
- **deploy-mumbai.sh** - Automated deployment script
- **CLOUD_SQL_PROXY_GUIDE.md** - Cloud SQL Proxy documentation
- **GCP_COST_BREAKDOWN.md** - Cost analysis
- **DEPLOYMENT_GUIDE.md** - General deployment guide

---

**Everything is configured for Mumbai (asia-south1)!**

Your databases: `local`, `dev`, `prod`
Your storage: `synapse_storage` with folders `local/`, `dev/`, `prod/`
Your region: Mumbai (asia-south1)
