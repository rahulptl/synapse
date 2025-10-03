# GCP Migration Guide - UI-Based Deployment

## Overview

This guide walks you through migrating your Synapse application to Google Cloud Platform using the **GCP Console UI** (web interface) instead of command-line tools.

**Assumptions:**
- ✅ You have 3 Cloud SQL databases already set up (local, dev, prod)
- ✅ You have 3 GCS buckets already set up (local, dev, prod)
- ✅ You have full admin access to GCP Console

## Architecture

### Environments

| Environment | Cloud Run Services | Database | Storage Bucket |
|-------------|-------------------|----------|----------------|
| **Local** | None (runs locally) | synapse_local | synapse-storage-local |
| **Dev** | Frontend + Backend | synapse_dev | synapse-storage-dev |
| **Prod** | Frontend + Backend | synapse_prod | synapse-storage-prod |

### GCP Services Used
- **Cloud Run**: Host frontend (nginx) and backend (FastAPI)
- **Cloud SQL**: PostgreSQL with pgvector (already set up)
- **Cloud Storage**: File storage (already set up)
- **Secret Manager**: Store API keys and passwords
- **Artifact Registry**: Store Docker images

---

## Phase 1: Code Changes (Minimal)

### Backend Changes

#### 1.1 Update `backend/app/config.py`

Add GCS configuration to the Settings class:

```python
class Settings(BaseSettings):
    # ... existing fields ...

    # Add these new fields for GCS
    GCS_BUCKET_NAME: Optional[str] = None
    GCS_PROJECT_ID: Optional[str] = None
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None  # For local dev only

    # Add Cloud SQL connection for Cloud Run
    CLOUD_SQL_CONNECTION_NAME: Optional[str] = None

    @field_validator("STORAGE_BACKEND")
    @classmethod
    def validate_storage_backend(cls, v: str) -> str:
        if v not in ["gcs", "s3", "local"]:  # Add gcs
            raise ValueError("STORAGE_BACKEND must be one of: gcs, s3, local")
        return v
```

#### 1.2 Update `backend/app/core/storage.py`

Add GCS backend class (add this to your existing storage.py file):

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
            # Cloud Run uses default service account (no credentials needed)
            self.client = storage.Client(project=settings.GCS_PROJECT_ID)

        self.bucket = self.client.bucket(settings.GCS_BUCKET_NAME)

    async def upload_content(self, path: str, content: bytes, content_type: str) -> str:
        """Upload content to GCS."""
        try:
            blob = self.bucket.blob(path)
            blob.upload_from_string(content, content_type=content_type)
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

Update the `_create_backend` method in StorageService:

```python
def _create_backend(self) -> StorageBackend:
    backend_type = settings.STORAGE_BACKEND.lower()

    if backend_type == "gcs":
        return GCSStorageBackend()
    elif backend_type == "s3":
        return S3StorageBackend()
    # ... rest of code
```

#### 1.3 Update `backend/app/core/database.py`

Add Cloud SQL Unix socket support (add this function at the top):

```python
def get_database_url() -> str:
    """Get database URL based on environment."""
    base_url = str(settings.DATABASE_URL)

    # If running on Cloud Run, use Unix socket
    if settings.CLOUD_SQL_CONNECTION_NAME:
        # Replace host:port with Unix socket path
        import re
        base_url = re.sub(
            r'@[^/]+/',
            f'@/{settings.CLOUD_SQL_CONNECTION_NAME}/',
            base_url
        )

    return base_url
```

Update engine creation:

```python
engine = create_async_engine(
    get_database_url(),  # Changed from str(settings.DATABASE_URL)
    # ... rest of config stays the same
)
```

#### 1.4 Create Dockerfile for Backend

Create `backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Create `backend/.dockerignore`:

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

### Frontend Changes

#### 1.5 Create Dockerfile for Frontend

Create `frontend/Dockerfile`:

```dockerfile
# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_BACKEND_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# Build the app
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

Create `frontend/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # SPA routing - serve index.html for all routes
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

Create `frontend/.dockerignore`:

```
node_modules/
dist/
.env
.env.*
*.log
.DS_Store
```

#### 1.6 Update Environment Files

**frontend/.env.development**:
```env
VITE_BACKEND_API_URL=https://YOUR_BACKEND_DEV_URL
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-key
```

**frontend/.env.production**:
```env
VITE_BACKEND_API_URL=https://YOUR_BACKEND_PROD_URL
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-key
```

---

## Phase 2: GCP Console Setup (UI Steps)

### Step 1: Enable Required APIs

1. Go to **GCP Console**: https://console.cloud.google.com
2. Select your project
3. Navigate to **APIs & Services** → **Library**
4. Search and enable the following APIs:
   - ✅ Cloud Run API
   - ✅ Cloud Build API
   - ✅ Artifact Registry API
   - ✅ Secret Manager API
   - ✅ Cloud SQL Admin API (should already be enabled)
   - ✅ Cloud Storage API (should already be enabled)

### Step 2: Create Artifact Registry Repository

1. Go to **Artifact Registry** → **Repositories**
2. Click **+ CREATE REPOSITORY**
3. Configure:
   - **Name**: `synapse`
   - **Format**: Docker
   - **Location type**: Region
   - **Region**: `us-central1` (or your preferred region)
   - **Encryption**: Google-managed
4. Click **CREATE**

### Step 3: Set Up Secret Manager

#### 3.1 Create Secrets

1. Go to **Secret Manager** → **CREATE SECRET**

Create the following secrets:

**Secret 1: `openai-api-key`**
- Name: `openai-api-key`
- Secret value: `YOUR_OPENAI_API_KEY`
- Click **CREATE SECRET**

**Secret 2: `jwt-secret-key`**
- Name: `jwt-secret-key`
- Secret value: `YOUR_SECRET_KEY_HERE` (generate a secure random string)
- Click **CREATE SECRET**

**Secret 3: `db-password-local`**
- Name: `db-password-local`
- Secret value: Your local database password
- Click **CREATE SECRET**

**Secret 4: `db-password-dev`**
- Name: `db-password-dev`
- Secret value: Your dev database password
- Click **CREATE SECRET**

**Secret 5: `db-password-prod`**
- Name: `db-password-prod`
- Secret value: Your prod database password
- Click **CREATE SECRET**

#### 3.2 Grant Access to Cloud Run

1. For each secret, click on it
2. Go to **PERMISSIONS** tab
3. Click **+ GRANT ACCESS**
4. Add principal: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`
   - To find PROJECT_NUMBER: Go to **Home** → Dashboard, it's shown under "Project Info"
5. Select role: **Secret Manager Secret Accessor**
6. Click **SAVE**

### Step 4: Configure Cloud Storage Buckets

You mentioned you already have 3 buckets. Verify their configuration:

1. Go to **Cloud Storage** → **Buckets**
2. For each bucket (`synapse-storage-local`, `synapse-storage-dev`, `synapse-storage-prod`):

**Click on bucket → PERMISSIONS tab:**
- Ensure the Cloud Run service account has **Storage Object Admin** role
- Add: `PROJECT_NUMBER-compute@developer.gserviceaccount.com` with role **Storage Object Admin**

**Click on bucket → CONFIGURATION tab:**
- If you need public access to files, add:
  - Principal: `allUsers`
  - Role: **Storage Object Viewer**

**Set CORS (if frontend uploads directly to GCS):**
1. Click bucket → **CONFIGURATION** tab
2. Scroll to **CORS** section
3. Click **EDIT**
4. Add CORS configuration:
```json
[
  {
    "origin": ["https://your-dev-domain.com", "https://your-prod-domain.com"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

### Step 5: Get Cloud SQL Connection Information

1. Go to **Cloud SQL** → **Instances**
2. Click on your **dev** instance
3. Copy the **Connection name** (format: `PROJECT_ID:REGION:INSTANCE_NAME`)
   - Example: `synapse-main:us-central1:synapse-dev`
4. Repeat for **prod** instance

You'll need these connection names for Cloud Run configuration.

---

## Phase 3: Build and Push Docker Images (Using Cloud Build via UI)

### Option A: Cloud Build via UI (Recommended)

#### For Backend:

1. **Go to Cloud Build** → **History**
2. Click **SUBMIT BUILD**
3. Configure:
   - **Source**: Choose **Local file**
   - Click **BROWSE** and select your `backend` folder (zip it first if needed)
   - **Build Configuration**: Dockerfile
   - **Dockerfile name**: `Dockerfile`
   - **Dockerfile directory**: `.`
   - **Image**: `us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/backend:dev`
4. Click **BUILD**

Wait for build to complete (check status in History tab).

Repeat for production:
- Image: `us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/backend:prod`

#### For Frontend:

1. Click **SUBMIT BUILD** again
2. Configure:
   - **Source**: Upload your `frontend` folder (zipped)
   - **Build Configuration**: Dockerfile
   - **Build arguments** (click **+ ADD BUILD ARGUMENT**):
     - `VITE_BACKEND_API_URL` = `https://your-backend-dev-url` (you'll get this after deploying backend)
     - `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
     - `VITE_SUPABASE_PUBLISHABLE_KEY` = `your-key`
   - **Image**: `us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/frontend:dev`
3. Click **BUILD**

Repeat for production with prod environment variables.

### Option B: Local Build and Push

If you prefer to build locally:

1. **Authenticate Docker:**
```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

2. **Build and push backend:**
```bash
cd backend
docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/backend:dev .
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/backend:dev
```

3. **Build and push frontend:**
```bash
cd frontend
docker build \
  --build-arg VITE_BACKEND_API_URL=https://YOUR_BACKEND_URL \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=your-key \
  -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/frontend:dev .
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/synapse/frontend:dev
```

---

## Phase 4: Deploy to Cloud Run (UI Steps)

### Deploy Backend (Development)

1. **Go to Cloud Run** → **CREATE SERVICE**

2. **Container, Connectivity, Security:**
   - **Deployment platform**: Cloud Run (fully managed)
   - **Region**: `us-central1`
   - **Container image URL**: Click **SELECT** → Artifact Registry
     - Choose: `synapse/backend` → select `dev` tag
   - **Service name**: `synapse-backend-dev`

3. **Authentication:**
   - Select: **Allow unauthenticated invocations**

4. **Container, Connections, Security** (expand sections):

   **Container(s) tab:**
   - **Container port**: `8000`
   - **Memory**: `512 MiB`
   - **CPU**: `1`
   - **Request timeout**: `300` seconds
   - **Maximum requests per container**: `80`

   **Variables & Secrets tab:**

   **Environment variables** (click **+ ADD VARIABLE**):
   - `ENVIRONMENT` = `development`
   - `STORAGE_BACKEND` = `gcs`
   - `GCS_BUCKET_NAME` = `synapse-storage-dev`
   - `GCS_PROJECT_ID` = `YOUR_PROJECT_ID`
   - `CLOUD_SQL_CONNECTION_NAME` = `YOUR_PROJECT_ID:us-central1:synapse-dev`
   - `DATABASE_URL` = `postgresql+asyncpg://synapse_dev_user@/synapse_dev?host=/cloudsql/YOUR_PROJECT_ID:us-central1:synapse-dev`

   **Secrets** (click **+ REFERENCE A SECRET**):
   - `SECRET_KEY` → Reference secret: `jwt-secret-key:latest`
   - `OPENAI_API_KEY` → Reference secret: `openai-api-key:latest`

   **Connections tab:**
   - Click **+ ADD CONNECTION**
   - **Connection type**: Cloud SQL connections
   - Select your Cloud SQL instance: `synapse-dev`

5. **Autoscaling:**
   - **Minimum instances**: `0`
   - **Maximum instances**: `10`

6. Click **CREATE**

7. **Wait for deployment** (may take 2-3 minutes)

8. **Copy the service URL** (e.g., `https://synapse-backend-dev-xxx.run.app`)

### Deploy Frontend (Development)

1. **Go to Cloud Run** → **CREATE SERVICE**

2. **Container:**
   - **Region**: `us-central1`
   - **Container image**: Select `synapse/frontend:dev`
   - **Service name**: `synapse-frontend-dev`

3. **Authentication:**
   - **Allow unauthenticated invocations**

4. **Container settings:**
   - **Container port**: `80`
   - **Memory**: `256 MiB`
   - **CPU**: `1`
   - **Request timeout**: `60`

5. **Environment variables:**
   - None needed (baked into build)

6. **Autoscaling:**
   - **Min**: `0`, **Max**: `5`

7. Click **CREATE**

8. **Copy the service URL**

### Update Frontend and Rebuild

Since frontend needs backend URL:

1. **Rebuild frontend image** with the correct backend URL:
   - Use Cloud Build or local build with `VITE_BACKEND_API_URL=https://synapse-backend-dev-xxx.run.app`
   - Push with same tag: `frontend:dev`

2. **Redeploy frontend** in Cloud Run:
   - Go to service `synapse-frontend-dev`
   - Click **EDIT & DEPLOY NEW REVISION**
   - Keep all settings same (Cloud Run will pull the updated image)
   - Click **DEPLOY**

### Deploy Production Services

Repeat the same steps for production:

**Backend Production:**
- Service name: `synapse-backend-prod`
- Image: `backend:prod`
- Database: `synapse_prod`
- Bucket: `synapse-storage-prod`
- Memory: `1 GiB`, CPU: `2`
- Min instances: `1`, Max: `50`
- Cloud SQL connection: `synapse-prod` instance

**Frontend Production:**
- Service name: `synapse-frontend-prod`
- Image: `frontend:prod` (built with prod backend URL)
- Memory: `512 MiB`
- Min instances: `1`, Max: `20`

---

## Phase 5: Custom Domain Setup (Optional)

### Add Custom Domain to Cloud Run

1. **Go to Cloud Run** → Select service (e.g., `synapse-backend-dev`)
2. Click **MANAGE CUSTOM DOMAINS** (top right)
3. Click **ADD MAPPING**
4. Select service: `synapse-backend-dev`
5. Enter domain: `api-dev.synapse.yourdomain.com`
6. Click **CONTINUE**
7. **Copy the DNS records** shown (CNAME or A record)
8. Click **DONE**

Repeat for:
- Backend prod: `api.synapse.yourdomain.com`
- Frontend dev: `dev.synapse.yourdomain.com`
- Frontend prod: `synapse.yourdomain.com`

### Update DNS Provider

Go to your DNS provider (Cloudflare, GoDaddy, etc.) and add the records shown by GCP.

Wait 10-60 minutes for DNS propagation.

---

## Phase 6: Local Development Setup

### 6.1 Install Cloud SQL Proxy

**macOS:**
```bash
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.arm64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/
```

**Windows:**
Download from: https://cloud.google.com/sql/docs/postgres/sql-proxy#install

### 6.2 Create Service Account for Local Dev

1. **Go to IAM & Admin** → **Service Accounts**
2. Click **+ CREATE SERVICE ACCOUNT**
3. Name: `synapse-local-dev`
4. Click **CREATE AND CONTINUE**
5. Grant roles:
   - **Cloud SQL Client**
   - **Storage Object Admin**
6. Click **DONE**
7. Click on the service account
8. Go to **KEYS** tab → **ADD KEY** → **Create new key**
9. Select **JSON** → **CREATE**
10. Save the JSON file as `synapse-local-dev-key.json` in your project root

### 6.3 Set Up Local Environment

Create `backend/.env.local`:

```env
ENVIRONMENT=local
DATABASE_URL=postgresql+asyncpg://synapse_local_user:YOUR_PASSWORD@localhost:5432/synapse_local
SECRET_KEY=local-dev-secret-key
OPENAI_API_KEY=YOUR_OPENAI_KEY

STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=synapse-storage-local
GCS_PROJECT_ID=YOUR_PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS=/path/to/synapse-local-dev-key.json

LOG_LEVEL=DEBUG
```

### 6.4 Run Locally

**Terminal 1 - Start Cloud SQL Proxy:**
```bash
cloud-sql-proxy YOUR_PROJECT_ID:us-central1:synapse-dev
```

**Terminal 2 - Start Backend:**
```bash
cd backend
source env/bin/activate
uvicorn app.main:app --reload --env-file .env.local
```

**Terminal 3 - Start Frontend:**
```bash
cd frontend
npm run dev
```

Access: http://localhost:8080

---

## Phase 7: Monitoring and Logging (UI)

### Set Up Logging

1. **Go to Logging** → **Logs Explorer**
2. View logs by selecting:
   - **Resource type**: Cloud Run Revision
   - **Service name**: `synapse-backend-dev` or `synapse-frontend-dev`

### Set Up Monitoring

1. **Go to Monitoring** → **Dashboards**
2. Click **+ CREATE DASHBOARD**
3. Name: `Synapse Application`
4. Add charts:
   - Cloud Run request count
   - Cloud Run request latency
   - Cloud Run error rate
   - Cloud SQL connections
   - Storage bucket operations

### Set Up Alerts

1. **Go to Monitoring** → **Alerting**
2. Click **+ CREATE POLICY**
3. Examples:
   - **High error rate**: Cloud Run error rate > 5%
   - **High latency**: Request latency > 2s
   - **Low CPU**: CPU utilization < 10% (to detect issues)

---

## Phase 8: CI/CD Setup (Optional - UI Based)

### Using Cloud Build Triggers

1. **Go to Cloud Build** → **Triggers**
2. Click **CREATE TRIGGER**

**Backend Dev Trigger:**
- **Name**: `deploy-backend-dev`
- **Event**: Push to branch
- **Source**: Connect your GitHub/GitLab repository
- **Branch**: `^develop$`
- **Configuration**: Dockerfile
- **Dockerfile path**: `backend/Dockerfile`
- **Image**: `us-central1-docker.pkg.dev/PROJECT/synapse/backend:dev`
- **Advanced** → **Service account**: Use default

3. Click **CREATE**

**Backend Prod Trigger:**
- Same as above but:
- **Branch**: `^main$`
- **Image**: `.../backend:prod`

**Frontend Triggers:**
- Similar setup with frontend Dockerfile
- Add **Substitution variables** for build args:
  - `_VITE_BACKEND_API_URL`
  - `_VITE_SUPABASE_URL`
  - `_VITE_SUPABASE_PUBLISHABLE_KEY`

---

## Configuration Summary

### Environment Variables Reference

| Environment | Backend Service | Frontend Service | Database | Storage Bucket |
|-------------|----------------|------------------|----------|----------------|
| **Local** | Local (port 8000) | Local (port 8080) | synapse_local (via proxy) | synapse-storage-local |
| **Dev** | synapse-backend-dev | synapse-frontend-dev | synapse_dev | synapse-storage-dev |
| **Prod** | synapse-backend-prod | synapse-frontend-prod | synapse_prod | synapse-storage-prod |

### Backend Environment Variables (Cloud Run)

**Development:**
```
ENVIRONMENT=development
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=synapse-storage-dev
GCS_PROJECT_ID=YOUR_PROJECT_ID
CLOUD_SQL_CONNECTION_NAME=PROJECT:REGION:synapse-dev
DATABASE_URL=postgresql+asyncpg://user@/synapse_dev?host=/cloudsql/...
SECRET_KEY=<from Secret Manager>
OPENAI_API_KEY=<from Secret Manager>
```

**Production:**
```
ENVIRONMENT=production
STORAGE_BACKEND=gcs
GCS_BUCKET_NAME=synapse-storage-prod
GCS_PROJECT_ID=YOUR_PROJECT_ID
CLOUD_SQL_CONNECTION_NAME=PROJECT:REGION:synapse-prod
DATABASE_URL=postgresql+asyncpg://user@/synapse_prod?host=/cloudsql/...
SECRET_KEY=<from Secret Manager>
OPENAI_API_KEY=<from Secret Manager>
```

---

## Troubleshooting

### Cloud Run Deployment Fails

1. **Check logs**: Cloud Run → Service → LOGS tab
2. **Common issues**:
   - Port mismatch (backend should be 8000, frontend 80)
   - Missing environment variables
   - Cloud SQL connection not configured
   - Secret Manager permissions

### Database Connection Issues

1. **Verify Cloud SQL connection** is added to Cloud Run service
2. **Check DATABASE_URL** format for Cloud Run:
   ```
   postgresql+asyncpg://user@/database?host=/cloudsql/PROJECT:REGION:INSTANCE
   ```
   Note: No password in URL when using Cloud SQL, no hostname/port

3. **Grant Cloud Run service account** Cloud SQL Client role

### Storage Upload Issues

1. **Check bucket permissions**: Cloud Run service account needs Storage Object Admin
2. **Verify GCS_BUCKET_NAME** matches exactly
3. **Check CORS configuration** if uploading from browser

### Frontend Can't Connect to Backend

1. **Rebuild frontend** with correct `VITE_BACKEND_API_URL`
2. **Check backend CORS** settings in `backend/app/middleware/cors.py`
3. **Verify backend is running**: Visit backend URL directly

---

## Migration Checklist

- [ ] **Code Changes**
  - [ ] Update backend config.py with GCS settings
  - [ ] Add GCS backend class to storage.py
  - [ ] Update database.py for Cloud SQL connection
  - [ ] Create backend Dockerfile and .dockerignore
  - [ ] Create frontend Dockerfile, nginx.conf, .dockerignore
  - [ ] Update frontend .env files

- [ ] **GCP Console Setup**
  - [ ] Enable required APIs
  - [ ] Create Artifact Registry repository
  - [ ] Create secrets in Secret Manager
  - [ ] Grant secret access to Cloud Run service account
  - [ ] Configure bucket permissions
  - [ ] Get Cloud SQL connection names

- [ ] **Build & Push Images**
  - [ ] Build backend:dev image
  - [ ] Build backend:prod image
  - [ ] Build frontend:dev image
  - [ ] Build frontend:prod image

- [ ] **Deploy to Cloud Run**
  - [ ] Deploy backend-dev
  - [ ] Deploy backend-prod
  - [ ] Rebuild frontend with backend URLs
  - [ ] Deploy frontend-dev
  - [ ] Deploy frontend-prod

- [ ] **Testing**
  - [ ] Test dev environment
  - [ ] Test database operations
  - [ ] Test file uploads
  - [ ] Test authentication
  - [ ] Test prod environment

- [ ] **Local Development**
  - [ ] Install Cloud SQL Proxy
  - [ ] Create service account for local dev
  - [ ] Set up .env.local
  - [ ] Test local development

- [ ] **Optional**
  - [ ] Set up custom domains
  - [ ] Configure monitoring alerts
  - [ ] Set up CI/CD triggers

---

## Cost Optimization Tips

1. **Development environment**:
   - Set min instances to 0 (scales to zero when not in use)
   - Use smaller Cloud SQL instance
   - Delete old container images in Artifact Registry

2. **Production environment**:
   - Set appropriate min instances (1-2)
   - Enable Cloud CDN for static assets
   - Set up lifecycle policies on Storage buckets

3. **General**:
   - Delete unused Cloud Build artifacts
   - Monitor costs in **Billing** → **Reports**
   - Set up budget alerts

---

## Next Steps After Migration

1. **Run database migrations**: Use Alembic to set up tables
2. **Import existing data**: If migrating from another system
3. **Load testing**: Test with expected traffic
4. **Security review**: Enable VPC, Cloud Armor if needed
5. **Backup strategy**: Configure automated backups
6. **Documentation**: Update team documentation with new URLs

---

**Estimated Setup Time**: 3-6 hours for complete UI-based setup

**Support**: For issues, check Cloud Run logs first, then Cloud Build history for image issues.
