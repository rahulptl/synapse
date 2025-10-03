# Cloud SQL Proxy Guide

## Why Cloud SQL Proxy?

### The Problem: Cloud SQL Security

Cloud SQL databases are **NOT publicly accessible by default** for security reasons. They're designed to be accessed from:
- ✅ GCP services (Cloud Run, GKE, Compute Engine) via **private IP/Unix sockets**
- ❌ Your local laptop via regular TCP connection (blocked by default)

### The Solution: Cloud SQL Proxy

Cloud SQL Proxy acts as a **secure tunnel** between your local machine and Cloud SQL:

```
Your Laptop → Cloud SQL Proxy → Google Cloud → Cloud SQL Database
(localhost:5432)   (secure tunnel)                  (private network)
```

## When Do You Need It?

### ❌ **NOT Needed on Cloud Run**

When your backend runs on Cloud Run:
```bash
# Cloud Run connects directly via Unix socket
DATABASE_URL=postgresql+asyncpg://user@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE
CLOUD_SQL_CONNECTION_NAME=PROJECT:REGION:INSTANCE
```

Cloud Run has **direct access** to Cloud SQL via:
- Unix domain sockets (`/cloudsql/...`)
- Private VPC networking
- No proxy needed!

### ✅ **Needed for Local Development**

When you run backend locally on your laptop:
```bash
# Local connects via proxy at localhost:5432
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/dbname
# No CLOUD_SQL_CONNECTION_NAME needed
```

## How Cloud SQL Proxy Works

### 1. **Authentication**
- Uses your service account credentials
- Authenticates with Google Cloud
- Establishes secure connection

### 2. **Port Forwarding**
- Listens on `localhost:5432` (or any port you choose)
- Forwards all traffic to Cloud SQL instance
- Encrypts data in transit

### 3. **Your App Thinks It's Local**
- Your backend connects to `localhost:5432`
- Proxy handles all the Cloud SQL communication
- No code changes needed!

## Connection Methods Comparison

### Method 1: Username + Password via Cloud SQL Proxy (Local Dev) ✅

**Recommended for local development**

```bash
# Terminal 1: Start Cloud SQL Proxy
cloud-sql-proxy PROJECT_ID:REGION:INSTANCE_NAME

# Your .env.local
DATABASE_URL=postgresql+asyncpg://username:password@localhost:5432/database_name
```

The proxy handles authentication to GCP, then your app uses username/password to authenticate to PostgreSQL.

**Pros:**
- ✅ Secure connection
- ✅ Same as production environment
- ✅ No public IP needed
- ✅ Easy to use

**Cons:**
- ❌ Requires Cloud SQL Proxy running
- ❌ Extra terminal window

### Method 2: Username + Password via Public IP (Direct Connection) ⚠️

**NOT recommended for production**

#### Enable Public IP on Cloud SQL:

1. Go to **Cloud SQL** → Select instance → **Connections**
2. Enable **Public IP**
3. Add **Authorized Network** (your IP address)
4. Get the **Public IP address**

Then connect directly:
```bash
# .env
DATABASE_URL=postgresql+asyncpg://username:password@PUBLIC_IP_ADDRESS:5432/database_name
```

**Pros:**
- ✅ No proxy needed
- ✅ Direct connection

**Cons:**
- ❌ Less secure (database exposed to internet)
- ❌ Need to whitelist IPs constantly
- ❌ Additional attack surface
- ❌ Not recommended by Google
- ❌ Your IP changes? Connection breaks

### Method 3: Username + Password on Cloud Run (Via Unix Socket) ✅

**Recommended for Cloud Run deployment**

```bash
# .env.dev (Cloud Run)
DATABASE_URL=postgresql+asyncpg://username:password@/database_name?host=/cloudsql/PROJECT:REGION:INSTANCE
CLOUD_SQL_CONNECTION_NAME=PROJECT:REGION:INSTANCE
```

The username/password authenticate to PostgreSQL, while Cloud Run's service account provides GCP-level access.

**Pros:**
- ✅ Most secure
- ✅ No proxy needed on Cloud Run
- ✅ Native integration
- ✅ Automatic

**Cons:**
- ❌ Only works on GCP services

### Method 4: IAM Authentication (No Password!) 🔒

**The most secure option** - uses Google IAM instead of passwords.

#### Setup IAM Authentication:

```sql
-- 1. Create database user with IAM
CREATE USER "synapse-backend@PROJECT_ID.iam" WITH LOGIN;
GRANT ALL PRIVILEGES ON DATABASE synapse_dev TO "synapse-backend@PROJECT_ID.iam";
```

```bash
# 2. Connect without password
DATABASE_URL=postgresql+asyncpg://synapse-backend@PROJECT_ID.iam@/database_name?host=/cloudsql/PROJECT:REGION:INSTANCE
```

**Pros:**
- ✅ No password to manage/rotate
- ✅ Uses GCP IAM permissions
- ✅ Automatic credential rotation
- ✅ Audit logs
- ✅ Most secure

**Cons:**
- ❌ More complex setup
- ❌ Only works with GCP service accounts

## Comparison Table

| Method | Works? | Secure? | Proxy Needed? | Use Case |
|--------|--------|---------|---------------|----------|
| **Username/Password + Proxy** | ✅ Yes | ✅ Secure | ✅ Yes | **Local development** |
| **Username/Password + Public IP** | ✅ Yes | ❌ Less secure | ❌ No | Quick testing only |
| **Username/Password + Unix Socket** | ✅ Yes | ✅ Secure | ❌ No | **Cloud Run** |
| **IAM Auth (no password)** | ✅ Yes | ✅ Most secure | ❌ No | Production recommended |

## Installing Cloud SQL Proxy

### macOS (ARM - M1/M2/M3)
```bash
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.arm64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/
```

### macOS (Intel)
```bash
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.amd64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/
```

### Linux (x86_64)
```bash
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/
```

### Windows
Download from: https://cloud.google.com/sql/docs/postgres/sql-proxy#install

Or use Cloud Shell (proxy pre-installed):
```bash
gcloud cloud-shell ssh
cloud-sql-proxy PROJECT:REGION:INSTANCE
```

### Verify Installation
```bash
cloud-sql-proxy --version
# Output: Cloud SQL Proxy version 2.8.0
```

## Using Cloud SQL Proxy

### Basic Usage

```bash
# Start proxy for one instance
cloud-sql-proxy PROJECT_ID:REGION:INSTANCE_NAME

# Example:
cloud-sql-proxy synapse-main:us-central1:synapse-dev
```

Output:
```
Listening on 127.0.0.1:5432
Ready for new connections
```

### Advanced Usage

#### Multiple Instances
```bash
# Connect to multiple databases
cloud-sql-proxy \
  synapse-main:us-central1:synapse-dev \
  synapse-main:us-central1:synapse-prod
```

#### Custom Port
```bash
# Use different port (e.g., 5433)
cloud-sql-proxy synapse-main:us-central1:synapse-dev --port 5433
```

Then update your connection:
```bash
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5433/dbname
```

#### Using Service Account Key
```bash
# Use specific service account
cloud-sql-proxy synapse-main:us-central1:synapse-dev \
  --credentials-file=/path/to/key.json
```

#### Running in Background
```bash
# macOS/Linux: Run in background
cloud-sql-proxy synapse-main:us-central1:synapse-dev &

# Stop it later
pkill cloud-sql-proxy
```

## What We're Using in Migration Plan

### Local Development
```bash
# Terminal 1: Cloud SQL Proxy
cloud-sql-proxy PROJECT:REGION:INSTANCE

# backend/.env.local
DATABASE_URL=postgresql+asyncpg://synapse_local_user:PASSWORD@localhost:5432/synapse_local
```

### Cloud Run (Dev/Prod)
```bash
# backend/.env.dev
DATABASE_URL=postgresql+asyncpg://synapse_dev_user:PASSWORD@/synapse_dev?host=/cloudsql/PROJECT:REGION:INSTANCE
CLOUD_SQL_CONNECTION_NAME=PROJECT:REGION:INSTANCE
```

## Alternatives to Cloud SQL Proxy

### Option A: Use Public IP (Not Recommended)

**YES, you can skip the proxy** by enabling public IP:

```bash
# 1. Enable public IP
gcloud sql instances patch INSTANCE_NAME --assign-ip

# 2. Get public IP
gcloud sql instances describe INSTANCE_NAME --format="value(ipAddresses[0].ipAddress)"

# 3. Whitelist your IP
gcloud sql instances patch INSTANCE_NAME \
  --authorized-networks=YOUR_IP_ADDRESS

# 4. Connect directly
DATABASE_URL=postgresql+asyncpg://user:password@PUBLIC_IP:5432/dbname
```

**When to use:**
- Quick testing/debugging
- One-time data import/export
- Non-production environments

**Security risks:**
- Database exposed to internet
- IP whitelisting maintenance
- Potential for brute-force attacks

### Option B: Use Local PostgreSQL

**YES, you can skip Cloud SQL entirely for local dev:**

```bash
# Install PostgreSQL locally
# macOS
brew install postgresql@15
brew services start postgresql@15

# Ubuntu/Debian
sudo apt-get install postgresql-15
sudo systemctl start postgresql

# Create local database
createdb synapse_local

# Connect to local DB
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/synapse_local
```

**Pros:**
- ✅ Fast (no network latency)
- ✅ Works offline
- ✅ No GCP required

**Cons:**
- ❌ Different environment from production
- ❌ Need to manage local database
- ❌ Might have version/extension differences (e.g., pgvector)
- ❌ Data not synced with cloud

### Option C: Port Forwarding via SSH

If you have a GCE instance with private access to Cloud SQL:

```bash
# SSH tunnel through GCE instance
gcloud compute ssh INSTANCE_NAME \
  --zone=ZONE \
  -- -L 5432:CLOUD_SQL_PRIVATE_IP:5432

# Connect via tunnel
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/dbname
```

## Troubleshooting Cloud SQL Proxy

### Issue 1: "could not find default credentials"

**Error:**
```
Error: could not find default credentials
```

**Solution:**
```bash
# Authenticate with gcloud
gcloud auth application-default login

# Or use service account key
cloud-sql-proxy PROJECT:REGION:INSTANCE \
  --credentials-file=/path/to/key.json
```

### Issue 2: "connection refused"

**Error:**
```
Error: dial tcp 127.0.0.1:5432: connect: connection refused
```

**Solution:**
- Check if proxy is actually running: `ps aux | grep cloud-sql-proxy`
- Check if using correct connection name: `gcloud sql instances describe INSTANCE`
- Verify instance is running: `gcloud sql instances list`

### Issue 3: "port already in use"

**Error:**
```
Error: listen tcp 127.0.0.1:5432: bind: address already in use
```

**Solution:**
```bash
# Find what's using port 5432
lsof -i :5432

# Kill the process or use different port
cloud-sql-proxy PROJECT:REGION:INSTANCE --port 5433
```

### Issue 4: "permission denied"

**Error:**
```
Error: caller does not have permission 'cloudsql.instances.connect'
```

**Solution:**
```bash
# Grant Cloud SQL Client role to your account
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="user:YOUR_EMAIL" \
  --role="roles/cloudsql.client"
```

## Best Practices

### 1. Use Service Account for Local Dev

Create a dedicated service account for local development:

```bash
# Create service account
gcloud iam service-accounts create synapse-local-dev \
  --display-name="Synapse Local Development"

# Grant Cloud SQL Client role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:synapse-local-dev@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Create and download key
gcloud iam service-accounts keys create ~/synapse-local-dev-key.json \
  --iam-account=synapse-local-dev@PROJECT_ID.iam.gserviceaccount.com

# Use key with proxy
cloud-sql-proxy PROJECT:REGION:INSTANCE \
  --credentials-file=~/synapse-local-dev-key.json
```

### 2. Run Proxy Automatically (macOS/Linux)

Create a script `~/bin/start-synapse-db`:

```bash
#!/bin/bash
cloud-sql-proxy synapse-main:us-central1:synapse-dev \
  --credentials-file=~/synapse-local-dev-key.json
```

Make it executable:
```bash
chmod +x ~/bin/start-synapse-db
```

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):
```bash
alias synapse-db='~/bin/start-synapse-db'
```

Now just run: `synapse-db`

### 3. Use Docker Compose (Optional)

```yaml
# docker-compose.yml
services:
  cloud-sql-proxy:
    image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:latest
    command:
      - "--credentials-file=/secrets/key.json"
      - "synapse-main:us-central1:synapse-dev"
    volumes:
      - ./synapse-local-dev-key.json:/secrets/key.json
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql+asyncpg://user:pass@cloud-sql-proxy:5432/dbname
    depends_on:
      - cloud-sql-proxy
```

## Summary

### When to Use Cloud SQL Proxy

| Scenario | Use Proxy? | Alternative |
|----------|-----------|-------------|
| Local development connecting to Cloud SQL | ✅ **YES** | Public IP (not recommended) |
| Cloud Run connecting to Cloud SQL | ❌ NO | Uses Unix socket |
| GKE connecting to Cloud SQL | ⚠️ Optional | Private IP or Unix socket |
| CI/CD pipeline | ✅ YES | Or use service with Cloud SQL access |
| Local PostgreSQL database | ❌ NO | Direct connection |

### Quick Reference

**Start proxy:**
```bash
cloud-sql-proxy PROJECT:REGION:INSTANCE
```

**Connect from app:**
```bash
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/dbname
```

**On Cloud Run (no proxy):**
```bash
DATABASE_URL=postgresql+asyncpg://user:password@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE
CLOUD_SQL_CONNECTION_NAME=PROJECT:REGION:INSTANCE
```

---

**Bottom line:** Cloud SQL Proxy is a **developer tool** that lets you access Cloud SQL from your laptop securely, without exposing the database publicly. Once deployed to Cloud Run, the proxy is not needed because Cloud Run has native Cloud SQL integration via Unix sockets.
