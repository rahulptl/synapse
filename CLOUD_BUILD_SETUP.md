# Cloud Build Continuous Deployment Setup

## Overview

This guide shows you how to set up **automatic deployment** to Cloud Run using Cloud Build triggers. When you push to your repository, Cloud Build will automatically build and deploy your backend.

## Architecture

```
GitHub Push → Cloud Build Trigger → Build Docker Image → Deploy to Cloud Run
```

- **develop branch** → deploys to `synapse-backend-dev`
- **main branch** → deploys to `synapse-backend-prod`

---

## Files Created for Cloud Build

| File | Purpose |
|------|---------|
| `Dockerfile.backend` | Root-level Dockerfile (Cloud Build compatible) |
| `cloudbuild-dev.yaml` | Build config for development |
| `cloudbuild-prod.yaml` | Build config for production |

---

## Option 1: Using Cloud Build UI (Recommended for Beginners)

### Step 1: Enable Cloud Build API

```bash
gcloud services enable cloudbuild.googleapis.com
```

### Step 2: Grant Cloud Build Permissions

Cloud Build needs permission to deploy to Cloud Run:

```bash
# Get Cloud Build service account
PROJECT_NUMBER=$(gcloud projects describe synapse-473918 --format="value(projectNumber)")
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Grant Cloud Run Admin role
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/run.admin"

# Grant Service Account User role (needed to deploy as compute SA)
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/iam.serviceAccountUser"

# Grant Secret Manager Secret Accessor (to reference secrets)
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

### Step 3: Connect GitHub Repository

1. Go to **Cloud Build** console:
   - https://console.cloud.google.com/cloud-build/triggers?project=synapse-473918

2. Click **"CONNECT REPOSITORY"**

3. Select source: **GitHub (Cloud Build GitHub App)**

4. Authenticate with GitHub

5. Select your repository: `synapse`

6. Click **"CONNECT"**

### Step 4: Create Development Trigger

1. Click **"CREATE TRIGGER"**

2. Configure trigger:
   - **Name**: `deploy-backend-dev`
   - **Description**: `Deploy backend to development on develop branch`
   - **Event**: Push to a branch
   - **Source**:
     - **Repository**: `your-github-username/synapse`
     - **Branch**: `^develop$`
   - **Configuration**:
     - **Type**: Cloud Build configuration file (yaml or json)
     - **Location**: Repository
     - **Cloud Build configuration file location**: `/cloudbuild-dev.yaml`

3. **Advanced** (click to expand):
   - **Service account**: Leave as default (Cloud Build service account)

4. Click **"CREATE"**

### Step 5: Create Production Trigger

1. Click **"CREATE TRIGGER"** again

2. Configure trigger:
   - **Name**: `deploy-backend-prod`
   - **Description**: `Deploy backend to production on main branch`
   - **Event**: Push to a branch
   - **Source**:
     - **Repository**: `your-github-username/synapse`
     - **Branch**: `^main$`
   - **Configuration**:
     - **Type**: Cloud Build configuration file (yaml or json)
     - **Location**: Repository
     - **Cloud Build configuration file location**: `/cloudbuild-prod.yaml`

3. Click **"CREATE"**

### Step 6: Update Database Passwords in Build Config

**IMPORTANT**: Update the `DATABASE_URL` in your build files with the actual password:

#### Option A: Use Secret Manager (Recommended)

Create a secret for the database URL:

```bash
# Development
echo -n "postgresql+asyncpg://dev_user:ACTUAL_DEV_PASSWORD@/dev" | gcloud secrets create dev-database-url --data-file=-

# Production
echo -n "postgresql+asyncpg://prod_user:ACTUAL_PROD_PASSWORD@/prod" | gcloud secrets create prod-database-url --data-file=-
```

Then update `cloudbuild-dev.yaml` and `cloudbuild-prod.yaml` to use:

```yaml
# Replace this line in the deploy step:
- '--set-env-vars=...,DATABASE_URL=postgresql+asyncpg://dev_user:YOUR_PASSWORD@/dev,...'

# With this:
- '--set-secrets=SECRET_KEY=dev-secret-key:latest,OPENAI_API_KEY=dev-openai-key:latest,DATABASE_URL=dev-database-url:latest'
```

#### Option B: Direct Password (Less Secure)

Edit `cloudbuild-dev.yaml` and `cloudbuild-prod.yaml` and replace `YOUR_PASSWORD` with the actual database password.

**⚠️ Warning**: Do not commit actual passwords to Git! Use Option A with Secret Manager.

---

## Option 2: Simple Dockerfile-Only Setup

If you want the simplest setup without `cloudbuild.yaml` files:

### In Cloud Build UI:

**Development Trigger:**
- Branch: `^develop$`
- Build Type: **Dockerfile**
- Source location: `/Dockerfile.backend`
- **Service name**: `synapse-backend-dev`
- **Region**: `asia-south1`

**Production Trigger:**
- Branch: `^main$`
- Build Type: **Dockerfile**
- Source location: `/Dockerfile.backend`
- **Service name**: `synapse-backend-prod`
- **Region**: `asia-south1`

**Limitation**: This approach only builds the image. You'll need to manually configure Cloud Run settings (env vars, secrets, etc.) once via UI.

---

## Option 3: Using gcloud CLI

### Create Development Trigger

```bash
gcloud builds triggers create github \
  --name="deploy-backend-dev" \
  --repo-name="synapse" \
  --repo-owner="YOUR_GITHUB_USERNAME" \
  --branch-pattern="^develop$" \
  --build-config="cloudbuild-dev.yaml" \
  --description="Deploy backend to development"
```

### Create Production Trigger

```bash
gcloud builds triggers create github \
  --name="deploy-backend-prod" \
  --repo-name="synapse" \
  --repo-owner="YOUR_GITHUB_USERNAME" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild-prod.yaml" \
  --description="Deploy backend to production"
```

---

## Testing Your Setup

### Step 1: Commit Your Changes

```bash
# Add Cloud Build files
git add Dockerfile.backend cloudbuild-dev.yaml cloudbuild-prod.yaml
git commit -m "Add Cloud Build configuration for CI/CD"

# Push to develop branch
git checkout -b develop  # if you don't have a develop branch
git push origin develop
```

### Step 2: Monitor the Build

1. Go to Cloud Build console:
   - https://console.cloud.google.com/cloud-build/builds?project=synapse-473918

2. You should see a build triggered automatically

3. Click on the build to see logs in real-time

4. Build takes ~5-10 minutes first time (then ~2-3 minutes with cache)

### Step 3: Verify Deployment

Once build succeeds:

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe synapse-backend-dev --region asia-south1 --format="value(status.url)")

# Test health endpoint
curl $SERVICE_URL/health

# Should return: {"status":"healthy"}
```

---

## Configuration Files Explained

### `Dockerfile.backend`

This is a **root-level** Dockerfile that:
- Uses multi-stage build (smaller final image)
- Copies from `backend/` directory
- Runs as non-root user (security)
- Includes health checks

### `cloudbuild-dev.yaml`

Development build configuration:
- Builds Docker image with commit SHA tag
- Pushes to Container Registry
- Deploys to `synapse-backend-dev`
- Uses dev environment variables
- References dev secrets

### `cloudbuild-prod.yaml`

Production build configuration:
- Same as dev but with production settings
- Deploys to `synapse-backend-prod`
- Higher resource limits (2Gi memory, 2 CPU)
- Min instances: 1 (always warm)

---

## Environment Variables in Cloud Build

Variables are set in the `--set-env-vars` argument:

```yaml
--set-env-vars=ENVIRONMENT=development,API_V1_STR=/api/v1,...
```

**What's configured:**
- `ENVIRONMENT`: development/production
- `DATABASE_URL`: PostgreSQL connection string
- `CLOUD_SQL_CONNECTION_NAME`: Cloud SQL instance
- `STORAGE_BACKEND`: gcs
- `GCS_BUCKET_NAME`: synapse_storage
- All app settings (chunk size, models, etc.)

**Secrets** (from Secret Manager):
```yaml
--set-secrets=SECRET_KEY=dev-secret-key:latest,OPENAI_API_KEY=dev-openai-key:latest
```

---

## Build Process Flow

```
1. Trigger: Git push to branch
   ↓
2. Cloud Build: Clone repository
   ↓
3. Docker Build: Build image from Dockerfile.backend
   ↓
4. Push: Upload image to gcr.io
   ↓
5. Deploy: gcloud run deploy
   ↓
6. Success: Service updated with new revision
```

**Time breakdown:**
- Clone & setup: ~30s
- Docker build: ~3-5 mins (first time), ~1-2 mins (cached)
- Push image: ~30s-1min
- Deploy: ~30s-1min
- **Total**: ~5-8 mins first time, ~3-4 mins subsequent

---

## Updating Build Configuration

### To change environment variables:

1. Edit `cloudbuild-dev.yaml` or `cloudbuild-prod.yaml`
2. Update the `--set-env-vars` line
3. Commit and push
4. Next deployment will use new values

### To change resource limits:

Update these arguments in the deploy step:
```yaml
- '--memory=2Gi'      # Change memory
- '--cpu=2'           # Change CPU
- '--max-instances=20' # Change max scale
```

---

## Troubleshooting

### Build fails with "Permission denied"

**Solution**: Grant Cloud Build service account the necessary roles:
```bash
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/run.admin"
```

### Build succeeds but deployment fails

**Check Cloud Run logs**:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=synapse-backend-dev AND severity>=ERROR" --limit 20
```

Common issues:
- Database connection fails (check `DATABASE_URL`)
- Secrets not found (verify secrets exist in Secret Manager)
- Cloud SQL connection not added

### Build is slow

**Optimize**:
1. Use Docker layer caching (already configured)
2. Use faster machine type in `options.machineType`
3. Reduce image size (remove unnecessary files)

### Want to manually trigger a build

```bash
# Trigger development build
gcloud builds triggers run deploy-backend-dev --branch=develop

# Trigger production build
gcloud builds triggers run deploy-backend-prod --branch=main
```

---

## Best Practices

### 1. Branch Strategy

- **develop** branch: For development/testing
- **main** branch: For production releases
- Create **feature branches** that merge to develop
- Merge develop → main when ready for production

### 2. Database Passwords

**Never commit passwords to Git!**

Use Secret Manager:
```bash
echo -n "postgresql+asyncpg://user:password@/db" | gcloud secrets create dev-database-url --data-file=-
```

Then reference in build config:
```yaml
--set-secrets=DATABASE_URL=dev-database-url:latest
```

### 3. Testing Before Deploy

Add a test step to your build:
```yaml
steps:
  # ... build steps ...

  # Run tests
  - name: 'python:3.11-slim'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        cd backend
        pip install -r requirements.txt
        pytest tests/

  # ... deploy step ...
```

### 4. Rollback Strategy

If a deployment fails, rollback to previous revision:
```bash
# List revisions
gcloud run revisions list --service synapse-backend-dev --region asia-south1

# Rollback to specific revision
gcloud run services update-traffic synapse-backend-dev \
  --region asia-south1 \
  --to-revisions REVISION_NAME=100
```

---

## Monitoring Builds

### View Build History

https://console.cloud.google.com/cloud-build/builds?project=synapse-473918

### Get Build Logs

```bash
# List recent builds
gcloud builds list --limit 10

# Get specific build logs
gcloud builds log BUILD_ID
```

### Set Up Notifications

Get notified when builds fail:

1. Go to Cloud Build → Settings
2. Enable notifications
3. Choose Slack, Email, or Pub/Sub

---

## Cost Estimation

**Cloud Build pricing:**
- First 120 build-minutes/day: **FREE**
- Additional: $0.003/build-minute

**Example:**
- 10 deploys/day
- 5 minutes per build
- 50 minutes total
- **Cost**: $0 (within free tier)

**Monthly estimate** (beyond free tier):
- ~300 deploys/month
- ~25 hours total
- **Cost**: ~$4.50/month

---

## Next Steps

1. ✅ Enable Cloud Build API
2. ✅ Grant Cloud Build permissions
3. ✅ Connect GitHub repository
4. ✅ Create development trigger
5. ✅ Create production trigger
6. ✅ Update database passwords in Secret Manager
7. ⬜ Push to develop branch and test
8. ⬜ Monitor build in Cloud Build console
9. ⬜ Verify deployment in Cloud Run
10. ⬜ Set up build notifications

---

## Quick Reference

```bash
# View triggers
gcloud builds triggers list

# Run trigger manually
gcloud builds triggers run TRIGGER_NAME --branch=BRANCH_NAME

# View builds
gcloud builds list --limit 10

# View build logs
gcloud builds log BUILD_ID

# Cancel a build
gcloud builds cancel BUILD_ID

# Delete a trigger
gcloud builds triggers delete TRIGGER_NAME
```
