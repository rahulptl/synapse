# Google Cloud Deployment Guide - Synapse

Complete documentation for deploying the Synapse application (Frontend + Backend) to Google Cloud Platform using Cloud Run and Cloud SQL.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Project Configuration](#project-configuration)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [Local Development](#local-development)
7. [Version Control & Tagging](#version-control--tagging)
8. [Environment Management](#environment-management)
9. [Troubleshooting](#troubleshooting)
10. [Files Reference](#files-reference)

---

## Architecture Overview

### Cloud Services Used
- **Cloud Run**: Serverless container hosting for both frontend and backend
- **Cloud SQL**: PostgreSQL database (single instance with multiple databases)
- **Cloud Storage (GCS)**: Document storage with environment-specific folders
- **Secret Manager**: Secure storage for sensitive configuration
- **Container Registry (GCR)**: Docker image storage
- **Cloud Build**: CI/CD pipeline for automated deployments

### Environment Structure
```
Project: synapse-473918
Region: asia-south1 (Mumbai)

Databases (single Cloud SQL instance):
├── local   (for local development)
├── dev     (development environment)
└── prod    (production environment)

Storage (single GCS bucket):
└── synapse_storage/
    ├── local/  (local dev files)
    ├── dev/    (dev environment files)
    └── prod/   (production files)

Cloud Run Services:
├── synapse-backend-dev
├── synapse-backend-prod
├── synapse-frontend-dev
└── synapse-frontend-prod
```

---

## Prerequisites

### 1. Required Tools
```bash
# Install Google Cloud SDK
brew install google-cloud-sdk  # macOS
# or download from https://cloud.google.com/sdk/docs/install

# Install Docker
brew install docker  # macOS

# Authenticate with GCP
gcloud auth login
gcloud auth configure-docker
```

### 2. GCP Project Setup
```bash
# Set your project ID
export PROJECT_ID="synapse-473918"
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  storage-api.googleapis.com \
  containerregistry.googleapis.com
```

### 3. Cloud SQL Instance
The project uses a single Cloud SQL instance with multiple databases:
```bash
# Instance details
INSTANCE_NAME="synapse"
REGION="asia-south1"
CONNECTION_NAME="synapse-473918:asia-south1:synapse"

# Check if instance exists
gcloud sql instances describe $INSTANCE_NAME
```

---

## Project Configuration

### 1. Prerequisites Setup (Automated)

#### Check Prerequisites
```bash
# Run prerequisite checker
./scripts/check-prerequisites.sh
```

**What it checks:**
- Cloud SQL instance status
- Database existence (dev, prod)
- Secret Manager secrets
- Service account and IAM roles
- GCS bucket and folders
- Existing Cloud Run services

#### Setup Prerequisites (First Time)
```bash
# Automated setup script
./scripts/setup-backend-prerequisites.sh
```

**What it creates:**
1. **Databases**: `dev` and `prod` in Cloud SQL instance
2. **Database Users**: `dev_user` and `prod_user` with passwords
3. **Secrets** (in Secret Manager):
   - `backend-secret-key`: Backend SECRET_KEY
   - `openai-api-key`: OpenAI API key
   - `database-url-dev`: Dev database connection string
   - `database-url-prod`: Prod database connection string
4. **Service Account**: `synapse-backend@synapse-473918.iam.gserviceaccount.com`
5. **IAM Roles**:
   - `roles/cloudsql.client`: Cloud SQL access
   - `roles/secretmanager.secretAccessor`: Secret access
   - `roles/storage.objectAdmin`: GCS access
6. **GCS Bucket**: `synapse_storage` with folders (local/, dev/, prod/)

### 2. Manual Secret Management

#### Create a Secret
```bash
# Create secret from value
echo -n "your-secret-value" | gcloud secrets create SECRET_NAME --data-file=-

# Create secret from file
gcloud secrets create SECRET_NAME --data-file=/path/to/file
```

#### Update a Secret
```bash
# Add new version
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-

# List versions
gcloud secrets versions list SECRET_NAME
```

#### View Secret Value
```bash
# Access latest version
gcloud secrets versions access latest --secret=SECRET_NAME
```

---

## Backend Deployment

### Files Involved

#### 1. `backend/Dockerfile`
```dockerfile
FROM python:3.11-slim
WORKDIR /app
# Installs dependencies and copies application code
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### 2. `backend/cloudbuild.yaml`
Main Cloud Build configuration with these sections:
- **Step 1**: Pull previous image for layer caching
- **Step 2**: Build Docker image with tags
- **Step 3-5**: Push images to GCR with multiple tags
- **Step 6**: Deploy to Cloud Run

**Key Substitution Variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `_ENV` | `dev` | Environment (dev/prod) |
| `_ENVIRONMENT` | `development` | Environment name |
| `_REGION` | `asia-south1` | GCP region |
| `_MIN_INSTANCES` | `0` | Min Cloud Run instances |
| `_MAX_INSTANCES` | `10` | Max Cloud Run instances |
| `_MEMORY` | `1Gi` | Container memory |
| `_CPU` | `2` | CPU count |
| `_RATE_LIMIT` | `60` | API rate limit/min |
| `_LOG_LEVEL` | `INFO` | Logging level |
| `_GCS_BUCKET` | `synapse_storage` | GCS bucket name |
| `_CLOUD_SQL_CONNECTION` | `synapse-473918:asia-south1:synapse` | Cloud SQL connection |
| `_SERVICE_ACCOUNT` | `synapse-backend@synapse-473918.iam.gserviceaccount.com` | Service account email |

### Deployment Commands

#### Development Environment
```bash
# Deploy with default dev settings
gcloud builds submit --config=backend/cloudbuild.yaml

# Deploy with custom settings
gcloud builds submit \
  --config=backend/cloudbuild.yaml \
  --substitutions=_ENV=dev,_MIN_INSTANCES=1,_MAX_INSTANCES=5
```

#### Production Environment
```bash
# Deploy to production
gcloud builds submit \
  --config=backend/cloudbuild.yaml \
  --substitutions=\
_ENV=prod,\
_ENVIRONMENT=production,\
_MIN_INSTANCES=1,\
_MAX_INSTANCES=20,\
_MEMORY=2Gi,\
_CPU=4,\
_RATE_LIMIT=120,\
_LOG_LEVEL=WARNING
```

#### Get Backend URL
```bash
# Development
gcloud run services describe synapse-backend-dev \
  --region=asia-south1 \
  --format='value(status.url)'

# Production
gcloud run services describe synapse-backend-prod \
  --region=asia-south1 \
  --format='value(status.url)'
```

### Backend Environment Variables

**Set in Cloud Build** (backend/cloudbuild.yaml:66-67):
```yaml
--set-env-vars:
  ENVIRONMENT=${_ENVIRONMENT}
  API_V1_STR=/api/v1
  MAX_CONTENT_SIZE_MB=50
  CHUNK_SIZE=500
  CHUNK_OVERLAP=50
  SIMILARITY_THRESHOLD=0.7
  EMBEDDING_MODEL=text-embedding-ada-002
  CHAT_MODEL=gpt-4o-mini
  MAX_CHAT_HISTORY=10
  CHAT_TIMEOUT_SECONDS=60
  RATE_LIMIT_PER_MINUTE=${_RATE_LIMIT}
  LOG_LEVEL=${_LOG_LEVEL}
  ENABLE_CACHING=true
  CACHE_TTL_SECONDS=3600
  STORAGE_BACKEND=gcs
  GCS_BUCKET_NAME=${_GCS_BUCKET}
  GCS_FOLDER_PREFIX=${_ENV}
  GCS_PROJECT_ID=$PROJECT_ID

--set-secrets:
  SECRET_KEY=backend-secret-key:latest
  OPENAI_API_KEY=openai-api-key:latest
  DATABASE_URL=database-url-${_ENV}:latest
```

---

## Frontend Deployment

### Files Involved

#### 1. `frontend/Dockerfile`
Multi-stage build:
```dockerfile
# Stage 1: Build
FROM node:18-alpine AS build
ARG VITE_BACKEND_API_URL
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL
RUN npm ci && npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
```

#### 2. `frontend/nginx.conf`
Production-ready nginx configuration:
- Port 8080 (Cloud Run requirement)
- Gzip compression
- Security headers
- SPA routing (serves index.html for all routes)
- Static asset caching
- Health check endpoint at `/health`

#### 3. `frontend/cloudbuild.yaml`
Main Cloud Build configuration:
- **Step 1**: Pull previous image for caching
- **Step 2**: Build with `VITE_BACKEND_API_URL` build arg
- **Step 3-5**: Push images with multiple tags
- **Step 6**: Deploy to Cloud Run

**Key Substitution Variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `_ENV` | `dev` | Environment (dev/prod) |
| `_REGION` | `asia-south1` | GCP region |
| `_BACKEND_URL` | `https://synapse-backend-dev-XXX.a.run.app` | Backend API URL |

#### 4. `frontend/cloudbuild-dev.yaml`
Dev-specific substitutions:
```yaml
substitutions:
  _ENV: 'dev'
  _REGION: 'asia-south1'
  _BACKEND_URL: 'https://synapse-backend-dev-XXXXXXXXXX-el.a.run.app'
```

#### 5. `frontend/cloudbuild-prod.yaml`
Prod-specific substitutions:
```yaml
substitutions:
  _ENV: 'prod'
  _REGION: 'asia-south1'
  _BACKEND_URL: 'https://synapse-backend-prod-XXXXXXXXXX-el.a.run.app'
```

### Deployment Commands

#### Development Environment
```bash
# Step 1: Get backend URL
BACKEND_URL=$(gcloud run services describe synapse-backend-dev \
  --region=asia-south1 \
  --format='value(status.url)')

# Step 2: Deploy frontend
gcloud builds submit \
  --config=frontend/cloudbuild.yaml \
  --substitutions=_ENV=dev,_BACKEND_URL=$BACKEND_URL
```

#### Production Environment
```bash
# Step 1: Get backend URL
BACKEND_URL=$(gcloud run services describe synapse-backend-prod \
  --region=asia-south1 \
  --format='value(status.url)')

# Step 2: Deploy frontend
gcloud builds submit \
  --config=frontend/cloudbuild.yaml \
  --substitutions=_ENV=prod,_BACKEND_URL=$BACKEND_URL
```

#### Get Frontend URL
```bash
# Development
gcloud run services describe synapse-frontend-dev \
  --region=asia-south1 \
  --format='value(status.url)'

# Production
gcloud run services describe synapse-frontend-prod \
  --region=asia-south1 \
  --format='value(status.url)'
```

---

## Local Development

### Setup

#### 1. Clone Repository
```bash
git clone <repository-url>
cd synapse
```

#### 2. Backend Setup
```bash
cd backend

# Create local environment file
cp .env.dev .env.local

# Edit .env.local with your settings
# Key variables:
# - DATABASE_URL: Connection to Cloud SQL via proxy
# - GOOGLE_APPLICATION_CREDENTIALS: Path to service account key
# - OPENAI_API_KEY: Your OpenAI key
# - GCS_BUCKET_NAME: synapse_storage
# - GCS_FOLDER_PREFIX: local
```

#### 3. Frontend Setup
```bash
cd frontend

# Create environment file
cp .env.example .env

# Edit .env
echo 'VITE_BACKEND_API_URL=http://localhost:8000' > .env
```

#### 4. Service Account Key
```bash
# Create service account key for local development
gcloud iam service-accounts keys create backend/keys/synapse-storage-service.json \
  --iam-account=synapse-backend@synapse-473918.iam.gserviceaccount.com

# Important: Never commit this file!
```

### Running Locally with Docker Compose

#### Start All Services
```bash
# From project root
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

#### Services Running:
1. **Cloud SQL Proxy** (Port 5432):
   - Container: `synapse-cloud-sql-proxy`
   - Connects to Cloud SQL instance
   - Uses service account key from `backend/keys/`

2. **Backend** (Port 8000):
   - Container: `synapse-backend`
   - Hot reload enabled (code mounted)
   - API: http://localhost:8000
   - Docs: http://localhost:8000/docs
   - Health: http://localhost:8000/health

3. **Frontend** (Port 3000):
   - Container: `synapse-frontend`
   - Served by nginx
   - App: http://localhost:3000
   - Health: http://localhost:3000/health
   - API proxied to backend via nginx

#### docker-compose.yml Configuration

**Key Environment Variables:**
```yaml
backend:
  environment:
    ENVIRONMENT: local
    GOOGLE_APPLICATION_CREDENTIALS: /app/keys/synapse-storage-service.json
    DATABASE_URL: postgresql+asyncpg://local_user:Dell%406.75%402019@cloud-sql-proxy:5432/local
```

**Volume Mounts:**
- `./backend/keys:/app/keys:ro` - Service account key
- `./backend/app:/app/app` - Code for hot reload
- `./frontend:/app` - Frontend code (if using dev mode)

### Running Without Docker

#### Backend
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start Cloud SQL Proxy (in separate terminal)
cloud-sql-proxy synapse-473918:asia-south1:synapse --port 5432

# Run backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Development server
npm run dev  # Port 5173

# Production build
npm run build
npm run preview  # Port 4173
```

---

## Version Control & Tagging

### Docker Image Tags

Every deployment creates three tags in GCR:

1. **Build ID Tag**: `gcr.io/synapse-473918/synapse-backend:$BUILD_ID`
   - Unique per build (e.g., `abc123-def456`)
   - Immutable reference to specific build
   - Used for deployments (ensures exact version)

2. **Environment Tag**: `gcr.io/synapse-473918/synapse-backend:dev`
   - Points to latest deployment for environment
   - Updates with each deployment
   - Options: `dev`, `prod`

3. **Latest Tag**: `gcr.io/synapse-473918/synapse-backend:latest`
   - Always points to most recent build
   - Used for layer caching in subsequent builds
   - Not recommended for deployments

### Git Tags for Releases

#### Create Release Tag
```bash
# Tag current commit
git tag -a v1.0.0 -m "Release version 1.0.0"

# Push tag to remote
git push origin v1.0.0

# List all tags
git tag -l
```

#### Deploy Specific Git Tag
```bash
# Checkout tag
git checkout v1.0.0

# Deploy backend
gcloud builds submit \
  --config=backend/cloudbuild.yaml \
  --substitutions=_ENV=prod

# Deploy frontend (with backend URL)
BACKEND_URL=$(gcloud run services describe synapse-backend-prod \
  --region=asia-south1 \
  --format='value(status.url)')

gcloud builds submit \
  --config=frontend/cloudbuild.yaml \
  --substitutions=_ENV=prod,_BACKEND_URL=$BACKEND_URL
```

### Build ID Management

#### View Build History
```bash
# List recent builds
gcloud builds list --limit=10

# Get build details
gcloud builds describe BUILD_ID

# View build logs
gcloud builds log BUILD_ID
```

#### List Docker Images
```bash
# List backend images
gcloud container images list-tags gcr.io/synapse-473918/synapse-backend --limit=10

# List frontend images
gcloud container images list-tags gcr.io/synapse-473918/synapse-frontend --limit=10
```

#### Rollback to Previous Build
```bash
# Get previous build ID from GCR
gcloud container images list-tags gcr.io/synapse-473918/synapse-backend

# Deploy specific build
gcloud run deploy synapse-backend-prod \
  --image=gcr.io/synapse-473918/synapse-backend:PREVIOUS_BUILD_ID \
  --region=asia-south1
```

### Environment Promotion Strategy

```bash
# 1. Deploy to dev
gcloud builds submit --config=backend/cloudbuild.yaml --substitutions=_ENV=dev

# 2. Test in dev environment
# ... testing ...

# 3. Get dev build ID
DEV_BUILD_ID=$(gcloud run services describe synapse-backend-dev \
  --region=asia-south1 \
  --format='value(status.traffic[0].revisionName)' | sed 's/.*-\([^-]*\)$/\1/')

# 4. Promote exact same image to prod
gcloud run deploy synapse-backend-prod \
  --image=gcr.io/synapse-473918/synapse-backend:$DEV_BUILD_ID \
  --region=asia-south1 \
  --platform=managed \
  ... (other prod flags)
```

---

## Environment Management

### Environment Variables by Environment

#### Local (.env.local)
```bash
ENVIRONMENT=local
DATABASE_URL=postgresql+asyncpg://local_user:PASSWORD@cloud-sql-proxy:5432/local
GOOGLE_APPLICATION_CREDENTIALS=/app/keys/synapse-storage-service.json
GCS_BUCKET_NAME=synapse_storage
GCS_FOLDER_PREFIX=local
OPENAI_API_KEY=sk-...
SECRET_KEY=local-secret-key
```

#### Development (Cloud Run)
```bash
ENVIRONMENT=development
DATABASE_URL=postgresql+asyncpg://dev_user:PASSWORD@/dev?host=/cloudsql/...
GCS_FOLDER_PREFIX=dev
MIN_INSTANCES=0
MAX_INSTANCES=10
MEMORY=1Gi
CPU=2
```

#### Production (Cloud Run)
```bash
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://prod_user:PASSWORD@/prod?host=/cloudsql/...
GCS_FOLDER_PREFIX=prod
MIN_INSTANCES=1
MAX_INSTANCES=20
MEMORY=2Gi
CPU=4
RATE_LIMIT_PER_MINUTE=120
LOG_LEVEL=WARNING
```

### Database Migrations

#### Initialize Database
```bash
# Connect to database
gcloud sql connect synapse --user=dev_user --database=dev

# Run init script
\i backend/init_cloud_sql.sql
```

#### Create Migration
```bash
# Using Alembic (if configured)
cd backend
alembic revision --autogenerate -m "description"

# Apply migration
alembic upgrade head
```

### Storage Management

#### Upload to GCS
```bash
# Upload file to dev environment
gcloud storage cp local-file.pdf gs://synapse_storage/dev/

# Upload directory
gcloud storage cp -r ./documents/* gs://synapse_storage/dev/
```

#### Download from GCS
```bash
# Download file
gcloud storage cp gs://synapse_storage/dev/file.pdf ./

# List files in environment
gcloud storage ls gs://synapse_storage/dev/
```

#### Clean Up Old Files
```bash
# List files older than 30 days
gcloud storage ls -l gs://synapse_storage/dev/ | awk '$2 < "'$(date -d '30 days ago' +%Y-%m-%d)'" {print $3}'

# Delete old files
gcloud storage rm gs://synapse_storage/dev/old-file.pdf
```

---

## Troubleshooting

### Common Issues

#### 1. Build Fails - Docker Layer Caching
```bash
# Error: Failed to pull cache image
# Solution: First build might fail, it's expected
gcloud builds submit --config=backend/cloudbuild.yaml
# The "docker pull || exit 0" handles this gracefully
```

#### 2. Cloud Run Service Fails to Start
```bash
# Check logs
gcloud run services logs read synapse-backend-dev --region=asia-south1 --limit=50

# Common causes:
# - Missing secrets
# - Invalid DATABASE_URL
# - Service account permissions
```

#### 3. Database Connection Issues
```bash
# Test Cloud SQL connection
gcloud sql connect synapse --user=dev_user --database=dev

# Check Cloud Run has Cloud SQL instance attached
gcloud run services describe synapse-backend-dev \
  --region=asia-south1 \
  --format='value(spec.template.spec.containers[0].args)'
```

#### 4. Frontend Can't Reach Backend
```bash
# Check backend URL in frontend build
gcloud container images describe gcr.io/synapse-473918/synapse-frontend:dev \
  --format='get(image_summary.build_args)'

# Update frontend with correct backend URL
BACKEND_URL=$(gcloud run services describe synapse-backend-dev \
  --region=asia-south1 \
  --format='value(status.url)')

gcloud builds submit \
  --config=frontend/cloudbuild.yaml \
  --substitutions=_ENV=dev,_BACKEND_URL=$BACKEND_URL
```

#### 5. Secret Access Denied
```bash
# Grant service account access to secret
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### 6. Storage Permission Issues
```bash
# Grant storage permissions
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### Debugging Commands

```bash
# Get service configuration
gcloud run services describe SERVICE_NAME --region=asia-south1

# Stream logs in real-time
gcloud run services logs tail synapse-backend-dev --region=asia-south1

# Execute command in Cloud Run (not supported, use logs instead)
# For local debugging, use docker compose exec

# Check build status
gcloud builds list --limit=5

# Check image layers
gcloud container images describe gcr.io/synapse-473918/synapse-backend:latest
```

---

## Files Reference

### Backend Files
```
backend/
├── Dockerfile                 # Backend container definition
├── cloudbuild.yaml           # Main Cloud Build config
├── requirements.txt          # Python dependencies
├── init_cloud_sql.sql       # Database initialization
├── .env.dev                 # Dev environment template
├── .env.prod                # Prod environment template
├── .env.local               # Local development (not in git)
├── app/
│   ├── main.py             # FastAPI application
│   └── ...                 # Application code
└── keys/                   # Service account keys (not in git)
    └── synapse-storage-service.json
```

### Frontend Files
```
frontend/
├── Dockerfile               # Multi-stage build (Node + Nginx)
├── nginx.conf              # Nginx configuration for Cloud Run
├── cloudbuild.yaml         # Main Cloud Build config
├── cloudbuild-dev.yaml     # Dev substitutions
├── cloudbuild-prod.yaml    # Prod substitutions
├── .env.example            # Template for local .env
├── .env                    # Local environment (not in git)
├── package.json            # Node dependencies
└── src/                    # React application
```

### Scripts
```
scripts/
├── check-prerequisites.sh          # Check GCP setup
└── setup-backend-prerequisites.sh  # Automated GCP setup
```

### Root Files
```
.
├── docker-compose.yml              # Local development orchestration
├── GOOGLE_CLOUD_DEPLOYMENT_GUIDE.md  # This file
├── CLOUD_BUILD_BACKEND_SETUP.md    # Backend setup docs
└── CLOUD_BUILD_FRONTEND_SETUP.md   # Frontend setup docs
```

---

## Quick Reference Commands

### Complete Deployment Flow

```bash
# 1. Check prerequisites
./scripts/check-prerequisites.sh

# 2. Deploy backend to dev
gcloud builds submit --config=backend/cloudbuild.yaml

# 3. Get backend URL
BACKEND_URL=$(gcloud run services describe synapse-backend-dev \
  --region=asia-south1 --format='value(status.url)')

# 4. Deploy frontend to dev
gcloud builds submit \
  --config=frontend/cloudbuild.yaml \
  --substitutions=_ENV=dev,_BACKEND_URL=$BACKEND_URL

# 5. Get frontend URL
gcloud run services describe synapse-frontend-dev \
  --region=asia-south1 --format='value(status.url)'
```

### Health Checks

```bash
# Backend health
curl https://synapse-backend-dev-XXX.a.run.app/health

# Frontend health
curl https://synapse-frontend-dev-XXX.a.run.app/health

# API docs
open https://synapse-backend-dev-XXX.a.run.app/docs
```

### Resource Management

```bash
# List all Cloud Run services
gcloud run services list --region=asia-south1

# Delete service
gcloud run services delete SERVICE_NAME --region=asia-south1

# Delete old images (keep last 10)
gcloud container images list-tags gcr.io/synapse-473918/synapse-backend \
  --format='get(digest)' --limit=999 | tail -n +11 | \
  xargs -I {} gcloud container images delete gcr.io/synapse-473918/synapse-backend@{} --quiet
```

---

## Support & Additional Resources

- **Cloud Run Docs**: https://cloud.google.com/run/docs
- **Cloud Build Docs**: https://cloud.google.com/build/docs
- **Cloud SQL Docs**: https://cloud.google.com/sql/docs
- **GCS Docs**: https://cloud.google.com/storage/docs

For project-specific issues, check:
- Backend logs: `gcloud run services logs read synapse-backend-dev --region=asia-south1`
- Build logs: `gcloud builds log BUILD_ID`
- Cloud SQL logs: `gcloud sql operations list --instance=synapse`
