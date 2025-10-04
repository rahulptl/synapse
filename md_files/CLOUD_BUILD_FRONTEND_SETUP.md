# Cloud Build Setup for Frontend Deployment

This guide explains how to deploy the Synapse frontend to Cloud Run using Cloud Build.

## Prerequisites

1. Google Cloud SDK installed and authenticated
2. Cloud Build API enabled
3. Backend already deployed to Cloud Run (you need the backend URL)

## Configuration Files

- `frontend/cloudbuild.yaml` - Main Cloud Build configuration
- `frontend/cloudbuild-dev.yaml` - Development environment substitutions
- `frontend/cloudbuild-prod.yaml` - Production environment substitutions

## Quick Start

### 1. Update Backend URL

Before deploying, update the backend URL in the appropriate environment file:

**For Development:**
```bash
# Edit frontend/cloudbuild-dev.yaml
# Replace XXXXXXXXXX with your actual backend Cloud Run service hash
_BACKEND_URL: 'https://synapse-backend-dev-XXXXXXXXXX-el.a.run.app'
```

**For Production:**
```bash
# Edit frontend/cloudbuild-prod.yaml
# Replace XXXXXXXXXX with your actual backend Cloud Run service hash
_BACKEND_URL: 'https://synapse-backend-prod-XXXXXXXXXX-el.a.run.app'
```

### 2. Manual Deployment

#### Deploy to Development
```bash
gcloud builds submit \
  --config=frontend/cloudbuild.yaml \
  --substitutions=_ENV=dev,_REGION=asia-south1,_BACKEND_URL=https://YOUR-BACKEND-URL.run.app
```

#### Deploy to Production
```bash
gcloud builds submit \
  --config=frontend/cloudbuild.yaml \
  --substitutions=_ENV=prod,_REGION=asia-south1,_BACKEND_URL=https://YOUR-BACKEND-URL.run.app
```

### 3. Set Up Cloud Build Trigger (Automated)

#### Create Development Trigger
```bash
gcloud builds triggers create github \
  --name="synapse-frontend-dev-deploy" \
  --repo-name="synapse" \
  --repo-owner="rahulptl" \
  --branch-pattern="^main$" \
  --build-config="frontend/cloudbuild.yaml" \
  --included-files="frontend/**" \
  --substitutions="_ENV=dev,_REGION=asia-south1,_BACKEND_URL=https://YOUR-BACKEND-DEV-URL.run.app"
```

#### Create Production Trigger (Manual Approval)
```bash
gcloud builds triggers create github \
  --name="synapse-frontend-prod-deploy" \
  --repo-name="synapse" \
  --repo-owner="rahulptl" \
  --tag-pattern="^v.*" \
  --build-config="frontend/cloudbuild.yaml" \
  --substitutions="_ENV=prod,_REGION=asia-south1,_BACKEND_URL=https://YOUR-BACKEND-PROD-URL.run.app"
```

## How It Works

### Build Process

1. **Build Docker Image**
   - Uses multi-stage Dockerfile
   - Stage 1: Builds Vite app with `VITE_BACKEND_API_URL` baked in
   - Stage 2: Serves static files with nginx

2. **Push to Container Registry**
   - Three tags: `$COMMIT_SHA`, `$_ENV` (dev/prod), and `latest`
   - Allows rollback to specific commits

3. **Deploy to Cloud Run**
   - Service name: `synapse-frontend-{dev|prod}`
   - Region: `asia-south1` (Mumbai)
   - Public access (unauthenticated)
   - Auto-scaling: 0-10 instances

### Environment Variables

The `VITE_BACKEND_API_URL` is passed as a **build argument** during Docker build:

```dockerfile
ARG VITE_BACKEND_API_URL
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL
```

This gets baked into the JavaScript bundle at build time, so the frontend knows where to call the backend API.

## Customization

### Change Region
Update the `_REGION` substitution:
```bash
--substitutions=_REGION=us-central1
```

### Change Resource Limits
Edit `frontend/cloudbuild.yaml`:
```yaml
- '--memory'
- '1Gi'  # Increase memory
- '--cpu'
- '2'    # Increase CPU
- '--max-instances'
- '20'   # Increase max scaling
```

## Troubleshooting

### Build Fails with "VITE_BACKEND_API_URL undefined"
Make sure you're passing the substitution:
```bash
--substitutions=_BACKEND_URL=https://your-backend.run.app
```

### Nginx Fails to Start
Check that:
1. nginx.conf is valid (no proxy to non-existent backends)
2. Port 8080 is exposed in Dockerfile
3. nginx.conf listens on port 8080

### Frontend Can't Connect to Backend
1. Check browser console for CORS errors
2. Verify backend URL is correct in build logs
3. Ensure backend has CORS configured for frontend origin

## Deployment URLs

After deployment, your services will be available at:

- **Development**: `https://synapse-frontend-dev-XXXXXXXXXX-el.a.run.app`
- **Production**: `https://synapse-frontend-prod-XXXXXXXXXX-el.a.run.app`

## Cost Optimization

The configuration uses:
- **Min instances**: 0 (scales to zero when not in use)
- **Max instances**: 10 (prevents runaway costs)
- **Memory**: 512Mi (sufficient for nginx serving static files)
- **CPU**: 1 (adequate for static file serving)

For production with consistent traffic, consider setting `--min-instances=1` to avoid cold starts.
