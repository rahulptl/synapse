#!/bin/bash

# Synapse Mumbai Deployment Script
# Usage: ./deploy-mumbai.sh [local|dev|prod]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project configuration
PROJECT_ID="synapse"
REGION="asia-south1"
INSTANCE="synapse"
BUCKET="synapse_storage"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Set project
print_info "Setting GCP project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Function to deploy backend
deploy_backend() {
    local ENV=$1
    local IMAGE_TAG=$ENV

    print_info "Building backend image for $ENV..."
    cd backend

    gcloud builds submit \
        --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${PROJECT_ID}/backend:${IMAGE_TAG} \
        --project=${PROJECT_ID}

    print_info "Deploying backend to Cloud Run ($ENV)..."

    if [ "$ENV" == "dev" ]; then
        gcloud run deploy synapse-backend-dev \
            --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${PROJECT_ID}/backend:${IMAGE_TAG} \
            --region ${REGION} \
            --platform managed \
            --allow-unauthenticated \
            --set-env-vars "\
ENVIRONMENT=development,\
STORAGE_BACKEND=gcs,\
GCS_BUCKET_NAME=${BUCKET},\
GCS_PROJECT_ID=${PROJECT_ID},\
CLOUD_SQL_CONNECTION_NAME=${PROJECT_ID}:${REGION}:${INSTANCE},\
DATABASE_URL=postgresql+asyncpg://dev_user@/dev" \
            --set-secrets "\
SECRET_KEY=jwt-secret-key:latest,\
OPENAI_API_KEY=openai-api-key:latest" \
            --add-cloudsql-instances ${PROJECT_ID}:${REGION}:${INSTANCE} \
            --memory 512Mi \
            --cpu 1 \
            --min-instances 0 \
            --max-instances 10 \
            --timeout 300 \
            --project=${PROJECT_ID}
    elif [ "$ENV" == "prod" ]; then
        gcloud run deploy synapse-backend-prod \
            --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${PROJECT_ID}/backend:${IMAGE_TAG} \
            --region ${REGION} \
            --platform managed \
            --allow-unauthenticated \
            --set-env-vars "\
ENVIRONMENT=production,\
STORAGE_BACKEND=gcs,\
GCS_BUCKET_NAME=${BUCKET},\
GCS_PROJECT_ID=${PROJECT_ID},\
CLOUD_SQL_CONNECTION_NAME=${PROJECT_ID}:${REGION}:${INSTANCE},\
DATABASE_URL=postgresql+asyncpg://prod_user@/prod" \
            --set-secrets "\
SECRET_KEY=jwt-secret-key:latest,\
OPENAI_API_KEY=openai-api-key:latest" \
            --add-cloudsql-instances ${PROJECT_ID}:${REGION}:${INSTANCE} \
            --memory 1Gi \
            --cpu 2 \
            --min-instances 1 \
            --max-instances 50 \
            --timeout 300 \
            --project=${PROJECT_ID}
    fi

    # Get backend URL
    BACKEND_URL=$(gcloud run services describe synapse-backend-${ENV} \
        --region ${REGION} \
        --format "value(status.url)" \
        --project=${PROJECT_ID})

    print_info "Backend deployed at: $BACKEND_URL"
    echo "$BACKEND_URL" > ../.backend-${ENV}-url

    cd ..
}

# Function to deploy frontend
deploy_frontend() {
    local ENV=$1
    local IMAGE_TAG=$ENV

    # Read backend URL
    if [ ! -f ".backend-${ENV}-url" ]; then
        print_error "Backend URL not found. Deploy backend first."
        exit 1
    fi

    BACKEND_URL=$(cat .backend-${ENV}-url)

    print_info "Building frontend image for $ENV with backend URL: $BACKEND_URL"
    cd frontend

    # Get Supabase credentials from .env file
    if [ -f ".env.${ENV}" ]; then
        source .env.${ENV}
    else
        print_warn "No .env.${ENV} found, using placeholder values"
        VITE_SUPABASE_URL="https://your-project.supabase.co"
        VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-key"
    fi

    gcloud builds submit \
        --tag ${REGION}-docker.pkg.dev/${PROJECT_ID}/${PROJECT_ID}/frontend:${IMAGE_TAG} \
        --substitutions=\
_VITE_BACKEND_API_URL="${BACKEND_URL}",\
_VITE_SUPABASE_URL="${VITE_SUPABASE_URL}",\
_VITE_SUPABASE_PUBLISHABLE_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY}" \
        --project=${PROJECT_ID}

    print_info "Deploying frontend to Cloud Run ($ENV)..."

    if [ "$ENV" == "dev" ]; then
        gcloud run deploy synapse-frontend-dev \
            --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${PROJECT_ID}/frontend:${IMAGE_TAG} \
            --region ${REGION} \
            --platform managed \
            --allow-unauthenticated \
            --memory 256Mi \
            --cpu 1 \
            --min-instances 0 \
            --max-instances 5 \
            --timeout 60 \
            --project=${PROJECT_ID}
    elif [ "$ENV" == "prod" ]; then
        gcloud run deploy synapse-frontend-prod \
            --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${PROJECT_ID}/frontend:${IMAGE_TAG} \
            --region ${REGION} \
            --platform managed \
            --allow-unauthenticated \
            --memory 512Mi \
            --cpu 1 \
            --min-instances 1 \
            --max-instances 20 \
            --timeout 60 \
            --project=${PROJECT_ID}
    fi

    # Get frontend URL
    FRONTEND_URL=$(gcloud run services describe synapse-frontend-${ENV} \
        --region ${REGION} \
        --format "value(status.url)" \
        --project=${PROJECT_ID})

    print_info "Frontend deployed at: $FRONTEND_URL"

    cd ..
}

# Function to run local development
run_local() {
    print_info "Starting local development environment..."

    # Check if Cloud SQL Proxy is installed
    if ! command -v cloud-sql-proxy &> /dev/null; then
        print_error "Cloud SQL Proxy is not installed. Install it first:"
        echo "curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.arm64"
        echo "chmod +x cloud-sql-proxy"
        echo "sudo mv cloud-sql-proxy /usr/local/bin/"
        exit 1
    fi

    print_info "Starting Cloud SQL Proxy..."
    cloud-sql-proxy ${PROJECT_ID}:${REGION}:${INSTANCE} &
    PROXY_PID=$!

    sleep 3

    print_info "Starting backend..."
    cd backend
    if [ -f "env/bin/activate" ]; then
        source env/bin/activate
    elif [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    fi
    uvicorn app.main:app --reload --env-file .env.local &
    BACKEND_PID=$!
    cd ..

    sleep 3

    print_info "Starting frontend..."
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..

    print_info "Local development running!"
    print_info "Backend: http://localhost:8000"
    print_info "Frontend: http://localhost:8080"
    print_info "Cloud SQL Proxy PID: $PROXY_PID"
    print_info "Backend PID: $BACKEND_PID"
    print_info "Frontend PID: $FRONTEND_PID"
    print_warn "Press Ctrl+C to stop all services"

    # Wait for Ctrl+C
    trap "kill $PROXY_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
    wait
}

# Main script
ENV=${1:-}

if [ -z "$ENV" ]; then
    echo "Usage: ./deploy-mumbai.sh [local|dev|prod]"
    echo ""
    echo "Commands:"
    echo "  local  - Run local development environment"
    echo "  dev    - Deploy to development environment (Cloud Run)"
    echo "  prod   - Deploy to production environment (Cloud Run)"
    exit 1
fi

case $ENV in
    local)
        run_local
        ;;
    dev)
        print_info "Deploying to DEVELOPMENT environment (Mumbai)"
        deploy_backend "dev"
        deploy_frontend "dev"
        print_info "Development deployment complete!"
        ;;
    prod)
        print_warn "Deploying to PRODUCTION environment (Mumbai)"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            print_info "Production deployment cancelled."
            exit 0
        fi
        deploy_backend "prod"
        deploy_frontend "prod"
        print_info "Production deployment complete!"
        ;;
    *)
        print_error "Invalid environment: $ENV"
        echo "Use: local, dev, or prod"
        exit 1
        ;;
esac
