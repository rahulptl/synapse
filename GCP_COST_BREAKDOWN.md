# GCP Cost Breakdown for Synapse Application

## Cloud Run Free Tier (Every Month)

Google Cloud Run provides a **generous free tier** that renews every month:

- ✅ **180,000 vCPU-seconds/month** (FREE)
- ✅ **360,000 GiB-seconds/month** (FREE)
- ✅ **2 million requests/month** (FREE)

**What this means in practical terms:**

### Free Tier Capacity Example

With the free tier, you could run:

**Option 1: Small Development Usage**
- 1 backend service (0.5 vCPU, 512 MiB) running 24/7
- 1 frontend service (0.5 vCPU, 256 MiB) running 24/7
- Up to 2M requests/month
- **Cost: $0** (stays within free tier!)

**Option 2: Moderate Development Usage**
- 2 services with moderate traffic
- Each service gets ~50 hours of runtime per month at 1 vCPU
- **Cost: $0** for compute

## Detailed Cost Breakdown

### Development Environment (Monthly)

| Service | Configuration | Monthly Cost | Notes |
|---------|--------------|--------------|-------|
| **Cloud Run - Backend** | 0.5 vCPU, 512 MiB, min=0 | **$0-5** | Likely FREE with low traffic |
| **Cloud Run - Frontend** | 0.5 vCPU, 256 MiB, min=0 | **$0-3** | Likely FREE with low traffic |
| **Cloud SQL** | db-f1-micro (shared CPU, 0.6GB) | **$7-9** | Smallest instance |
| **Cloud Storage** | Standard storage, minimal usage | **$0-2** | ~100GB = $2 |
| **Artifact Registry** | Docker images storage | **$0-1** | First 0.5GB free |
| **Secret Manager** | 5-10 secrets, low access | **$0** | First 6 versions free |
| **Cloud Build** | 1-5 builds/day | **$0** | First 120 build-minutes/day free |
| | | | |
| **TOTAL (Dev)** | | **~$7-20/month** | |

### Production Environment (Monthly - Moderate Traffic)

Assuming ~100K requests/month, 100GB storage, moderate compute:

| Service | Configuration | Monthly Cost | Details |
|---------|--------------|--------------|---------|
| **Cloud Run - Backend** | 1 vCPU, 1 GiB, min=1 | **$15-50** | Depends on request duration |
| **Cloud Run - Frontend** | 1 vCPU, 512 MiB, min=1 | **$10-30** | Static files, fast responses |
| **Cloud SQL** | db-n1-standard-1 (1 vCPU, 3.75GB) | **$50-70** | Standard instance with backups |
| **Cloud Storage** | Standard storage, 100GB | **$2-5** | $0.02/GB/month |
| **Cloud CDN** (optional) | Cache static assets | **$5-15** | Reduces Cloud Run costs |
| **Artifact Registry** | Store 5-10 images | **$1-3** | $0.10/GB/month |
| **Cloud Load Balancing** (optional) | Multi-region traffic | **$18-25** | $18 base + per-GB |
| **Secret Manager** | 10 secrets, frequent access | **$0-1** | Minimal cost |
| **Cloud Build** | 5-10 builds/day | **$0-5** | Exceeding free tier slightly |
| | | | |
| **TOTAL (Prod - Basic)** | | **~$77-154/month** | |
| **TOTAL (Prod - With CDN/LB)** | | **~$100-199/month** | |

### Production Environment (Monthly - High Traffic)

Assuming ~1M requests/month, 500GB storage:

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| **Cloud Run - Backend** | 2 vCPU, 2 GiB, min=2, max=20 | **$80-200** |
| **Cloud Run - Frontend** | 1 vCPU, 1 GiB, min=1, max=10 | **$40-100** |
| **Cloud SQL** | db-n1-standard-2 (2 vCPU, 7.5GB) + HA | **$150-200** |
| **Cloud Storage** | 500GB + egress | **$10-25** |
| **Cloud CDN** | High cache hit ratio | **$15-40** |
| **Artifact Registry** | 15-20 images | **$3-5** |
| **Cloud Build** | Frequent deployments | **$5-15** |
| | | |
| **TOTAL (Prod - High Traffic)** | | **~$303-585/month** |

## Cost Optimization Strategies

### 1. **Maximize Free Tier Usage**

**Cloud Run:**
- Use **min instances = 0** for dev environments (scales to zero)
- Only set min instances > 0 in production for critical services
- Keep services under 2M requests/month to stay free

**Cloud Build:**
- First 120 build-minutes/day are FREE
- Optimize Dockerfiles to build faster (multi-stage builds)

**Secret Manager:**
- First 6 secret versions are FREE per secret
- Minimize secret rotation frequency

### 2. **Development Environment**

✅ **Keep dev environment FREE:**
```
Backend:  min=0, max=3, 0.5 vCPU, 512 MiB
Frontend: min=0, max=2, 0.5 vCPU, 256 MiB
Cloud SQL: db-f1-micro (smallest instance)
```

This configuration will likely stay within Cloud Run free tier for low-traffic development!

### 3. **Production Environment**

**Start small, scale as needed:**
```
Initial Setup:
- Backend:  min=1, max=10, 1 vCPU, 1 GiB
- Frontend: min=0, max=5, 0.5 vCPU, 512 MiB
- Cloud SQL: db-custom-1-3840 (1 vCPU, 3.75 GB)
```

**As traffic grows:**
- Increase max instances (Cloud Run auto-scales)
- Add Cloud CDN to reduce backend requests
- Upgrade Cloud SQL instance size
- Consider adding Cloud Load Balancing for multi-region

### 4. **Storage Costs**

**Cloud Storage pricing:**
- Standard Storage: **$0.020 per GB/month**
- Nearline (30-day min): **$0.010 per GB/month** (for archival)
- Coldline (90-day min): **$0.004 per GB/month** (for backups)

**Optimization:**
- Set up **lifecycle policies** to move old files to Nearline/Coldline
- Delete unnecessary data regularly
- Use compression for stored files

Example lifecycle rule:
- Move files to Nearline after 30 days
- Move to Coldline after 90 days
- Delete after 365 days

### 5. **Database Costs**

**Cloud SQL optimization:**
- Use **shared-core (f1-micro)** for dev: ~$7/month
- Use **custom machine types** for exact sizing in prod
- Enable **automated backups** (7 days retention is free)
- Consider **read replicas** only if needed (doubles cost)
- Use **connection pooling** (pgBouncer) to reduce connections

**Cost comparison:**
- db-f1-micro (shared, 0.6GB): **$7-9/month**
- db-g1-small (shared, 1.7GB): **$25-30/month**
- db-n1-standard-1 (1 vCPU, 3.75GB): **$50-70/month**
- db-n1-standard-2 (2 vCPU, 7.5GB): **$100-140/month**

### 6. **Network Egress**

**Important:** Data transfer OUT of GCP incurs charges:
- First 1 GB/month: FREE
- 1 GB - 10 TB/month: **$0.12/GB** (to internet)
- Within same region: FREE

**To minimize:**
- Use Cloud CDN (caches responses closer to users)
- Compress responses (gzip)
- Optimize image sizes before storing

### 7. **Monitoring Costs**

**Cloud Logging:**
- First 50 GB/month: FREE
- Above 50 GB: **$0.50/GB**

**Cloud Monitoring:**
- Free tier: 150 MB of metrics/month
- Paid: **$0.2580/MB** for metrics

**Optimization:**
- Set log retention to 30 days (default is 30 days)
- Use log exclusion filters for noisy logs
- Sample verbose logs in production

## Real-World Cost Examples

### Scenario 1: Solo Developer / MVP

**Setup:**
- Dev environment only
- ~10K requests/month
- 50GB storage
- Minimal builds

**Monthly Cost:**
```
Cloud Run: $0 (within free tier)
Cloud SQL (f1-micro): $8
Cloud Storage: $1
Total: ~$9/month
```

### Scenario 2: Small Startup

**Setup:**
- Dev + Prod environments
- ~200K requests/month (prod)
- 150GB storage
- 5 builds/day

**Monthly Cost:**
```
Dev Environment:
  Cloud Run: $0-5
  Cloud SQL: $8
  Storage: $1

Prod Environment:
  Cloud Run: $30-60
  Cloud SQL (standard-1): $60
  Storage: $3
  CDN: $10

Total: ~$112-147/month
```

### Scenario 3: Growing Company

**Setup:**
- Dev + Staging + Prod
- ~2M requests/month (prod)
- 1TB storage
- 20 builds/day

**Monthly Cost:**
```
Dev: $10
Staging: $40
Prod: $400-600
Total: ~$450-650/month
```

## Free Tier Maximization Tips

### Cloud Run Free Tier Details

**180,000 vCPU-seconds/month = ?**
- 50 hours of 1 vCPU instance
- 100 hours of 0.5 vCPU instance
- Running 1 vCPU 24/7 = 2,592,000 vCPU-seconds (exceeds free tier)

**360,000 GiB-seconds/month = ?**
- ~100 hours of 1 GiB instance
- ~200 hours of 512 MiB instance
- Running 1 GiB 24/7 = 2,592,000 GiB-seconds (exceeds free tier)

**2M requests/month = ?**
- 66,666 requests/day
- 2,777 requests/hour
- 46 requests/minute

### How to Stay Within Free Tier

**For development environment:**
```yaml
Backend Configuration:
  vCPU: 0.5
  Memory: 512 MiB
  Min instances: 0  # Scales to zero!
  Max instances: 3
  Request timeout: 60s

Frontend Configuration:
  vCPU: 0.5
  Memory: 256 MiB
  Min instances: 0  # Scales to zero!
  Max instances: 2
  Request timeout: 30s
```

**With this setup:**
- If you have 50K requests/month in dev
- Average request duration: 500ms
- Compute usage: ~25,000 vCPU-seconds (well within 180K limit!)
- Memory usage: ~12,500 GiB-seconds (well within 360K limit!)
- **Cost: $0** for Cloud Run

## Budget Recommendations

### Conservative Budget (3 Environments)

| Environment | Monthly Budget |
|-------------|---------------|
| **Local** | $0 (runs on your machine) |
| **Dev** | $10-20 |
| **Prod** | $100-200 |
| **Total** | **$110-220/month** |

### Moderate Budget (High Availability)

| Environment | Monthly Budget |
|-------------|---------------|
| **Dev** | $20-30 |
| **Staging** | $50-80 |
| **Prod** | $300-500 |
| **Total** | **$370-610/month** |

## Cost Monitoring

### Set Up Budget Alerts (GCP Console)

1. Go to **Billing** → **Budgets & alerts**
2. Click **CREATE BUDGET**
3. Set thresholds:
   - 50% of budget: Email notification
   - 80% of budget: Email notification
   - 100% of budget: Email notification + potentially stop services

**Recommended budgets:**
- Dev environment: $20/month
- Prod environment: $200/month

### Cost Breakdown Dashboard

Monitor costs by:
- Service (Cloud Run, Cloud SQL, Storage)
- Environment (dev, prod)
- Project (if using multiple projects)

View in: **Billing** → **Reports**

## Pricing Calculators

**Official GCP Pricing Calculator:**
https://cloud.google.com/products/calculator

**Pre-configured for Synapse:**
- Cloud Run: 2 services
- Cloud SQL: PostgreSQL
- Cloud Storage: Standard
- Artifact Registry

## Summary

### Minimum Monthly Cost (Dev Only)
**~$7-10/month** (Cloud SQL + minimal storage)

### Realistic Cost (Dev + Prod, Small Traffic)
**~$100-150/month**

### Recommended Starting Budget
**$150-200/month** (includes buffer for unexpected traffic)

### Cost Scaling
As your app grows, costs scale linearly with traffic. Cloud Run's auto-scaling ensures you only pay for what you use.

**Key Takeaway:** Start small with min instances = 0 for dev, and you'll likely stay within Cloud Run's generous free tier while only paying for Cloud SQL (~$10/month).
