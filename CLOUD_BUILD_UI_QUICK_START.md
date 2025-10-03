# Cloud Build UI - Quick Start Checklist

## ✅ Pre-Deployment Checklist

### 1. Files to Commit
```bash
git add Dockerfile.backend
git add cloudbuild-dev.yaml
git add cloudbuild-prod.yaml
git commit -m "Add Cloud Build CI/CD configuration"
git push origin develop
```

### 2. Enable APIs
```bash
gcloud services enable cloudbuild.googleapis.com
```

### 3. Grant Permissions
```bash
PROJECT_NUMBER=$(gcloud projects describe synapse-473918 --format="value(projectNumber)")

# Cloud Run Admin
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

# Service Account User
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Secret Manager Access
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 📋 Cloud Build UI Configuration

### Go to: https://console.cloud.google.com/cloud-build/triggers

---

## Development Trigger Setup

Click **"CREATE TRIGGER"**

| Field | Value |
|-------|-------|
| **Name** | `deploy-backend-dev` |
| **Description** | `Deploy backend to development environment` |
| **Event** | Push to a branch |
| **Source Repository** | Connect to GitHub → Select `synapse` |
| **Branch** | `^develop$` |
| **Build Configuration** | Cloud Build configuration file (yaml or json) |
| **Cloud Build config location** | `/cloudbuild-dev.yaml` |

Click **CREATE**

---

## Production Trigger Setup

Click **"CREATE TRIGGER"**

| Field | Value |
|-------|-------|
| **Name** | `deploy-backend-prod` |
| **Description** | `Deploy backend to production environment` |
| **Event** | Push to a branch |
| **Source Repository** | `synapse` (already connected) |
| **Branch** | `^main$` |
| **Build Configuration** | Cloud Build configuration file (yaml or json) |
| **Cloud Build config location** | `/cloudbuild-prod.yaml` |

Click **CREATE**

---

## 🔒 Secure Database Password Setup

**IMPORTANT**: Don't hardcode passwords in `cloudbuild-*.yaml` files!

### Create Database URL Secrets

```bash
# Development
echo -n "postgresql+asyncpg://dev_user:YOUR_ACTUAL_DEV_PASSWORD@/dev" | \
  gcloud secrets create dev-database-url --data-file=-

# Production
echo -n "postgresql+asyncpg://prod_user:YOUR_ACTUAL_PROD_PASSWORD@/prod" | \
  gcloud secrets create prod-database-url --data-file=-
```

### Update Build Files

Edit both `cloudbuild-dev.yaml` and `cloudbuild-prod.yaml`:

**Find this line:**
```yaml
- '--set-env-vars=...,DATABASE_URL=postgresql+asyncpg://dev_user:YOUR_PASSWORD@/dev,...'
```

**Change the `--set-secrets` line to:**
```yaml
- '--set-secrets=SECRET_KEY=dev-secret-key:latest,OPENAI_API_KEY=dev-openai-key:latest,DATABASE_URL=dev-database-url:latest'
```

And **remove** `DATABASE_URL` from `--set-env-vars`.

---

## 🚀 Test Your Setup

### 1. Push to Develop Branch
```bash
git checkout develop
git push origin develop
```

### 2. Monitor Build
Go to: https://console.cloud.google.com/cloud-build/builds

You should see a build start automatically!

### 3. Check Deployment
```bash
# Get service URL
gcloud run services describe synapse-backend-dev \
  --region asia-south1 \
  --format="value(status.url)"

# Test health endpoint
curl $(gcloud run services describe synapse-backend-dev --region asia-south1 --format="value(status.url)")/health
```

---

## 📊 What Happens on Each Push?

```
Git Push → GitHub → Cloud Build Trigger
                           ↓
                    Build Docker Image
                           ↓
                    Push to GCR
                           ↓
                    Deploy to Cloud Run
                           ↓
                    ✅ Live!
```

**Timeline:**
- Build: ~3-5 minutes
- Deploy: ~1 minute
- **Total: ~5 minutes** from push to live

---

## 🔍 Viewing Build Logs

### In Cloud Console
1. Go to **Cloud Build** → **History**
2. Click on a build
3. View real-time logs

### Via CLI
```bash
# List recent builds
gcloud builds list --limit 5

# View specific build
gcloud builds log BUILD_ID
```

---

## 🐛 Common Issues

### Build fails: "Permission denied to deploy"
**Fix**: Run the permission commands in step 3 above

### Build succeeds but service fails to start
**Fix**: Check Cloud Run logs:
```bash
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 10
```

### Trigger doesn't fire on push
**Fix**:
1. Check branch name matches pattern exactly
2. Verify GitHub App is connected
3. Check trigger is enabled (not paused)

---

## 📝 Quick Commands

```bash
# Manually trigger a build
gcloud builds triggers run deploy-backend-dev --branch=develop

# List all triggers
gcloud builds triggers list

# Pause a trigger
gcloud builds triggers update deploy-backend-dev --disabled

# Resume a trigger
gcloud builds triggers update deploy-backend-dev --no-disabled

# Delete a trigger
gcloud builds triggers delete deploy-backend-dev
```

---

## ✨ Success Checklist

After setup, verify:

- [ ] Development trigger created
- [ ] Production trigger created
- [ ] Permissions granted to Cloud Build SA
- [ ] Database passwords in Secret Manager
- [ ] Push to develop triggers build
- [ ] Build completes successfully
- [ ] Service deploys to Cloud Run
- [ ] Health endpoint returns 200 OK
- [ ] API docs accessible at `/docs`

---

## 🎯 Next: Deploy Frontend

Once backend is working, set up frontend deployment:
1. Create `Dockerfile.frontend` at repository root
2. Create `cloudbuild-frontend-dev.yaml`
3. Create `cloudbuild-frontend-prod.yaml`
4. Frontend needs backend URL at build time

Would you like me to create the frontend Cloud Build setup next?
