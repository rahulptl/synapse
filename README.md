# Synapse - Knowledge Management Platform

AI-powered knowledge management platform with RAG (Retrieval-Augmented Generation) capabilities.

## 🚀 Quick Start

### Local Development

```bash
# Start services with Docker Compose
docker-compose up

# Backend will be available at: http://localhost:8000
# Frontend will be available at: http://localhost:3000
```

### Cloud Deployment

See **[DEPLOYMENT_GUIDE_UI_ONLY.md](./DEPLOYMENT_GUIDE_UI_ONLY.md)** for complete Google Cloud Run deployment instructions.

## 📁 Project Structure

```
synapse/
├── backend/              # FastAPI backend
│   ├── app/             # Application code
│   ├── Dockerfile       # Docker build for backend
│   └── requirements.txt # Python dependencies
├── frontend/            # React frontend
│   ├── src/            # Source code
│   ├── Dockerfile      # Docker build for frontend
│   └── package.json    # Node dependencies
├── Dockerfile.backend   # Cloud Build Dockerfile (for GCP deployment)
└── docker-compose.yml   # Local development orchestration
```

## 🔧 Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.11)
- **Database**: PostgreSQL (via Cloud SQL)
- **Storage**: Google Cloud Storage
- **AI**: OpenAI GPT-4 + Embeddings
- **Vector Search**: Custom RAG implementation

### Frontend
- **Framework**: React + TypeScript
- **UI**: Tailwind CSS
- **Build**: Vite
- **Deployment**: Nginx (Cloud Run)

## 📚 Documentation

- **[DEPLOYMENT_GUIDE_UI_ONLY.md](./DEPLOYMENT_GUIDE_UI_ONLY.md)** - Complete deployment guide for Google Cloud Run (UI-based, no CLI required)

## 🌐 Deployment

### Architecture

```
GitHub → Cloud Build → Container Registry → Cloud Run
   ↓                                            ↓
dev branch → synapse-backend-dev     Cloud SQL (PostgreSQL)
prod branch → synapse-backend-prod   Google Cloud Storage
```

### Environments

- **Development**: Auto-deploys on push to `dev` branch
- **Production**: Auto-deploys on push to `prod` branch

## 🔐 Environment Variables

See `backend/.env.example` and `frontend/.env.example` for required configuration.

For Cloud Run deployment, secrets are managed via Google Secret Manager.

## 📄 License

Proprietary
