# Cloud Build Setup for Backend Deployment

This guide explains how to deploy the Synapse backend to Cloud Run using Cloud Build.

## Prerequisites

Before deploying, you need to set up:

1. **Cloud SQL Database** (PostgreSQL)
2. **Secret Manager Secrets**
3. **Service Account with proper permissions**
4. **GCS Bucket for file storage**

## Step-by-Step Setup

### 1. Create Cloud SQL Instance (if not exists)

```bash
# Create Cloud SQL instance in Mumbai region
gcloud sql instances create synapse \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-south1 \
  --root-password=YOUR_ROOT_PASSWORD

# Create development database
gcloud sql databases create dev --instance=synapse

# Create production database
gcloud sql databases create prod --instance=synapse

# Create dev user
gcloud sql users create dev_user \
  --instance=synapse \
  --password=YOUR_DEV_PASSWORD

# Create prod user
gcloud sql users create prod_user \
  --instance=synapse \
  --password=YOUR_PROD_PASSWORD
```

### 2. Create Secret Manager Secrets

```bash
# Create secrets for backend
echo -n "your-secret-key-here" | gcloud secrets create backend-secret-key --data-file=-
echo -n "your-openai-api-key" | gcloud secrets create openai-api-key --data-file=-

# Create database URL secrets for dev
echo -n "postgresql+asyncpg://dev_user:YOUR_DEV_PASSWORD@/dev?host=/cloudsql/synapse-473918:asia-south1:synapse" | \
  gcloud secrets create database-url-dev --data-file=-

# Create database URL secrets for prod
echo -n "postgresql+asyncpg://prod_user:YOUR_PROD_PASSWORD@/prod?host=/cloudsql/synapse-473918:asia-south1:synapse" | \
  gcloud secrets create database-url-prod --data-file=-
```

### 3. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create synapse-backend \
  --display-name="Synapse Backend Service Account"

# Grant necessary permissions
# Cloud SQL Client
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Secret Manager Secret Accessor
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Storage Admin (for GCS bucket)
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

### 4. Create GCS Buckets

```bash
# Create dev storage bucket
gcloud storage buckets create gs://synapse-storage-dev \
  --location=asia-south1 \
  --uniform-bucket-level-access

# Create prod storage bucket
gcloud storage buckets create gs://synapse-storage-prod \
  --location=asia-south1 \
  --uniform-bucket-level-access
```

### 5. Initialize Database Schema

Run the SQL initialization script on your Cloud SQL instance:

```bash
# Copy the init script to Cloud SQL
gcloud sql import sql synapse \
  --database=dev \
  gs://YOUR_BUCKET/init_cloud_sql.sql

# Or connect directly and run it
gcloud sql connect synapse --user=dev_user --database=dev
```

Then paste the contents of `backend/init_cloud_sql.sql`.

## Deployment

### Manual Deployment

#### Deploy to Development
```bash
gcloud builds submit \
  --config=backend/cloudbuild.yaml \
  --substitutions=_ENV=dev,_ENVIRONMENT=development,_REGION=asia-south1
```

#### Deploy to Production
```bash
gcloud builds submit \
  --config=backend/cloudbuild.yaml \
  --substitutions=_ENV=prod,_ENVIRONMENT=production,_REGION=asia-south1,_MIN_INSTANCES=1,_RATE_LIMIT=100,_LOG_LEVEL=WARNING,_GCS_BUCKET=synapse-storage-prod
```

### Automated Deployment with Cloud Build Triggers

#### Create Development Trigger
```bash
gcloud builds triggers create github \
  --name="synapse-backend-dev-deploy" \
  --repo-name="synapse" \
  --repo-owner="rahulptl" \
  --branch-pattern="^main$" \
  --build-config="backend/cloudbuild.yaml" \
  --included-files="backend/**" \
  --substitutions="_ENV=dev,_ENVIRONMENT=development,_REGION=asia-south1"
```

#### Create Production Trigger
```bash
gcloud builds triggers create github \
  --name="synapse-backend-prod-deploy" \
  --repo-name="synapse" \
  --repo-owner="rahulptl" \
  --tag-pattern="^v.*" \
  --build-config="backend/cloudbuild.yaml" \
  --substitutions="_ENV=prod,_ENVIRONMENT=production,_REGION=asia-south1,_MIN_INSTANCES=1,_RATE_LIMIT=100,_LOG_LEVEL=WARNING,_GCS_BUCKET=synapse-storage-prod"
```

## Configuration

### Environment Variables

The Cloud Build configuration sets these environment variables on the Cloud Run service:

- `ENVIRONMENT`: development or production
- `API_V1_STR`: /api/v1
- `STORAGE_BACKEND`: gcs
- `GCS_BUCKET_NAME`: Bucket name based on environment
- All other app settings (chunk size, models, timeouts, etc.)

### Secrets (via Secret Manager)

These are injected as environment variables from Secret Manager:

- `SECRET_KEY`: JWT signing key
- `OPENAI_API_KEY`: OpenAI API key
- `DATABASE_URL`: PostgreSQL connection string

### Cloud SQL Connection

The backend connects to Cloud SQL via Unix socket using the `--add-cloudsql-instances` flag.

## Customization

### Change Resource Limits

Edit the substitutions in `backend/cloudbuild.yaml`:

```yaml
_MEMORY: '2Gi'      # Increase memory
_CPU: '4'           # Increase CPU cores
_MAX_INSTANCES: '20' # Increase max scaling
```

### Enable CORS for Frontend

Make sure your backend has CORS configured to allow your frontend domain:

```python
# In app/main.py
origins = [
    "https://synapse-frontend-dev-*.run.app",
    "https://synapse-frontend-prod-*.run.app",
]
```

## Post-Deployment

### Get Backend URL

After deployment, get the service URL:

```bash
gcloud run services describe synapse-backend-dev \
  --region=asia-south1 \
  --format='value(status.url)'
```

### Test Backend Health

```bash
curl https://YOUR-BACKEND-URL/health
```

### View Logs

```bash
gcloud run logs read synapse-backend-dev --region=asia-south1 --limit=50
```

## Troubleshooting

### Connection to Cloud SQL Fails

1. Check Cloud SQL instance is running
2. Verify service account has `cloudsql.client` role
3. Check `CLOUD_SQL_CONNECTION_NAME` matches your instance
4. Ensure database URL uses Unix socket path: `?host=/cloudsql/PROJECT:REGION:INSTANCE`

### Secrets Not Found

1. Verify secrets exist in Secret Manager
2. Check service account has `secretmanager.secretAccessor` role
3. Ensure secret names match exactly (case-sensitive)

### Database Migration Issues

Run migrations manually:

```bash
# Connect to Cloud SQL
gcloud sql connect synapse --user=dev_user --database=dev

# Run your SQL scripts
\i init_cloud_sql.sql
```

## Cost Optimization

- **Dev**: Min instances = 0 (scales to zero)
- **Prod**: Min instances = 1 (avoid cold starts)
- **CPU**: 2 cores for dev, 4 for prod
- **Memory**: 1Gi for dev, 2Gi for prod

## Security Best Practices

1. ✅ All secrets in Secret Manager (not environment variables)
2. ✅ Database password rotation via Secret Manager versions
3. ✅ Service account with minimal permissions
4. ✅ Cloud SQL via Unix socket (not public IP)
5. ✅ CORS configured for specific frontend origins only
