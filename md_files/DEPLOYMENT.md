# Synapse Deployment Guide

Complete guide for deploying Synapse across all environments: Local, Development (Cloud), and Production (Cloud).

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [1. Local Development with Hot Reload](#1-local-development-with-hot-reload)
- [2. Deploy to Development (Cloud)](#2-deploy-to-development-cloud)
- [3. Deploy to Production (Cloud)](#3-deploy-to-production-cloud)
- [Environment Comparison](#environment-comparison)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting](#troubleshooting)

---

## Overview

Synapse supports three deployment environments:

| Environment | Purpose | Infrastructure | Deployment Method |
|-------------|---------|----------------|-------------------|
| **Local** | Development with hot reload | Docker Compose | Script: `./scripts/dev-local.sh` |
| **Dev** | Cloud testing environment | GCP Cloud Run (Mumbai) | GitHub Actions (workflow_dispatch) |
| **Prod** | Production environment | GCP Cloud Run (Mumbai) | GitHub Actions (with approval) |

---

## Prerequisites

### For All Environments

- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/) (20.10+)
- [Docker Compose](https://docs.docker.com/compose/) (v2.0+)

### For Cloud Deployments (Dev/Prod)

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (gcloud CLI)
- GCP Project: `synapse-473918`
- Required GCP secrets configured in Secret Manager
- GitHub repository access with deployment permissions

### Required GCP Secrets

These must be configured in Google Cloud Secret Manager:

```bash
# Backend secrets
backend-secret-key:latest          # Django-style secret key
openai-api-key:latest              # OpenAI API key
database-url-dev:latest            # Development database URL
database-url-prod:latest           # Production database URL

# GitHub Actions
GCP_SA_KEY                         # Service account key (GitHub secret)
```

---

## 1. Local Development with Hot Reload

### Quick Start

```bash
# Clone repository
git clone <repository-url>
cd synapse

# Run development environment
./scripts/dev-local.sh
```

### What It Does

The `dev-local.sh` script automatically:

1. ✅ Checks Docker and Docker Compose installation
2. ✅ Creates development Docker Compose configuration
3. ✅ Stops any existing containers
4. ✅ Starts services with hot reload:
   - PostgreSQL with pgvector
   - Backend (FastAPI with auto-reload)
   - Redis (for caching)
   - Frontend (Vite dev server)
5. ✅ Displays service URLs and access information

### Services

| Service | URL | Hot Reload |
|---------|-----|------------|
| Frontend | http://localhost:5173 | ✓ Yes (Vite) |
| Backend | http://localhost:8000 | ✓ Yes (uvicorn --reload) |
| API Docs | http://localhost:8000/docs | ✓ Auto-updates |
| Database | localhost:5432 | - |
| Redis | localhost:6379 | - |

### Hot Reload Details

**Frontend (Vite):**
- Edit files in `frontend/src/`
- Changes reflect instantly in browser
- No page refresh needed for most changes

**Backend (uvicorn):**
- Edit files in `backend/app/`
- Server auto-reloads on file changes
- Typically takes 1-2 seconds

### Development Commands

```bash
# View all logs
docker compose -f docker-compose.dev.yml logs -f

# View backend logs only
docker logs synapse-backend-dev -f

# View frontend logs
tail -f logs/frontend-dev.log

# Access database
docker exec -it synapse-postgres-dev psql -U synapse -d synapse_local

# Access Redis CLI
docker exec -it synapse-redis-dev redis-cli

# Restart a service
docker compose -f docker-compose.dev.yml restart backend

# Rebuild after dependency changes
docker compose -f docker-compose.dev.yml up -d --build

# Stop all services
docker compose -f docker-compose.dev.yml down

# Stop all services and remove volumes (clean slate)
docker compose -f docker-compose.dev.yml down -v
```

### Environment Variables

Local environment uses `backend/.env.local`:

```bash
ENVIRONMENT=local
DATABASE_URL=postgresql+asyncpg://synapse:localdev123@localhost:5432/synapse_local
STORAGE_BACKEND=local
LOCAL_STORAGE_PATH=./storage
LOG_LEVEL=DEBUG
```

### Testing Mobile Features Locally

1. **Option 1: Browser DevTools**
   ```bash
   # Open http://localhost:5173/knowledge
   # Press F12 → Toggle Device Toolbar
   # Select mobile device (iPhone 14, Pixel 7, etc.)
   ```

2. **Option 2: Real Mobile Device**
   ```bash
   # Get your computer's IP
   ipconfig getifaddr en0  # Mac
   hostname -I | awk '{print $1}'  # Linux

   # On mobile browser (same WiFi):
   http://YOUR_IP:5173/knowledge
   ```

3. **Option 3: ngrok (Remote Testing)**
   ```bash
   ngrok http 5173
   # Use provided HTTPS URL
   ```

---

## 2. Deploy to Development (Cloud)

Development environment on GCP Cloud Run for cloud testing.

### Prerequisites

1. **GitHub Repository Setup**
   - Repository: `https://github.com/your-org/synapse`
   - Branch: `dev`

2. **GitHub Secrets** (Settings → Secrets → Actions)
   ```
   GCP_SA_KEY = <service-account-key-json>
   ```

3. **GCP Resources** (already configured)
   - Cloud Run services: `synapse-backend-dev`, `synapse-frontend-dev`
   - Cloud SQL: `synapse:asia-south1:synapse`
   - GCS Bucket: `synapse_storage`

### Deployment Steps

1. **Push changes to `dev` branch**
   ```bash
   git checkout dev
   git add .
   git commit -m "Your changes"
   git push origin dev
   ```

2. **Trigger Deployment**
   - Go to GitHub → Actions → "Deploy to Development"
   - Click "Run workflow"
   - Select options:
     - ✅ Deploy Backend
     - ✅ Deploy Frontend
   - Click "Run workflow"

3. **Monitor Deployment**
   - Watch workflow progress in GitHub Actions
   - Typical deployment time: 5-8 minutes

4. **Verify Deployment**
   ```bash
   # Get URLs from workflow output
   # Test backend
   curl https://synapse-backend-dev-XXXXX-el.a.run.app/health

   # Test frontend
   curl https://synapse-frontend-dev-XXXXX-el.a.run.app
   ```

### Development Environment Specs

```yaml
Backend:
  Image: gcr.io/synapse-473918/synapse-backend:dev
  CPU: 1 vCPU
  Memory: 512 MiB
  Min Instances: 0  # Scales to zero
  Max Instances: 5
  Model: gpt-4.1-mini (cost-optimized)
  Storage: GCS (dev folder)

Frontend:
  Image: gcr.io/synapse-473918/synapse-frontend:dev
  CPU: 1 vCPU
  Memory: 256 MiB
  Min Instances: 0
  Max Instances: 3
```

### Cost Optimization (Dev)

- Min instances: 0 (scales to zero when idle)
- Reduced memory and CPU
- Cost-effective AI model (gpt-4.1-mini)
- Shared Cloud SQL instance

### Manual Deployment (Alternative)

```bash
# Authenticate
gcloud auth login
gcloud config set project synapse-473918

# Deploy backend
cd backend
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions _ENV=dev

# Deploy frontend
cd ../frontend
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions _ENV=dev,_BACKEND_URL=<backend-url>
```

---

## 3. Deploy to Production (Cloud)

Production deployment with manual approval and enhanced monitoring.

### Prerequisites

1. **GitHub Environment Setup**
   - Go to GitHub → Settings → Environments
   - Create environment: `production-approval`
   - Add required reviewers (recommended: 2+ approvers)
   - Save protection rules

2. **Production Branch**
   ```bash
   # Merge dev to prod
   git checkout prod
   git merge dev
   git push origin prod
   ```

### Deployment Steps

1. **Trigger Production Deployment**
   - Go to GitHub → Actions → "Deploy to Production"
   - Click "Run workflow"
   - Select branch: `prod`
   - Options:
     - ✅ Deploy Backend
     - ✅ Deploy Frontend
     - ⬜ Skip approval (keep unchecked)
   - Click "Run workflow"

2. **Review and Approve**
   - Workflow will pause for manual approval
   - Reviewers receive notification
   - Review deployment details:
     - Commit SHA
     - Changed files
     - Test results
   - Approve or reject

3. **Automatic Deployment Process**
   - Pre-deployment checks
   - Build and push images
   - Deploy with 0% traffic
   - Run health checks
   - Gradually shift traffic to 100%
   - Post-deployment tests
   - Send summary

4. **Verify Production**
   ```bash
   # Test backend
   curl https://synapse-backend-prod-XXXXX-el.a.run.app/health

   # Test frontend
   curl https://synapse-frontend-prod-XXXXX-el.a.run.app

   # Test API
   curl https://synapse-backend-prod-XXXXX-el.a.run.app/api/v1/health
   ```

### Production Environment Specs

```yaml
Backend:
  Image: gcr.io/synapse-473918/synapse-backend:prod
  CPU: 2 vCPU
  Memory: 1 GiB
  Min Instances: 1  # Always warm
  Max Instances: 10
  Model: gpt-4o-mini (production quality)
  Storage: GCS (prod folder)
  Rate Limit: 120 req/min

Frontend:
  Image: gcr.io/synapse-473918/synapse-frontend:prod
  CPU: 1 vCPU
  Memory: 512 MiB
  Min Instances: 1
  Max Instances: 5
```

### Production Features

- ✅ Manual approval required
- ✅ Blue-green deployment (0% → 100% traffic shift)
- ✅ Automatic rollback on health check failure
- ✅ Enhanced monitoring and logging
- ✅ Timestamped image tags for rollback
- ✅ Post-deployment integration tests

---

## Environment Comparison

| Feature | Local | Dev (Cloud) | Prod (Cloud) |
|---------|-------|-------------|--------------|
| **Deployment** | Script | GitHub Actions | GitHub Actions |
| **Approval** | None | None | Required (2+ reviewers) |
| **Hot Reload** | ✓ Yes | ✗ No | ✗ No |
| **Min Instances** | N/A | 0 (scales to zero) | 1 (always warm) |
| **Max Instances** | N/A | 5 | 10 |
| **Backend Memory** | Unlimited | 512 MiB | 1 GiB |
| **Backend CPU** | Unlimited | 1 vCPU | 2 vCPU |
| **AI Model** | gpt-4.1-mini | gpt-4.1-mini | gpt-4o-mini |
| **Storage** | Local filesystem | GCS (dev/) | GCS (prod/) |
| **Database** | Local PostgreSQL | Cloud SQL | Cloud SQL |
| **Logging** | DEBUG | INFO | WARNING |
| **Rate Limit** | 60/min | 60/min | 120/min |
| **Cost** | $0 | ~$20-40/month | ~$100-200/month |

---

## Rollback Procedures

### Automatic Rollback

Production deployments automatically rollback on:
- Health check failures
- Deployment errors
- Post-deployment test failures

### Manual Rollback

#### Option 1: GitHub Workflow (Re-deploy previous version)

```bash
# 1. Find previous commit
git log --oneline -10

# 2. Checkout previous commit
git checkout <previous-sha>

# 3. Trigger deployment workflow
# (Use GitHub Actions UI)
```

#### Option 2: gcloud CLI

```bash
# List revisions
gcloud run revisions list \
  --service synapse-backend-prod \
  --region asia-south1

# Rollback to specific revision
gcloud run services update-traffic synapse-backend-prod \
  --region asia-south1 \
  --to-revisions <revision-name>=100
```

#### Option 3: Use Rollback Script

```bash
./scripts/rollback.sh prod backend <image-tag>
```

### Find Rollback Image

From deployment summary in GitHub Actions:
```
Rollback: gcr.io/synapse-473918/synapse-backend:prod-20250104-143022
```

---

## Troubleshooting

### Local Development

**Problem: Frontend not hot-reloading**
```bash
# Kill existing Vite process
pkill -f vite

# Restart manually
cd frontend
npm run dev
```

**Problem: Backend not reloading**
```bash
# Check if watchdog is installed
docker exec synapse-backend-dev pip list | grep watchdog

# Restart backend
docker compose -f docker-compose.dev.yml restart backend
```

**Problem: Database connection failed**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs synapse-postgres-dev

# Reset database
docker compose -f docker-compose.dev.yml down -v
./scripts/dev-local.sh
```

### Cloud Deployments

**Problem: Workflow fails with authentication error**
```bash
# Verify GCP_SA_KEY secret is set correctly
# Check service account has required permissions:
- Cloud Run Admin
- Cloud SQL Client
- Storage Admin
- Secret Manager Secret Accessor
```

**Problem: Backend health check fails**
```bash
# Check Cloud SQL connection
gcloud sql instances describe synapse --format="value(state)"

# Check secrets
gcloud secrets versions list backend-secret-key
gcloud secrets versions list database-url-dev

# View logs
gcloud run services logs read synapse-backend-dev --region asia-south1 --limit 50
```

**Problem: Frontend can't connect to backend**
```bash
# Verify CORS settings in backend
# Check backend URL is correct in frontend build
# View frontend environment in Cloud Run console
```

**Problem: Deployment stuck at traffic shifting**
```bash
# Check revision health
gcloud run revisions list --service synapse-backend-dev --region asia-south1

# Force traffic shift
gcloud run services update-traffic synapse-backend-dev \
  --region asia-south1 \
  --to-latest
```

### Mobile Features

**Problem: Swipe gestures not working**
- Ensure using actual touch device or touch emulation in DevTools
- Check browser console for JavaScript errors
- Verify components loaded correctly

**Problem: Pull-to-refresh interferes with scroll**
- This is expected behavior at top of page
- Scroll down slightly before scrolling up

---

## Monitoring and Logs

### Local

```bash
# All services
docker compose -f docker-compose.dev.yml logs -f

# Specific service
docker logs synapse-backend-dev -f
```

### Cloud (Dev/Prod)

```bash
# Cloud Run logs
gcloud run services logs read synapse-backend-dev \
  --region asia-south1 \
  --limit 100 \
  --format json

# Cloud Build logs
gcloud builds list --limit 10
gcloud builds log <build-id>

# Real-time logs
gcloud run services logs tail synapse-backend-dev --region asia-south1
```

### GCP Console

- Cloud Run: https://console.cloud.google.com/run?project=synapse-473918
- Cloud Build: https://console.cloud.google.com/cloud-build?project=synapse-473918
- Logs Explorer: https://console.cloud.google.com/logs?project=synapse-473918

---

## Security Checklist

- [ ] All secrets stored in GCP Secret Manager (not in code)
- [ ] Service account has minimum required permissions
- [ ] Production requires manual approval
- [ ] CORS configured correctly for production domains
- [ ] Rate limiting enabled
- [ ] Database has restricted access (Cloud SQL with private IP)
- [ ] HTTPS enforced for all Cloud Run services
- [ ] `.env` files in `.gitignore`

---

## Quick Reference

### One-Line Deployments

```bash
# Local development
./scripts/dev-local.sh

# Dev (manual)
gcloud builds submit --config backend/cloudbuild.yaml --substitutions _ENV=dev

# Prod (use GitHub Actions for safety)
```

### Important URLs

- GitHub Actions: `https://github.com/your-org/synapse/actions`
- GCP Project: `https://console.cloud.google.com/home/dashboard?project=synapse-473918`
- Cloud Run Services: `https://console.cloud.google.com/run?project=synapse-473918`

---

## Support

For deployment issues:
1. Check this documentation
2. Review GitHub Actions logs
3. Check GCP Cloud Logging
4. Contact DevOps team

Last Updated: 2025-01-05
