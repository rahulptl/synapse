# Cloud Run UI Deployment Guide - Backend

## Quick Start: Deploy Backend via Cloud Run UI

### Prerequisites

1. **Enable Required APIs**
```bash
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

2. **Grant IAM Permissions to Default Service Account**
```bash
# Get project number
PROJECT_NUMBER=$(gcloud projects describe synapse-473918 --format="value(projectNumber)")

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Grant Storage Object Admin role
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Grant Secret Manager Secret Accessor role
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Step 1: Build and Push Docker Image

```bash
# Authenticate with GCP
gcloud auth login
gcloud config set project synapse-473918
gcloud auth configure-docker

# Build the backend image
docker build -f backend/Dockerfile.cloudrun -t gcr.io/synapse-473918/synapse-backend-dev:latest ./backend

# Push to Google Container Registry
docker push gcr.io/synapse-473918/synapse-backend-dev:latest
```

For **production**, replace `dev` with `prod`:
```bash
docker build -f backend/Dockerfile.cloudrun -t gcr.io/synapse-473918/synapse-backend-prod:latest ./backend
docker push gcr.io/synapse-473918/synapse-backend-prod:latest
```

---

## Step 2: Create Secrets (One-Time Setup)

### Development Secrets
```bash
# Secret key for JWT tokens
echo -n "your-dev-secret-key-minimum-32-characters-long" | gcloud secrets create dev-secret-key --data-file=-

# OpenAI API key
echo -n "sk-your-openai-api-key" | gcloud secrets create dev-openai-key --data-file=-

# Grant access to service account
gcloud secrets add-iam-policy-binding dev-secret-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding dev-openai-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Production Secrets
```bash
# Use different keys for production!
echo -n "your-prod-secret-key-minimum-32-characters-long" | gcloud secrets create prod-secret-key --data-file=-
echo -n "sk-your-openai-api-key" | gcloud secrets create prod-openai-key --data-file=-

# Grant access to service account
gcloud secrets add-iam-policy-binding prod-secret-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding prod-openai-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Step 3: Deploy via Cloud Run UI

### A. Navigate to Cloud Run Console
Go to: **https://console.cloud.google.com/run?project=synapse-473918**

### B. Click "CREATE SERVICE"

### C. Configure Service

#### **1. Container Image**
- Click **"SELECT"** next to Container image URL
- Navigate to: `gcr.io/synapse-473918/synapse-backend-dev` (or `prod`)
- Select the **latest** tag
- Click **"SELECT"**

#### **2. Service Configuration**
| Field | Development | Production |
|-------|-------------|------------|
| Service name | `synapse-backend-dev` | `synapse-backend-prod` |
| Region | `asia-south1 (Mumbai)` | `asia-south1 (Mumbai)` |
| Authentication | ☑️ Allow unauthenticated invocations | ☑️ Allow unauthenticated invocations |

#### **3. Container Settings**
Click on **"CONTAINER, VARIABLES & SECRETS, CONNECTIONS, SECURITY"**

**Container Tab:**
| Setting | Development | Production |
|---------|-------------|------------|
| Container port | `8000` | `8000` |
| Memory | `1 GiB` | `2 GiB` |
| CPU | `1` | `2` |
| Request timeout | `300` | `300` |
| Maximum requests per container | `80` | `80` |

#### **4. Environment Variables**
Click **"VARIABLES & SECRETS"** tab → **"ADD VARIABLE"**

**For Development:**
```
ENVIRONMENT = development
API_V1_STR = /api/v1
CLOUD_SQL_CONNECTION_NAME = synapse-473918:asia-south1:synapse
STORAGE_BACKEND = gcs
GCS_BUCKET_NAME = synapse_storage
GCS_PROJECT_ID = synapse-473918
DATABASE_URL = postgresql+asyncpg://dev_user:YOUR_DEV_DB_PASSWORD@/dev
MAX_CONTENT_SIZE_MB = 50
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
SIMILARITY_THRESHOLD = 0.7
EMBEDDING_MODEL = text-embedding-ada-002
CHAT_MODEL = gpt-4o-mini
MAX_CHAT_HISTORY = 10
CHAT_TIMEOUT_SECONDS = 60
RATE_LIMIT_PER_MINUTE = 60
LOG_LEVEL = INFO
ENABLE_CACHING = true
CACHE_TTL_SECONDS = 3600
```

**For Production** (same as above, but change these):
```
ENVIRONMENT = production
DATABASE_URL = postgresql+asyncpg://prod_user:YOUR_PROD_DB_PASSWORD@/prod
RATE_LIMIT_PER_MINUTE = 100
LOG_LEVEL = WARNING
```

#### **5. Reference Secrets**
Still in **"VARIABLES & SECRETS"** tab:

1. Click **"REFERENCE A SECRET"**
   - Select secret: `dev-secret-key` (or `prod-secret-key` for production)
   - ☑️ Expose as environment variable
   - Name: `SECRET_KEY`
   - Version: `latest`
   - Click **"DONE"**

2. Click **"REFERENCE A SECRET"** again
   - Select secret: `dev-openai-key` (or `prod-openai-key` for production)
   - ☑️ Expose as environment variable
   - Name: `OPENAI_API_KEY`
   - Version: `latest`
   - Click **"DONE"**

#### **6. Cloud SQL Connection**
Click **"CONNECTIONS"** tab:

- Under **"Cloud SQL connections"**, click **"ADD CONNECTION"**
- Select: `synapse-473918:asia-south1:synapse`
- Click **"ADD"**

#### **7. Security & Service Account**
Click **"SECURITY"** tab:

- Service account: Leave as default
  - It will use: `{PROJECT_NUMBER}-compute@developer.gserviceaccount.com`

#### **8. Capacity (Auto-scaling)**
Click **"CAPACITY"** section at the bottom:

| Setting | Development | Production |
|---------|-------------|------------|
| Minimum instances | `0` | `1` |
| Maximum instances | `10` | `20` |

### D. Deploy
Click **"CREATE"** at the bottom

Wait 2-3 minutes for deployment to complete.

---

## Step 4: Test Your Deployment

Once deployed, you'll get a URL like:
```
https://synapse-backend-dev-XXXXXXXXXX-el.a.run.app
```

**Test the endpoints:**

```bash
# Get your service URL
SERVICE_URL=$(gcloud run services describe synapse-backend-dev --region asia-south1 --format="value(status.url)")

# Test health endpoint
curl $SERVICE_URL/health

# Open API docs in browser
open $SERVICE_URL/docs
```

---

## Step 5: Update Frontend Configuration

After backend is deployed, update your frontend build with the backend URL:

```bash
# For development frontend
export BACKEND_URL=$(gcloud run services describe synapse-backend-dev --region asia-south1 --format="value(status.url)")

echo "VITE_BACKEND_API_URL=${BACKEND_URL}" > frontend/.env.development
```

---

## Managing Environment Variables (After Initial Deployment)

### Option 1: Via Cloud Run UI
1. Go to Cloud Run Console
2. Click on your service (`synapse-backend-dev`)
3. Click **"EDIT & DEPLOY NEW REVISION"**
4. Go to **"VARIABLES & SECRETS"** tab
5. Add/Edit/Remove variables
6. Click **"DEPLOY"**

### Option 2: Via gcloud CLI
```bash
# Update a single environment variable
gcloud run services update synapse-backend-dev \
  --region asia-south1 \
  --update-env-vars LOG_LEVEL=DEBUG

# Update multiple environment variables
gcloud run services update synapse-backend-dev \
  --region asia-south1 \
  --update-env-vars LOG_LEVEL=DEBUG,RATE_LIMIT_PER_MINUTE=100

# Remove an environment variable
gcloud run services update synapse-backend-dev \
  --region asia-south1 \
  --remove-env-vars REDIS_URL
```

---

## Viewing Logs

### Via Cloud Console
1. Go to: https://console.cloud.google.com/run
2. Click on your service
3. Click **"LOGS"** tab

### Via gcloud CLI
```bash
# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=synapse-backend-dev" \
  --limit 50 \
  --format json

# Stream logs in real-time
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=synapse-backend-dev"

# Filter for errors only
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=synapse-backend-dev AND severity>=ERROR" \
  --limit 20
```

---

## Updating Your Deployment

### When you make code changes:

```bash
# 1. Build new image with a tag
docker build -f backend/Dockerfile.cloudrun -t gcr.io/synapse-473918/synapse-backend-dev:v1.0.1 ./backend

# 2. Also tag as latest
docker tag gcr.io/synapse-473918/synapse-backend-dev:v1.0.1 gcr.io/synapse-473918/synapse-backend-dev:latest

# 3. Push both tags
docker push gcr.io/synapse-473918/synapse-backend-dev:v1.0.1
docker push gcr.io/synapse-473918/synapse-backend-dev:latest

# 4. Deploy via UI or CLI
gcloud run deploy synapse-backend-dev \
  --image gcr.io/synapse-473918/synapse-backend-dev:latest \
  --region asia-south1
```

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ENVIRONMENT` | Environment name | `development` or `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://user:pass@/dbname` |
| `CLOUD_SQL_CONNECTION_NAME` | Cloud SQL instance | `project:region:instance` |
| `SECRET_KEY` | JWT secret key (from Secret Manager) | *secret* |
| `OPENAI_API_KEY` | OpenAI API key (from Secret Manager) | *secret* |
| `STORAGE_BACKEND` | Storage backend type | `gcs` |
| `GCS_BUCKET_NAME` | GCS bucket name | `synapse_storage` |
| `GCS_PROJECT_ID` | GCP project ID | `synapse-473918` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_V1_STR` | `/api/v1` | API version prefix |
| `MAX_CONTENT_SIZE_MB` | `50` | Max upload size |
| `CHUNK_SIZE` | `500` | Text chunk size for embeddings |
| `CHUNK_OVERLAP` | `50` | Chunk overlap size |
| `SIMILARITY_THRESHOLD` | `0.7` | Vector search threshold |
| `EMBEDDING_MODEL` | `text-embedding-ada-002` | OpenAI embedding model |
| `CHAT_MODEL` | `gpt-4o-mini` | OpenAI chat model |
| `MAX_CHAT_HISTORY` | `10` | Max chat history messages |
| `CHAT_TIMEOUT_SECONDS` | `60` | Chat request timeout |
| `RATE_LIMIT_PER_MINUTE` | `60` | API rate limit |
| `LOG_LEVEL` | `INFO` | Logging level |
| `ENABLE_CACHING` | `true` | Enable response caching |
| `CACHE_TTL_SECONDS` | `3600` | Cache TTL |

---

## Troubleshooting

### Issue: "Permission denied" when accessing Cloud SQL
**Solution:** Verify service account has Cloud SQL Client role:
```bash
gcloud projects get-iam-policy synapse-473918 \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/cloudsql.client"
```

### Issue: "Failed to mount secret"
**Solution:** Verify secret exists and service account has access:
```bash
# List secrets
gcloud secrets list

# Check IAM policy
gcloud secrets get-iam-policy dev-secret-key
```

### Issue: "Container failed to start"
**Solution:** Check logs for startup errors:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=synapse-backend-dev AND severity>=ERROR" \
  --limit 10
```

### Issue: Database connection fails
**Solution:**
1. Verify Cloud SQL instance is running
2. Check `CLOUD_SQL_CONNECTION_NAME` is correct
3. Verify database credentials in `DATABASE_URL`
4. Check Cloud SQL connection is added to the service

---

## Cost Optimization Tips

### Development Environment
- **Min instances: 0** - Scales to zero when not in use (saves ~$20/month)
- **Smaller resources** - 1 CPU, 1GB memory is sufficient
- **Consider pausing** - Stop Cloud SQL instance when not developing

### Production Environment
- **Min instances: 1** - Keeps service warm, faster response times
- **Right-size resources** - Monitor and adjust based on actual usage
- **Use Cloud Monitoring** - Set up alerts for high CPU/memory usage

**Check your costs:**
```bash
# View Cloud Run costs
gcloud billing accounts list

# Or visit: https://console.cloud.google.com/billing
```

---

## Next Steps

1. ✅ Deploy backend to Cloud Run
2. ⬜ Test all API endpoints
3. ⬜ Deploy frontend with backend URL
4. ⬜ Set up monitoring and alerts
5. ⬜ Configure custom domain (optional)
6. ⬜ Set up CI/CD for automated deployments

---

## Quick Reference Commands

```bash
# Get service URL
gcloud run services describe synapse-backend-dev --region asia-south1 --format="value(status.url)"

# View service details
gcloud run services describe synapse-backend-dev --region asia-south1

# Update service
gcloud run services update synapse-backend-dev --region asia-south1

# Delete service
gcloud run services delete synapse-backend-dev --region asia-south1

# List all Cloud Run services
gcloud run services list --region asia-south1
```
