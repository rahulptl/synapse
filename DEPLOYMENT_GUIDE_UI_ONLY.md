# Complete Deployment Guide - UI Only (No CLI Commands)

This guide walks you through deploying your Synapse backend to Google Cloud Run using **only the web UI**. No terminal commands required!

**Branches:**
- `dev` → deploys to `synapse-backend-dev`
- `prod` → deploys to `synapse-backend-prod`

---

## 📋 Prerequisites

- [ ] Google Cloud account
- [ ] Project created: `synapse-473918`
- [ ] GitHub repository with your code
- [ ] Code committed to `dev` and `prod` branches

---

## Part 1: Enable APIs (5 minutes)

### Step 1: Enable Cloud Run API

1. Go to: **https://console.cloud.google.com/apis/library/run.googleapis.com?project=synapse-473918**
2. Click **"ENABLE"**
3. Wait ~30 seconds for activation

### Step 2: Enable Cloud Build API

1. Go to: **https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=synapse-473918**
2. Click **"ENABLE"**
3. Wait ~30 seconds for activation

### Step 3: Enable Secret Manager API

1. Go to: **https://console.cloud.google.com/apis/library/secretmanager.googleapis.com?project=synapse-473918**
2. Click **"ENABLE"**
3. Wait ~30 seconds for activation

### Step 4: Enable Container Registry API

1. Go to: **https://console.cloud.google.com/apis/library/containerregistry.googleapis.com?project=synapse-473918**
2. Click **"ENABLE"**
3. Wait ~30 seconds for activation

### Step 5: Enable Cloud SQL Admin API

1. Go to: **https://console.cloud.google.com/apis/library/sqladmin.googleapis.com?project=synapse-473918**
2. Click **"ENABLE"**
3. Wait ~30 seconds for activation

---

## Part 2: Create Secrets (10 minutes)

### Step 1: Open Secret Manager

1. Go to: **https://console.cloud.google.com/security/secret-manager?project=synapse-473918**
2. Click **"CREATE SECRET"**

### Step 2: Create Development Secret Key

1. **Name**: `dev-secret-key`
2. **Secret value**: Enter a strong secret key (minimum 32 characters)
   - Example: `dev_secret_key_12345678901234567890123456`
3. **Regions**: Select **"asia-south1 (Mumbai)"**
4. Click **"CREATE SECRET"**

### Step 3: Create Development OpenAI Key

1. Click **"CREATE SECRET"** again
2. **Name**: `dev-openai-key`
3. **Secret value**: Your OpenAI API key (starts with `sk-`)
4. **Regions**: Select **"asia-south1 (Mumbai)"**
5. Click **"CREATE SECRET"**

### Step 4: Create Development Database URL

1. Click **"CREATE SECRET"** again
2. **Name**: `dev-database-url`
3. **Secret value**: `postgresql+asyncpg://dev_user:YOUR_DEV_PASSWORD@/dev`
   - Replace `YOUR_DEV_PASSWORD` with your actual dev database password
4. **Regions**: Select **"asia-south1 (Mumbai)"**
5. Click **"CREATE SECRET"**

### Step 5: Create Production Secrets (Same Process)

Repeat the above for production:

| Secret Name | Value |
|-------------|-------|
| `prod-secret-key` | Different secret key for production |
| `prod-openai-key` | Your OpenAI API key |
| `prod-database-url` | `postgresql+asyncpg://prod_user:YOUR_PROD_PASSWORD@/prod` |

**Total secrets created: 6** ✅

---

## Part 3: Grant Permissions to Cloud Build (10 minutes)

### Step 1: Find Your Project Number

1. Go to: **https://console.cloud.google.com/home/dashboard?project=synapse-473918**
2. Look for **"Project info"** card
3. Note down your **Project number** (example: `123456789012`)

### Step 2: Open IAM Permissions

1. Go to: **https://console.cloud.google.com/iam-admin/iam?project=synapse-473918**
2. You'll see a list of members and their roles

### Step 3: Grant Cloud Run Admin to Cloud Build

1. Click **"GRANT ACCESS"** button
2. **New principals**: Enter `[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`
   - Replace `[PROJECT_NUMBER]` with your actual project number
   - Example: `123456789012@cloudbuild.gserviceaccount.com`
3. **Select a role**: Start typing "Cloud Run Admin"
   - Select **"Cloud Run Admin"**
4. Click **"SAVE"**

### Step 4: Grant Service Account User Role

1. Click **"GRANT ACCESS"** again
2. **New principals**: Same as above (`[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`)
3. **Select a role**: Start typing "Service Account User"
   - Select **"Service Account User"**
4. Click **"SAVE"**

### Step 5: Grant Secret Manager Access

1. Click **"GRANT ACCESS"** again
2. **New principals**: Same as above (`[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`)
3. **Select a role**: Start typing "Secret Manager Secret Accessor"
   - Select **"Secret Manager Secret Accessor"**
4. Click **"SAVE"**

**You should now see the Cloud Build service account with 3 roles** ✅

---

## Part 4: Grant Permissions to Compute Service Account (10 minutes)

The Compute Engine service account is what Cloud Run uses to access resources.

### Step 1: Grant Cloud SQL Client

1. Still in IAM page: **https://console.cloud.google.com/iam-admin/iam?project=synapse-473918**
2. Click **"GRANT ACCESS"**
3. **New principals**: `[PROJECT_NUMBER]-compute@developer.gserviceaccount.com`
   - Example: `123456789012-compute@developer.gserviceaccount.com`
4. **Select a role**: "Cloud SQL Client"
5. Click **"SAVE"**

### Step 2: Grant Storage Object Admin

1. Click **"GRANT ACCESS"** again
2. **New principals**: Same as above (`[PROJECT_NUMBER]-compute@developer.gserviceaccount.com`)
3. **Select a role**: "Storage Object Admin"
4. Click **"SAVE"**

### Step 3: Grant Secret Manager Access

1. Click **"GRANT ACCESS"** again
2. **New principals**: Same as above (`[PROJECT_NUMBER]-compute@developer.gserviceaccount.com`)
3. **Select a role**: "Secret Manager Secret Accessor"
4. Click **"SAVE"**

**You should now see the Compute Engine service account with 3 roles** ✅

---

## Part 5: Connect GitHub Repository (5 minutes)

### Step 1: Open Cloud Build Triggers

1. Go to: **https://console.cloud.google.com/cloud-build/triggers?project=synapse-473918**
2. Click **"CONNECT REPOSITORY"**

### Step 2: Select GitHub

1. Select source: **"GitHub (Cloud Build GitHub App)"**
2. Click **"CONTINUE"**

### Step 3: Authenticate

1. You'll be redirected to GitHub
2. Click **"Authorize Google Cloud Build"**
3. Select your GitHub account

### Step 4: Select Repository

1. Select your repository: **"synapse"** (or whatever it's named)
2. Check the box: **"I understand that Google Cloud..."**
3. Click **"CONNECT"**

### Step 5: Skip Trigger Creation

1. Click **"DONE"** (we'll create triggers in the next step)

**Repository connected!** ✅

---

## Part 6: Create Development Trigger (5 minutes)

### Step 1: Create New Trigger

1. Still in Cloud Build Triggers page
2. Click **"CREATE TRIGGER"**

### Step 2: Configure Trigger

| Field | Value |
|-------|-------|
| **Name** | `deploy-backend-dev` |
| **Description** | `Auto-deploy backend to development on dev branch` |
| **Event** | Push to a branch |
| **Source** | (should show your connected repository) |
| **Branch** | `^dev$` |

**⚠️ Important**: Use `^dev$` exactly (with the `^` and `$` symbols)

After entering, you should see: **"Matches the branch: dev"** ✅

### Step 3: Build Configuration

| Field | Value |
|-------|-------|
| **Configuration** | Cloud Build configuration file (yaml or json) |
| **Location** | Repository |
| **Cloud Build configuration file location** | `/cloudbuild-dev.yaml` |

### Step 4: Service Account (Advanced)

1. Expand **"SHOW ADVANCED"** or **"Advanced"** section
2. **Service account**: Leave as default (Cloud Build service account)

### Step 5: Create

1. Click **"CREATE"**
2. Wait for confirmation

**Development trigger created!** ✅

---

## Part 7: Create Production Trigger (5 minutes)

### Step 1: Create New Trigger

1. Click **"CREATE TRIGGER"** again

### Step 2: Configure Trigger

| Field | Value |
|-------|-------|
| **Name** | `deploy-backend-prod` |
| **Description** | `Auto-deploy backend to production on prod branch` |
| **Event** | Push to a branch |
| **Source** | (should show your connected repository) |
| **Branch** | `^prod$` |

After entering, you should see: **"Matches the branch: prod"** ✅

### Step 3: Build Configuration

| Field | Value |
|-------|-------|
| **Configuration** | Cloud Build configuration file (yaml or json) |
| **Location** | Repository |
| **Cloud Build configuration file location** | `/cloudbuild-prod.yaml` |

### Step 4: Create

1. Click **"CREATE"**

**Production trigger created!** ✅

---

## Part 8: Push Code and Deploy (5 minutes)

### Step 1: Make Sure Files Are in Your Repository

These files should be in your repository:
- ✅ `Dockerfile.backend`
- ✅ `cloudbuild-dev.yaml`
- ✅ `cloudbuild-prod.yaml`

If not, commit and push them from your local machine.

### Step 2: Push to Dev Branch

From your local machine (or GitHub web UI):

```bash
# Make sure you're on dev branch
git checkout dev

# Or create it if it doesn't exist
git checkout -b dev

# Push to trigger deployment
git push origin dev
```

### Step 3: Monitor Build

1. Go to: **https://console.cloud.google.com/cloud-build/builds?project=synapse-473918**
2. You should see a build starting automatically
3. Click on it to see real-time logs
4. Wait ~5-8 minutes for first build (subsequent builds: ~3-4 minutes)

### Step 4: Verify Deployment

1. Once build completes, go to: **https://console.cloud.google.com/run?project=synapse-473918**
2. You should see **"synapse-backend-dev"** service
3. Click on it
4. Copy the **URL** (looks like: `https://synapse-backend-dev-XXXXX-el.a.run.app`)
5. Open in browser and add `/health`: `https://synapse-backend-dev-XXXXX-el.a.run.app/health`
6. Should see: `{"status":"healthy"}`

**Development deployment successful!** 🎉

---

## Part 9: Viewing and Managing Deployments (UI Only)

### View Cloud Run Services

**URL**: https://console.cloud.google.com/run?project=synapse-473918

Here you can:
- See all deployed services
- View service URLs
- Check resource usage
- View logs

### View Build History

**URL**: https://console.cloud.google.com/cloud-build/builds?project=synapse-473918

Here you can:
- See all builds (successful and failed)
- View build logs
- Re-run builds
- Cancel running builds

### View Logs

**URL**: https://console.cloud.google.com/logs/query?project=synapse-473918

1. Click **"Query"** dropdown
2. Select **"Cloud Run Revision"**
3. Select your service: `synapse-backend-dev`
4. View real-time logs

### View Secrets

**URL**: https://console.cloud.google.com/security/secret-manager?project=synapse-473918

Here you can:
- View all secrets (not values)
- Update secret versions
- Manage access permissions
- Delete secrets

---

## Part 10: Managing Environment Variables (UI)

If you need to change environment variables **without redeploying**:

### Step 1: Open Cloud Run Service

1. Go to: https://console.cloud.google.com/run?project=synapse-473918
2. Click on **"synapse-backend-dev"**

### Step 2: Edit and Deploy New Revision

1. Click **"EDIT & DEPLOY NEW REVISION"** at top
2. Go to **"VARIABLES & SECRETS"** tab

### Step 3: Update Variables

You can:
- Add new environment variables
- Edit existing variables
- Remove variables
- Update secret references

### Step 4: Deploy

1. Click **"DEPLOY"** at bottom
2. Wait ~1 minute for new revision

**Note**: Cloud Build deployments will overwrite these changes. For permanent changes, update `cloudbuild-dev.yaml`.

---

## Part 11: Updating Secret Values (UI)

### Step 1: Open Secret Manager

1. Go to: https://console.cloud.google.com/security/secret-manager?project=synapse-473918

### Step 2: Select Secret

1. Click on the secret you want to update (e.g., `dev-openai-key`)

### Step 3: Create New Version

1. Click **"NEW VERSION"**
2. **Secret value**: Enter new value
3. Click **"ADD NEW VERSION"**

### Step 4: Redeploy Service

Cloud Run services automatically use the `:latest` version of secrets, so:

1. Go to Cloud Build
2. Manually trigger a rebuild, OR
3. Push a new commit to trigger auto-deploy

---

## Part 12: Manual Trigger (Without Code Push)

If you want to deploy without pushing code:

### Step 1: Open Cloud Build Triggers

1. Go to: https://console.cloud.google.com/cloud-build/triggers?project=synapse-473918

### Step 2: Run Trigger

1. Find your trigger: `deploy-backend-dev`
2. Click the **⋮** (three dots) on the right
3. Click **"RUN"**
4. Select **branch**: `dev`
5. Click **"RUN TRIGGER"**

**Build starts immediately!**

---

## Part 13: Monitoring and Alerts (UI)

### Set Up Uptime Checks

1. Go to: **https://console.cloud.google.com/monitoring/uptime?project=synapse-473918**
2. Click **"CREATE UPTIME CHECK"**
3. **Title**: `Backend Dev Health Check`
4. **Protocol**: HTTPS
5. **Resource Type**: URL
6. **Hostname**: Your Cloud Run URL (without https://)
7. **Path**: `/health`
8. Click **"CREATE"**

### Set Up Alerting

1. In the uptime check, click **"CREATE ALERT"**
2. Configure email or SMS notifications
3. Save

**You'll be notified if your service goes down!**

---

## Part 14: Viewing Costs (UI)

### View Cloud Run Costs

1. Go to: **https://console.cloud.google.com/billing?project=synapse-473918**
2. Click **"Reports"**
3. Filter by **Service**: Cloud Run
4. See cost breakdown by day/month

### Expected Costs

**Development** (min instances: 0):
- ~$0-5/month (mostly scales to zero)

**Production** (min instances: 1):
- ~$30-50/month (always running)

---

## 🎯 Complete Setup Checklist

After completing this guide, verify:

- [ ] All 5 APIs enabled
- [ ] 6 secrets created in Secret Manager
- [ ] Cloud Build service account has 3 roles
- [ ] Compute Engine service account has 3 roles
- [ ] GitHub repository connected
- [ ] Development trigger created (`^dev$`)
- [ ] Production trigger created (`^prod$`)
- [ ] Code pushed to dev branch
- [ ] Build completed successfully
- [ ] Cloud Run service deployed
- [ ] Health endpoint returns 200 OK
- [ ] Logs visible in Cloud Logging
- [ ] Uptime check configured (optional)

---

## 🐛 Troubleshooting (UI Only)

### Build Fails with "Permission Denied"

**Fix via UI**:
1. Go to IAM: https://console.cloud.google.com/iam-admin/iam?project=synapse-473918
2. Find `[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`
3. Click **"EDIT"** (pencil icon)
4. Add missing roles: Cloud Run Admin, Service Account User

### Service Won't Start

**Check Logs via UI**:
1. Go to: https://console.cloud.google.com/run?project=synapse-473918
2. Click on service
3. Click **"LOGS"** tab
4. Look for errors (red lines)

Common issues:
- Database connection fails → check `dev-database-url` secret
- Secret not found → verify secret exists in Secret Manager
- Cloud SQL connection error → verify Cloud SQL instance is running

### Trigger Doesn't Fire

**Check via UI**:
1. Go to: https://console.cloud.google.com/cloud-build/triggers?project=synapse-473918
2. Click on trigger
3. Verify:
   - Branch pattern is `^dev$` or `^prod$`
   - Repository is connected
   - Trigger is not paused/disabled

### Can't Access Secrets

**Fix via UI**:
1. Go to: https://console.cloud.google.com/security/secret-manager?project=synapse-473918
2. Click on secret
3. Click **"PERMISSIONS"** tab
4. Click **"GRANT ACCESS"**
5. Add `[PROJECT_NUMBER]-compute@developer.gserviceaccount.com`
6. Role: **Secret Manager Secret Accessor**

---

## 🔗 Quick Links

| Resource | URL |
|----------|-----|
| **Cloud Run Services** | https://console.cloud.google.com/run?project=synapse-473918 |
| **Cloud Build History** | https://console.cloud.google.com/cloud-build/builds?project=synapse-473918 |
| **Cloud Build Triggers** | https://console.cloud.google.com/cloud-build/triggers?project=synapse-473918 |
| **Secret Manager** | https://console.cloud.google.com/security/secret-manager?project=synapse-473918 |
| **IAM Permissions** | https://console.cloud.google.com/iam-admin/iam?project=synapse-473918 |
| **Logs** | https://console.cloud.google.com/logs/query?project=synapse-473918 |
| **Billing** | https://console.cloud.google.com/billing?project=synapse-473918 |

---

## ✨ Next Steps

Once backend is deployed:

1. **Test API endpoints** - Visit `YOUR_URL/docs` for API documentation
2. **Deploy Frontend** - Use backend URL in frontend build
3. **Set up monitoring** - Configure uptime checks and alerts
4. **Custom domain** - Point your domain to Cloud Run (optional)
5. **Load testing** - Verify auto-scaling works

**Congratulations! Your backend is deployed with full CI/CD!** 🎉
