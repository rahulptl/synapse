# 🏠 Local Development Guide - Synapse

Complete guide for running Synapse locally with PostgreSQL and local file storage.

---

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Setup Options](#-setup-options)
- [Configuration](#-configuration)
- [Common Tasks](#-common-tasks)
- [Troubleshooting](#-troubleshooting)
- [Cloud Integration Testing](#-cloud-integration-testing)

---

## 🚀 Quick Start

### **One-Command Setup**

```bash
./scripts/init-local-dev.sh
```

This script will:
1. Stop any running containers
2. Create necessary directories
3. Start PostgreSQL with pgvector
4. Initialize database with test data
5. Start backend and frontend services

**Access your app:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

**Login with test user:**
- Email: `test@synapse.local`
- Password: `test123`

---

## 🏗️ Architecture

### **Local Development Stack**

```
┌─────────────┐
│  Frontend   │  Port 3000 (nginx)
│  (React)    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Backend    │  Port 8000 (FastAPI)
│  (Python)   │
└──────┬──────┘
       │
       ├──────────────────┐
       │                  │
       ▼                  ▼
┌─────────────┐    ┌─────────────┐
│ PostgreSQL  │    │   Local     │
│ + pgvector  │    │   Storage   │
│  (Docker)   │    │ (Filesystem)│
└─────────────┘    └─────────────┘
   Port 5432         ./local_storage/
```

### **Key Changes from Cloud Setup**

| Component | Cloud | Local |
|-----------|-------|-------|
| **Database** | Cloud SQL (Asia South1) | Local PostgreSQL (Docker) |
| **DB Connection** | Cloud SQL Proxy | Direct connection |
| **Storage** | Google Cloud Storage | Local filesystem |
| **Auth** | Service accounts | No GCP credentials needed |
| **Cost** | ~$15-20/month | $0 (except OpenAI API) |

---

## 📦 Prerequisites

### **Required**

- **Docker Desktop** (or Docker + Docker Compose)
  ```bash
  docker --version  # Should be 20.10+
  docker compose version  # Should be v2.0+
  ```

- **OpenAI API Key**
  - Get from: https://platform.openai.com/api-keys
  - Add to `backend/.env.local`

### **Optional**

- **Node.js 18+** (for running frontend outside Docker)
- **Python 3.11+** (for running backend outside Docker)
- **PostgreSQL client** (for direct database access)

---

## ⚙️ Setup Options

### **Option 1: Docker Compose (Recommended)**

Easiest setup - everything runs in containers.

```bash
# Quick start
./scripts/init-local-dev.sh

# Or manually
docker compose up -d
docker compose logs -f
```

### **Option 2: Backend + Frontend Separately**

Better for active development with faster hot reload.

**Terminal 1 - Backend:**
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start local PostgreSQL first
docker compose up -d postgres

# Run backend
uvicorn app.main:app --reload
```

**Terminal 2 - Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Start dev server (Vite)
npm run dev
```

Access: http://localhost:5173

### **Option 3: Hybrid Mode**

Frontend in Docker, backend outside for debugging.

```bash
# Start postgres and frontend
docker compose up -d postgres frontend

# Run backend locally
cd backend
uvicorn app.main:app --reload
```

---

## 🔧 Configuration

### **Environment Files**

#### **`backend/.env.local`** (Already configured)

```bash
# Database - Local PostgreSQL
DATABASE_URL=postgresql+asyncpg://synapse:localdev123@localhost:5432/synapse_local

# Storage - Local filesystem
STORAGE_BACKEND=local
LOCAL_STORAGE_PATH=./storage

# OpenAI (update with your key)
OPENAI_API_KEY=sk-proj-...

# Chat model (cost-optimized)
CHAT_MODEL=gpt-4.1-mini
```

#### **`frontend/.env.local`** (For npm run dev)

```bash
VITE_BACKEND_API_URL=http://localhost:8000
```

### **Database Credentials**

| Field | Value |
|-------|-------|
| Host | localhost |
| Port | 5432 |
| Database | synapse_local |
| User | synapse |
| Password | localdev123 |

### **Test User**

| Field | Value |
|-------|-------|
| Email | test@synapse.local |
| Password | test123 |

---

## 📝 Common Tasks

### **Start Services**

```bash
docker compose up -d
```

### **Stop Services**

```bash
docker compose down
```

### **View Logs**

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f postgres
docker compose logs -f frontend
```

### **Restart a Service**

```bash
docker compose restart backend
```

### **Rebuild After Code Changes**

```bash
# Backend only
docker compose up -d --build backend

# All services
docker compose up -d --build
```

### **Access Database Directly**

```bash
# Via docker
docker exec -it synapse-postgres psql -U synapse -d synapse_local

# Via local psql (if installed)
psql -h localhost -U synapse -d synapse_local
```

### **Reset Database**

```bash
./scripts/reset-local-db.sh
```

**Warning:** This deletes ALL local data!

### **Check Service Status**

```bash
docker compose ps
```

### **Check Backend Health**

```bash
curl http://localhost:8000/health
```

---

## 🐛 Troubleshooting

### **Issue: PostgreSQL won't start**

**Symptoms:**
```
Error: database "synapse_local" does not exist
```

**Solution:**
```bash
# Remove old data and restart
docker compose down
rm -rf postgres_data
docker compose up -d postgres
```

### **Issue: Backend can't connect to database**

**Symptoms:**
```
asyncpg.exceptions.InvalidCatalogNameError
```

**Solution:**
```bash
# Check postgres is running
docker compose ps

# Check postgres logs
docker compose logs postgres

# Verify connection
docker exec synapse-postgres pg_isready -U synapse
```

### **Issue: Frontend shows 404 for API calls**

**Symptoms:**
```
Failed to fetch: http://localhost:8000/api/v1/...
```

**Solution:**
```bash
# Check backend is running
curl http://localhost:8000/health

# Check backend logs
docker compose logs backend

# Verify environment variable
echo $VITE_BACKEND_API_URL
```

### **Issue: "Port already in use"**

**Symptoms:**
```
Error: bind: address already in use
```

**Solution:**
```bash
# Find what's using the port
lsof -i :8000  # or :3000, :5432

# Kill the process
kill -9 <PID>

# Or use different ports in docker-compose.yml
```

### **Issue: Local storage permission errors**

**Symptoms:**
```
PermissionError: [Errno 13] Permission denied: '/app/storage/...'
```

**Solution:**
```bash
# Fix permissions
chmod -R 777 local_storage/

# Or recreate
rm -rf local_storage
mkdir local_storage
```

### **Issue: Database tables missing**

**Symptoms:**
```
relation "users" does not exist
```

**Solution:**
```bash
# Check if init script exists
ls -la backend/init_local_db.sql

# Reset database
./scripts/reset-local-db.sh

# Or manually run init script
docker exec -i synapse-postgres psql -U synapse -d synapse_local < backend/init_local_db.sql
```

---

## 📊 Data Persistence

### **What's persisted:**

| Data | Location | Persisted? |
|------|----------|------------|
| Database | `./postgres_data/` | ✅ Yes |
| Uploaded files | `./local_storage/` | ✅ Yes |
| Backend code | `./backend/app/` | ✅ (mounted) |
| Container logs | Docker | ❌ Deleted on down |

### **To start fresh:**

```bash
# Nuclear option - delete everything
docker compose down
rm -rf postgres_data local_storage

# Restart
./scripts/init-local-dev.sh
```

---

## 🎯 Development Workflow

### **Typical Flow:**

1. **Start services**
   ```bash
   docker compose up -d
   ```

2. **Make code changes**
   - Backend: Changes auto-reload (mounted volume)
   - Frontend: Rebuild required

3. **Test locally**
   - Frontend: http://localhost:3000
   - Login with test@synapse.local / test123

4. **Check logs**
   ```bash
   docker compose logs -f backend
   ```

5. **Deploy to cloud** (when ready)
   ```bash
   # Backend
   gcloud builds submit --config=backend/cloudbuild.yaml

   # Frontend
   gcloud builds submit --config=frontend/cloudbuild.yaml \
     --substitutions=_ENV=dev,_BACKEND_URL=<backend-url>
   ```

---

## 💡 Pro Tips

### **Speed up development:**

1. **Use backend outside Docker** for faster restart
   ```bash
   docker compose up -d postgres frontend
   cd backend && uvicorn app.main:app --reload
   ```

2. **Use Vite dev server** for instant HMR
   ```bash
   cd frontend && npm run dev
   # Access on http://localhost:5173
   ```

3. **Keep postgres running** between sessions
   ```bash
   # Only restart backend/frontend
   docker compose restart backend frontend
   ```

### **Database tips:**

- **View data in GUI**: Use pgAdmin or DBeaver
- **Quick table check**:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public';
  ```
- **User count**: `SELECT COUNT(*) FROM users;`

### **Clean Docker resources:**

```bash
# Remove unused images
docker image prune -a

# Remove all stopped containers
docker container prune

# Check disk usage
docker system df
```

---

## 📚 Additional Resources

- **API Documentation**: http://localhost:8000/docs (when running)
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **pgvector Guide**: https://github.com/pgvector/pgvector
- **Docker Compose Docs**: https://docs.docker.com/compose/

---

## 🆘 Getting Help

### **Check logs first:**
```bash
docker compose logs -f
```

### **Verify services:**
```bash
docker compose ps
curl http://localhost:8000/health
```

### **Reset everything:**
```bash
./scripts/reset-local-db.sh
```

---

## 🎉 Summary

You now have a fully local development environment:

✅ **No cloud costs** during development
✅ **Works offline**
✅ **Fast iteration** with hot reload
✅ **Easy reset** for testing
✅ **Production-like** architecture
✅ **Optional cloud testing** when needed

**Happy coding! 🚀**
