# GitHub Actions Deployment Permissions Fix

## Problem
GitHub Actions workflow was failing with permission errors when trying to push Docker images to Google Container Registry.

**Error**: `denied: Permission 'artifactregistry.repositories.uploadArtifacts' denied`

## Solution
Granted the following IAM roles to the `synapse-backend@synapse-473918.iam.gserviceaccount.com` service account:

### Permissions Granted
1. ✅ `roles/storage.admin` - For Google Container Registry (GCR) and Cloud Storage access
2. ✅ `roles/artifactregistry.writer` - For container image metadata and artifact registry
3. ✅ `roles/run.developer` - For deploying Cloud Run services
4. ✅ `roles/iam.serviceAccountUser` - For using service accounts in Cloud Run deployments

### Complete Permission Set
The service account now has all required permissions:
- `roles/artifactregistry.writer` - Push container images
- `roles/cloudsql.client` - Access Cloud SQL database
- `roles/iam.serviceAccountUser` - Use service accounts
- `roles/run.developer` - Deploy Cloud Run services
- `roles/secretmanager.secretAccessor` - Access secrets
- `roles/storage.admin` - Access GCS and GCR
- `roles/storage.objectAdmin` - Manage storage objects

## How to Test Deployment

### Option 1: GitHub UI (Recommended)
1. Go to https://github.com/YOUR_USERNAME/synapse/actions
2. Click on "Deploy to Development (GCP Cloud Run)" workflow
3. Click the "Run workflow" button (top right)
4. Select branch: `dev`
5. Keep both options checked:
   - ✅ Deploy Backend
   - ✅ Deploy Frontend
6. Click "Run workflow"

### Option 2: Git Push (Automatic)
The workflow can also be triggered by pushing commits to the `dev` branch:

```bash
# Make a small change to trigger deployment
git add .
git commit -m "test: Trigger deployment with fixed permissions"
git push origin dev
```

## Expected Results
✅ Authentication succeeds with GCP_SA_KEY
✅ Docker images build successfully
✅ Docker push to gcr.io succeeds (no permission errors)
✅ Backend deploys to Cloud Run
✅ Frontend deploys to Cloud Run
✅ Health checks pass

## Deployment URLs
After successful deployment:
- **Backend**: https://synapse-backend-dev-XXXXXXXXXX-el.a.run.app
- **Frontend**: https://synapse-frontend-dev-XXXXXXXXXX-el.a.run.app
- **API Docs**: https://synapse-backend-dev-XXXXXXXXXX-el.a.run.app/docs

## Commands Used
```bash
# Grant storage admin role
gcloud projects add-iam-policy-binding synapse-473918 \
  --member='serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com' \
  --role='roles/storage.admin'

# Grant artifact registry writer role
gcloud projects add-iam-policy-binding synapse-473918 \
  --member='serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com' \
  --role='roles/artifactregistry.writer'

# Grant Cloud Run developer role
gcloud projects add-iam-policy-binding synapse-473918 \
  --member='serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com' \
  --role='roles/run.developer'

# Grant service account user role
gcloud projects add-iam-policy-binding synapse-473918 \
  --member='serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com' \
  --role='roles/iam.serviceAccountUser'
```

## Verification
To verify the service account has all required permissions:
```bash
gcloud projects get-iam-policy synapse-473918 \
  --flatten="bindings[].members" \
  --filter="bindings.members:synapse-backend@synapse-473918.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

## Next Steps
1. ✅ Permissions granted
2. 🔄 **Test deployment** (follow instructions above)
3. ⏳ Verify services are running
4. ⏳ Test application functionality

---

**Date**: 2025-10-05
**Status**: Permissions configured ✅ | Deployment pending test 🔄
