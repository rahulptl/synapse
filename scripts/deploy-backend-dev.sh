#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="synapse-473918"
REGION="asia-south1"
SERVICE_NAME="synapse-backend-dev"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Synapse Backend - Development Deployment${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Get project number for service account
echo -e "${YELLOW}📋 Getting project number...${NC}"
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo -e "${GREEN}✓ Project: ${PROJECT_ID}${NC}"
echo -e "${GREEN}✓ Project Number: ${PROJECT_NUMBER}${NC}"
echo -e "${GREEN}✓ Service Account: ${SERVICE_ACCOUNT}${NC}"
echo ""

# Build Docker image
echo -e "${YELLOW}🔨 Building backend Docker image...${NC}"
docker build -f backend/Dockerfile.cloudrun -t ${IMAGE_NAME}:latest ./backend

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Docker image built successfully${NC}"
else
    echo -e "${RED}✗ Docker build failed${NC}"
    exit 1
fi
echo ""

# Push to Google Container Registry
echo -e "${YELLOW}📤 Pushing image to Google Container Registry...${NC}"
docker push ${IMAGE_NAME}:latest

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Image pushed successfully${NC}"
else
    echo -e "${RED}✗ Image push failed${NC}"
    exit 1
fi
echo ""

# Deploy to Cloud Run
echo -e "${YELLOW}🚀 Deploying to Cloud Run (Development)...${NC}"

# Note: You need to update the DATABASE_URL with the actual password
# Option 1: Create a secret for the full DATABASE_URL
# Option 2: Use environment variable with the password (less secure)

gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --platform managed \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --max-instances 10 \
  --min-instances 0 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 80 \
  --set-env-vars "ENVIRONMENT=development" \
  --set-env-vars "API_V1_STR=/api/v1" \
  --set-env-vars "CLOUD_SQL_CONNECTION_NAME=synapse-473918:asia-south1:synapse" \
  --set-env-vars "STORAGE_BACKEND=gcs" \
  --set-env-vars "GCS_BUCKET_NAME=synapse_storage" \
  --set-env-vars "GCS_PROJECT_ID=synapse-473918" \
  --set-env-vars "DATABASE_URL=postgresql+asyncpg://dev_user:YOUR_DEV_PASSWORD@/dev" \
  --set-env-vars "MAX_CONTENT_SIZE_MB=50" \
  --set-env-vars "CHUNK_SIZE=500" \
  --set-env-vars "CHUNK_OVERLAP=50" \
  --set-env-vars "SIMILARITY_THRESHOLD=0.7" \
  --set-env-vars "EMBEDDING_MODEL=text-embedding-ada-002" \
  --set-env-vars "CHAT_MODEL=gpt-4o-mini" \
  --set-env-vars "MAX_CHAT_HISTORY=10" \
  --set-env-vars "CHAT_TIMEOUT_SECONDS=60" \
  --set-env-vars "RATE_LIMIT_PER_MINUTE=60" \
  --set-env-vars "LOG_LEVEL=INFO" \
  --set-env-vars "ENABLE_CACHING=true" \
  --set-env-vars "CACHE_TTL_SECONDS=3600" \
  --set-secrets "SECRET_KEY=dev-secret-key:latest" \
  --set-secrets "OPENAI_API_KEY=dev-openai-key:latest" \
  --add-cloudsql-instances synapse-473918:asia-south1:synapse \
  --service-account ${SERVICE_ACCOUNT}

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Deployment successful${NC}"
else
    echo -e "${RED}✗ Deployment failed${NC}"
    exit 1
fi
echo ""

# Get service URL
echo -e "${YELLOW}🌐 Retrieving service URL...${NC}"
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --project ${PROJECT_ID} --format="value(status.url)")

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Deployment Complete! 🎉${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${BLUE}Service URL:${NC} ${SERVICE_URL}"
echo -e "${BLUE}Health Check:${NC} ${SERVICE_URL}/health"
echo -e "${BLUE}API Docs:${NC} ${SERVICE_URL}/docs"
echo ""

# Test health endpoint
echo -e "${YELLOW}🏥 Testing health endpoint...${NC}"
sleep 5  # Wait a bit for service to be ready

HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" ${SERVICE_URL}/health)
if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✓ Health check passed (HTTP ${HEALTH_RESPONSE})${NC}"
else
    echo -e "${YELLOW}⚠ Health check returned HTTP ${HEALTH_RESPONSE} (service may still be starting)${NC}"
fi
echo ""

echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Update frontend build with backend URL: ${SERVICE_URL}"
echo -e "  2. Test API endpoints: ${SERVICE_URL}/docs"
echo -e "  3. Check logs: gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}\" --limit 50"
echo ""
