# GCP Migration Plan - Complete Implementation Guide

## Executive Summary

This document provides a comprehensive migration plan to move your Synapse application from the current setup to Google Cloud Platform (GCP) with separate local, dev, and prod environments.

## Current Architecture Analysis

### Backend
- **Framework**: FastAPI with Python
- **Database**: PostgreSQL with SQLAlchemy ORM + pgvector
- **Storage**: Multi-backend (Supabase, S3, GCS, Local) - currently configured for Supabase
- **Key Dependencies**:
  - Google Cloud Storage SDK already installed
  - AsyncPG for PostgreSQL
  - Boto3 for S3 compatibility
  - OpenAI for embeddings

### Frontend
- **Framework**: React + Vite + TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Auth**: Supabase Auth
- **API Communication**: Centralized API client
- **Environment Variables**: Vite env vars (VITE_BACKEND_API_URL, VITE_SUPABASE_URL)

## GCP Services Recommendations

### 1. **Backend Hosting: Cloud Run**
**Recommended for Backend**
- Serverless container platform
- Auto-scaling (0 to N instances)
- Pay-per-use pricing
- Built-in HTTPS & load balancing
- Supports FastAPI/uvicorn perfectly
- Regional or multi-region deployment

**Alternative: GKE (Google Kubernetes Engine)** - If you need more control

### 2. **Frontend Hosting: Cloud Run or Firebase Hosting**
**Option A: Cloud Run (Recommended)**
- Serves static files via nginx container
- Consistent with backend
- Custom domains & SSL
- CDN integration via Cloud CDN

**Option B: Firebase Hosting**
- Global CDN out of the box
- Automatic SSL
- Simple deployment
- Great for static sites

### 3. **Database: Cloud SQL for PostgreSQL**
**Already Set Up** ✓
- Managed PostgreSQL with pgvector support
- Automatic backups & point-in-time recovery
- Private IP for secure connections
- Instance types: db-f1-micro (dev) to db-n1-highmem-16 (prod)

**Configuration Needed:**
- 3 separate databases on same or different instances:
  - `synapse_local` (local testing via Cloud SQL proxy)
  - `synapse_dev` (development environment)
  - `synapse_prod` (production environment)
- 3 separate users with appropriate permissions

### 4. **Storage: Google Cloud Storage**
**Already Set Up** ✓
- Object storage for files
- Global CDN
- Lifecycle policies
- Versioning support

**Configuration Needed:**
- 3 separate buckets or folders:
  - `synapse-storage-local` or `synapse-storage/local/`
  - `synapse-storage-dev` or `synapse-storage/dev/`
  - `synapse-storage-prod` or `synapse-storage/prod/`

### 5. **Secret Management: Secret Manager**
- Store API keys, database passwords, JWT secrets
- Automatic rotation
- IAM-based access control
- Integration with Cloud Run

### 6. **Additional Services**
- **Cloud CDN**: Cache static assets and API responses
- **Cloud Load Balancing**: Multi-region traffic distribution
- **Cloud Monitoring & Logging**: Observability stack
- **Cloud Build**: CI/CD pipeline
- **Artifact Registry**: Docker image storage
- **Cloud Scheduler**: Cron jobs (if needed)
- **Memorystore (Redis)**: For caching (optional, you have Redis config)

## Environment Configuration Strategy

### Local Environment
```bash
# Uses Cloud SQL Proxy to connect to dev database
# Or local PostgreSQL for offline development
# Storage: Local filesystem or GCS bucket with service account
```

### Dev Environment
```bash
# Cloud Run service in us-central1
# Cloud SQL (PostgreSQL) - small instance
# GCS bucket: synapse-storage-dev
# Domain: dev.synapse.yourdomain.com
```

### Production Environment
```bash
# Cloud Run service in multi-region or us-central1
# Cloud SQL (PostgreSQL) - production instance with HA
# GCS bucket: synapse-storage-prod
# Domain: synapse.yourdomain.com
```

## Detailed Migration Steps

### Phase 1: GCP Project Setup

#### 1.1 Create GCP Projects (or use one with env separation)
```bash
# Option A: Single project with env separation
gcloud projects create synapse-main --name="Synapse"

# Option B: Separate projects (recommended for strict isolation)
gcloud projects create synapse-dev --name="Synapse Dev"
gcloud projects create synapse-prod --name="Synapse Production"
```

#### 1.2 Enable Required APIs
```bash
gcloud services enable \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  compute.googleapis.com
```

#### 1.3 Set up Billing
```bash
# Link billing account to projects
gcloud billing projects link synapse-main --billing-account=YOUR_BILLING_ACCOUNT_ID
```

### Phase 2: Database Configuration

#### 2.1 Cloud SQL Instance Setup

**For Development:**
```bash
gcloud sql instances create synapse-dev \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --network=default \
  --enable-bin-log \
  --backup-start-time=03:00 \
  --database-flags=cloudsql.enable_pgvector=on
```

**For Production:**
```bash
gcloud sql instances create synapse-prod \
  --database-version=POSTGRES_15 \
  --tier=db-n1-standard-2 \
  --region=us-central1 \
  --availability-type=REGIONAL \
  --network=default \
  --enable-bin-log \
  --backup-start-time=03:00 \
  --database-flags=cloudsql.enable_pgvector=on
```

#### 2.2 Create Databases and Users

```bash
# Create databases
gcloud sql databases create synapse_local --instance=synapse-dev
gcloud sql databases create synapse_dev --instance=synapse-dev
gcloud sql databases create synapse_prod --instance=synapse-prod

# Create users (run these interactively to set passwords)
gcloud sql users create synapse_local_user --instance=synapse-dev --password=SECURE_PASSWORD_1
gcloud sql users create synapse_dev_user --instance=synapse-dev --password=SECURE_PASSWORD_2
gcloud sql users create synapse_prod_user --instance=synapse-prod --password=SECURE_PASSWORD_3
```

#### 2.3 Install pgvector Extension

```bash
# Connect to each database and install pgvector
gcloud sql connect synapse-dev --user=postgres --database=synapse_local
# In psql:
CREATE EXTENSION IF NOT EXISTS vector;

# Repeat for synapse_dev and synapse_prod databases
```

#### 2.4 Get Connection Strings

```bash
# Get connection names
gcloud sql instances describe synapse-dev --format="value(connectionName)"
# Output: PROJECT_ID:REGION:synapse-dev

gcloud sql instances describe synapse-prod --format="value(connectionName)"
# Output: PROJECT_ID:REGION:synapse-prod
```

**Connection strings format:**
```
# Local (via Cloud SQL Proxy)
postgresql+asyncpg://synapse_local_user:PASSWORD@localhost:5432/synapse_local

# Dev
postgresql+asyncpg://synapse_dev_user:PASSWORD@/synapse_dev?host=/cloudsql/PROJECT_ID:REGION:synapse-dev

# Prod
postgresql+asyncpg://synapse_prod_user:PASSWORD@/synapse_prod?host=/cloudsql/PROJECT_ID:REGION:synapse-prod
```

### Phase 3: Storage Configuration

#### 3.1 Create GCS Buckets

```bash
# Development
gsutil mb -p synapse-main -c STANDARD -l us-central1 gs://synapse-storage-dev
gsutil iam ch allUsers:objectViewer gs://synapse-storage-dev  # If public read needed

# Production
gsutil mb -p synapse-main -c STANDARD -l us-central1 gs://synapse-storage-prod
gsutil iam ch allUsers:objectViewer gs://synapse-storage-prod  # If public read needed

# Set CORS for browser uploads (if needed)
cat > cors.json << EOF
[
  {
    "origin": ["https://dev.synapse.yourdomain.com", "https://synapse.yourdomain.com"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set cors.json gs://synapse-storage-dev
gsutil cors set cors.json gs://synapse-storage-prod
```

#### 3.2 Create Service Account for Storage

```bash
# Create service account
gcloud iam service-accounts create synapse-storage \
  --display-name="Synapse Storage Service Account"

# Grant storage permissions
gcloud projects add-iam-policy-binding synapse-main \
  --member="serviceAccount:synapse-storage@synapse-main.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Create and download key (for local development)
gcloud iam service-accounts keys create synapse-storage-key.json \
  --iam-account=synapse-storage@synapse-main.iam.gserviceaccount.com
```

### Phase 4: Secret Management

#### 4.1 Create Secrets

```bash
# Create secrets in Secret Manager
echo -n "YOUR_OPENAI_API_KEY" | gcloud secrets create openai-api-key --data-file=-
echo -n "YOUR_SECRET_KEY" | gcloud secrets create jwt-secret-key --data-file=-
echo -n "DB_PASSWORD_DEV" | gcloud secrets create db-password-dev --data-file=-
echo -n "DB_PASSWORD_PROD" | gcloud secrets create db-password-prod --data-file=-

# Grant Cloud Run service account access to secrets
PROJECT_NUMBER=$(gcloud projects describe synapse-main --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Phase 5: Backend Code Modifications

#### 5.1 Update `backend/app/config.py`

Add GCS configuration and environment-specific settings:

```python
class Settings(BaseSettings):
    """Application settings."""

    # Environment
    ENVIRONMENT: str = "development"  # local, development, production
    API_V1_STR: str = "/api/v1"

    # Database - now supports Cloud SQL connection
    DATABASE_URL: PostgresDsn
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10

    # Cloud SQL specific (when running on Cloud Run)
    CLOUD_SQL_CONNECTION_NAME: Optional[str] = None  # PROJECT:REGION:INSTANCE

    # Security
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # External APIs
    OPENAI_API_KEY: str

    # Storage - Update to use GCS
    STORAGE_BACKEND: str = "gcs"  # gcs, s3, local

    # GCS Configuration
    GCS_BUCKET_NAME: Optional[str] = None
    GCS_PROJECT_ID: Optional[str] = None
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None  # Path to service account key (local only)

    # Legacy Supabase (can remove if not needed)
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None

    # Processing
    MAX_CONTENT_SIZE_MB: int = 50
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50
    SIMILARITY_THRESHOLD: float = 0.7
    EMBEDDING_MODEL: str = "text-embedding-ada-002"

    # Chat
    CHAT_MODEL: str = "gpt-4o-mini"
    MAX_CHAT_HISTORY: int = 10
    CHAT_TIMEOUT_SECONDS: int = 60

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # Redis
    REDIS_URL: Optional[str] = None
    ENABLE_CACHING: bool = True
    CACHE_TTL_SECONDS: int = 3600

    @field_validator("STORAGE_BACKEND")
    @classmethod
    def validate_storage_backend(cls, v: str) -> str:
        if v not in ["gcs", "s3", "local"]:
            raise ValueError("STORAGE_BACKEND must be one of: gcs, s3, local")
        return v
```

#### 5.2 Update `backend/app/core/storage.py`

Add a proper GCS backend:

```python
from google.cloud import storage
from google.oauth2 import service_account

class GCSStorageBackend(StorageBackend):
    """Google Cloud Storage backend."""

    def __init__(self):
        if not settings.GCS_BUCKET_NAME:
            raise ValueError("GCS_BUCKET_NAME must be configured")

        # Initialize GCS client
        if settings.GOOGLE_APPLICATION_CREDENTIALS:
            # Local development with service account key
            credentials = service_account.Credentials.from_service_account_file(
                settings.GOOGLE_APPLICATION_CREDENTIALS
            )
            self.client = storage.Client(
                credentials=credentials,
                project=settings.GCS_PROJECT_ID
            )
        else:
            # Cloud Run uses default service account
            self.client = storage.Client(project=settings.GCS_PROJECT_ID)

        self.bucket = self.client.bucket(settings.GCS_BUCKET_NAME)

    async def upload_content(self, path: str, content: bytes, content_type: str) -> str:
        """Upload content to GCS."""
        try:
            blob = self.bucket.blob(path)
            blob.upload_from_string(content, content_type=content_type)

            # Return public URL
            return blob.public_url
        except Exception as e:
            logger.error(f"GCS upload failed: {e}")
            raise

    async def download_content(self, path: str) -> bytes:
        """Download content from GCS."""
        try:
            blob = self.bucket.blob(path)
            return blob.download_as_bytes()
        except Exception as e:
            logger.error(f"GCS download failed: {e}")
            raise

    async def delete_content(self, path: str) -> bool:
        """Delete content from GCS."""
        try:
            blob = self.bucket.blob(path)
            blob.delete()
            return True
        except Exception as e:
            logger.error(f"GCS delete failed: {e}")
            return False
```

Update the `_create_backend` method:

```python
def _create_backend(self) -> StorageBackend:
    """Create the appropriate storage backend based on configuration."""
    backend_type = settings.STORAGE_BACKEND.lower()

    if backend_type == "gcs":
        return GCSStorageBackend()
    elif backend_type == "s3":
        return S3StorageBackend()
    elif backend_type == "local":
        return LocalStorageBackend()
    else:
        logger.warning(f"Unknown storage backend: {backend_type}, falling back to local")
        return LocalStorageBackend()
```

#### 5.3 Update `backend/app/core/database.py`

Add Cloud SQL connection support:

```python
from app.config import settings

# Determine connection string based on environment
def get_database_url() -> str:
    if settings.CLOUD_SQL_CONNECTION_NAME:
        # Running on Cloud Run - use Unix socket
        return str(settings.DATABASE_URL).replace(
            "localhost:5432",
            f"/cloudsql/{settings.CLOUD_SQL_CONNECTION_NAME}"
        )
    return str(settings.DATABASE_URL)

# Create async engine
engine = create_async_engine(
    get_database_url(),
    poolclass=NullPool,
    echo=False,
    future=True,
    # ... rest of config
)
```

#### 5.4 Create Environment Files

**backend/.env.local**
```env
ENVIRONMENT=local
DATABASE_URL=postgresql+asyncpg://synapse_local_user:PASSWORD@localhost:5432/synapse_local
SECRET_KEY=local-secret-key-change-in-production
OPENAI_API_KEY=sk-...
STORAGE_BACKEND=local
LOG_LEVEL=DEBUG
```

**backend/.env.dev**
```env
ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://synapse_dev_user:PASSWORD@/synapse_dev
CLOUD_SQL_CONNECTION_NAME=PROJECT_ID:us-central1:synapse-dev
SECRET_KEY=${jwt-secret-key}  # Reference to Secret Manager
OPENAI_API_KEY=${openai-api-key}
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=synapse-storage-dev
GCS_PROJECT_ID=synapse-main
LOG_LEVEL=INFO
```

**backend/.env.prod**
```env
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://synapse_prod_user:PASSWORD@/synapse_prod
CLOUD_SQL_CONNECTION_NAME=PROJECT_ID:us-central1:synapse-prod
SECRET_KEY=${jwt-secret-key}
OPENAI_API_KEY=${openai-api-key}
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=synapse-storage-prod
GCS_PROJECT_ID=synapse-main
LOG_LEVEL=WARNING
```

#### 5.5 Create Dockerfile for Backend

**backend/Dockerfile**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**backend/.dockerignore**
```
env/
__pycache__/
*.pyc
.env
.env.*
*.db
.pytest_cache/
.coverage
htmlcov/
```

### Phase 6: Frontend Code Modifications

#### 6.1 Update Environment Files

**frontend/.env.local**
```env
VITE_BACKEND_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

**frontend/.env.development**
```env
VITE_BACKEND_API_URL=https://synapse-backend-dev-xxx.run.app
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

**frontend/.env.production**
```env
VITE_BACKEND_API_URL=https://synapse-backend-prod-xxx.run.app
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

#### 6.2 Update vite.config.ts

Add environment-specific builds:

```typescript
export default defineConfig(({ mode }) => ({
  // ... existing config
  define: {
    'import.meta.env.VITE_BACKEND_API_URL': JSON.stringify(
      process.env.VITE_BACKEND_API_URL || 'http://localhost:8000'
    ),
  },
}));
```

#### 6.3 Create Dockerfile for Frontend

**frontend/Dockerfile**
```dockerfile
# Build stage
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build argument for environment
ARG VITE_BACKEND_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**frontend/nginx.conf**
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Phase 7: Deployment to Cloud Run

#### 7.1 Build and Push Docker Images

**Backend:**
```bash
# Set project
gcloud config set project synapse-main

# Create Artifact Registry repository
gcloud artifacts repositories create synapse \
  --repository-format=docker \
  --location=us-central1

# Build and push backend
cd backend
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/synapse-main/synapse/backend:dev

gcloud builds submit \
  --tag us-central1-docker.pkg.dev/synapse-main/synapse/backend:prod
```

**Frontend:**
```bash
cd frontend

# Dev build
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/synapse-main/synapse/frontend:dev \
  --substitutions=\
_VITE_BACKEND_API_URL="https://synapse-backend-dev-xxx.run.app",\
_VITE_SUPABASE_URL="https://your-project.supabase.co",\
_VITE_SUPABASE_PUBLISHABLE_KEY="your-key"

# Prod build
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/synapse-main/synapse/frontend:prod \
  --substitutions=\
_VITE_BACKEND_API_URL="https://synapse-backend-prod-xxx.run.app",\
_VITE_SUPABASE_URL="https://your-project.supabase.co",\
_VITE_SUPABASE_PUBLISHABLE_KEY="your-key"
```

#### 7.2 Deploy Backend to Cloud Run

**Development:**
```bash
gcloud run deploy synapse-backend-dev \
  --image us-central1-docker.pkg.dev/synapse-main/synapse/backend:dev \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "ENVIRONMENT=development,STORAGE_BACKEND=gcs,GCS_BUCKET_NAME=synapse-storage-dev,GCS_PROJECT_ID=synapse-main" \
  --set-secrets "SECRET_KEY=jwt-secret-key:latest,OPENAI_API_KEY=openai-api-key:latest,DATABASE_URL=db-url-dev:latest" \
  --add-cloudsql-instances PROJECT_ID:us-central1:synapse-dev \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300
```

**Production:**
```bash
gcloud run deploy synapse-backend-prod \
  --image us-central1-docker.pkg.dev/synapse-main/synapse/backend:prod \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "ENVIRONMENT=production,STORAGE_BACKEND=gcs,GCS_BUCKET_NAME=synapse-storage-prod,GCS_PROJECT_ID=synapse-main" \
  --set-secrets "SECRET_KEY=jwt-secret-key:latest,OPENAI_API_KEY=openai-api-key:latest,DATABASE_URL=db-url-prod:latest" \
  --add-cloudsql-instances PROJECT_ID:us-central1:synapse-prod \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 50 \
  --timeout 300
```

#### 7.3 Deploy Frontend to Cloud Run

**Development:**
```bash
gcloud run deploy synapse-frontend-dev \
  --image us-central1-docker.pkg.dev/synapse-main/synapse/frontend:dev \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5
```

**Production:**
```bash
gcloud run deploy synapse-frontend-prod \
  --image us-central1-docker.pkg.dev/synapse-main/synapse/frontend:prod \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 20
```

#### 7.4 Get Service URLs

```bash
# Get backend URLs
gcloud run services describe synapse-backend-dev --region us-central1 --format "value(status.url)"
gcloud run services describe synapse-backend-prod --region us-central1 --format "value(status.url)"

# Get frontend URLs
gcloud run services describe synapse-frontend-dev --region us-central1 --format "value(status.url)"
gcloud run services describe synapse-frontend-prod --region us-central1 --format "value(status.url)"
```

### Phase 8: Custom Domain Setup (Optional)

#### 8.1 Map Custom Domains

```bash
# Backend dev
gcloud run domain-mappings create \
  --service synapse-backend-dev \
  --domain api-dev.synapse.yourdomain.com \
  --region us-central1

# Backend prod
gcloud run domain-mappings create \
  --service synapse-backend-prod \
  --domain api.synapse.yourdomain.com \
  --region us-central1

# Frontend dev
gcloud run domain-mappings create \
  --service synapse-frontend-dev \
  --domain dev.synapse.yourdomain.com \
  --region us-central1

# Frontend prod
gcloud run domain-mappings create \
  --service synapse-frontend-prod \
  --domain synapse.yourdomain.com \
  --region us-central1
```

#### 8.2 Update DNS Records

Add the DNS records shown by the domain mapping commands to your DNS provider.

### Phase 9: CI/CD Setup with Cloud Build

#### 9.1 Create cloudbuild.yaml

**cloudbuild-backend-dev.yaml**
```yaml
steps:
  # Build backend image
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/synapse/backend:${SHORT_SHA}'
      - '-t'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/synapse/backend:dev'
      - './backend'

  # Push images
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - '--all-tags'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/synapse/backend'

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'synapse-backend-dev'
      - '--image'
      - 'us-central1-docker.pkg.dev/${PROJECT_ID}/synapse/backend:${SHORT_SHA}'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'

images:
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/synapse/backend:${SHORT_SHA}'
  - 'us-central1-docker.pkg.dev/${PROJECT_ID}/synapse/backend:dev'
```

#### 9.2 Set Up Triggers

```bash
# Backend dev trigger
gcloud builds triggers create github \
  --repo-name=synapse \
  --repo-owner=YOUR_GITHUB_USERNAME \
  --branch-pattern="^develop$" \
  --build-config=cloudbuild-backend-dev.yaml

# Backend prod trigger
gcloud builds triggers create github \
  --repo-name=synapse \
  --repo-owner=YOUR_GITHUB_USERNAME \
  --branch-pattern="^main$" \
  --build-config=cloudbuild-backend-prod.yaml
```

### Phase 10: Local Development Setup

#### 10.1 Install Cloud SQL Proxy

```bash
# Download Cloud SQL Proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.arm64
chmod +x cloud-sql-proxy

# Start proxy for local development
./cloud-sql-proxy PROJECT_ID:us-central1:synapse-dev
```

#### 10.2 Update Local Environment

**backend/.env.local**
```env
ENVIRONMENT=local
DATABASE_URL=postgresql+asyncpg://synapse_local_user:PASSWORD@localhost:5432/synapse_local
STORAGE_BACKEND=local  # or gcs with service account key
GOOGLE_APPLICATION_CREDENTIALS=/path/to/synapse-storage-key.json
```

#### 10.3 Local Development Commands

```bash
# Terminal 1: Start Cloud SQL Proxy
./cloud-sql-proxy PROJECT_ID:us-central1:synapse-dev

# Terminal 2: Start backend
cd backend
source env/bin/activate
uvicorn app.main:app --reload --env-file .env.local

# Terminal 3: Start frontend
cd frontend
npm run dev
```

### Phase 11: Migration Checklist

- [ ] **GCP Setup**
  - [ ] Create GCP project(s)
  - [ ] Enable required APIs
  - [ ] Set up billing

- [ ] **Database**
  - [ ] Create Cloud SQL instances (dev, prod)
  - [ ] Create databases (local, dev, prod)
  - [ ] Create users with passwords
  - [ ] Install pgvector extension
  - [ ] Test connections
  - [ ] Migrate existing data (if any)

- [ ] **Storage**
  - [ ] Create GCS buckets
  - [ ] Set up CORS policies
  - [ ] Create service account
  - [ ] Test file uploads

- [ ] **Secrets**
  - [ ] Store all secrets in Secret Manager
  - [ ] Configure IAM permissions
  - [ ] Test secret access

- [ ] **Backend Code**
  - [ ] Update config.py
  - [ ] Update storage.py with GCS backend
  - [ ] Update database.py for Cloud SQL
  - [ ] Create environment files
  - [ ] Create Dockerfile
  - [ ] Test locally with Cloud SQL Proxy

- [ ] **Frontend Code**
  - [ ] Update environment files
  - [ ] Create Dockerfile
  - [ ] Create nginx config
  - [ ] Test build process

- [ ] **Deployment**
  - [ ] Build and push backend images
  - [ ] Build and push frontend images
  - [ ] Deploy backend to Cloud Run (dev)
  - [ ] Deploy frontend to Cloud Run (dev)
  - [ ] Test dev environment
  - [ ] Deploy backend to Cloud Run (prod)
  - [ ] Deploy frontend to Cloud Run (prod)
  - [ ] Test prod environment

- [ ] **Domain & DNS**
  - [ ] Set up custom domains (optional)
  - [ ] Configure SSL certificates
  - [ ] Update DNS records

- [ ] **CI/CD**
  - [ ] Create Cloud Build configs
  - [ ] Set up GitHub triggers
  - [ ] Test automated deployments

- [ ] **Monitoring**
  - [ ] Set up Cloud Logging
  - [ ] Configure Cloud Monitoring
  - [ ] Create dashboards
  - [ ] Set up alerts

- [ ] **Security**
  - [ ] Review IAM permissions
  - [ ] Enable VPC Service Controls (optional)
  - [ ] Configure Cloud Armor (optional)
  - [ ] Review authentication flow

## Cost Estimation

### Development Environment (Monthly)
- Cloud Run Backend: ~$5-20 (minimal traffic)
- Cloud Run Frontend: ~$5-15
- Cloud SQL (db-f1-micro): ~$10-15
- Cloud Storage: ~$1-5
- **Total: ~$20-55/month**

### Production Environment (Monthly, moderate traffic)
- Cloud Run Backend: ~$50-200 (auto-scaling)
- Cloud Run Frontend: ~$30-100
- Cloud SQL (db-n1-standard-2): ~$100-150
- Cloud Storage: ~$10-30
- **Total: ~$190-480/month**

## Next Steps After Migration

1. **Database Migration**: Use Alembic to run migrations on Cloud SQL
2. **Data Transfer**: If you have existing data, export from current setup and import to Cloud SQL
3. **Testing**: Thoroughly test all functionality in dev environment
4. **Monitoring**: Set up comprehensive logging and monitoring
5. **Backup Strategy**: Configure automated backups and disaster recovery
6. **Performance Tuning**: Optimize Cloud Run instances, database queries, and caching
7. **Security Hardening**: Review and tighten security policies

## Support Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Cloud Storage Documentation](https://cloud.google.com/storage/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)

---

**Migration Timeline Estimate**: 2-5 days for initial setup and deployment, 1-2 weeks for full production readiness with testing and optimization.
