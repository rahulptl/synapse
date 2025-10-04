#!/bin/bash
# Rollback Script for Cloud Run Deployments
# Usage: ./scripts/rollback.sh <env> <service> [image-tag]
# Examples:
#   ./scripts/rollback.sh dev backend
#   ./scripts/rollback.sh prod frontend gcr.io/synapse-473918/synapse-frontend:prod-20250104-143022

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
print_success() { echo -e "${GREEN}✓ ${1}${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
print_error() { echo -e "${RED}✗ ${1}${NC}"; }

# Configuration
PROJECT_ID="synapse-473918"
REGION="asia-south1"

# Parse arguments
ENV=$1
SERVICE_TYPE=$2
IMAGE_TAG=$3

# Validate arguments
if [ -z "$ENV" ] || [ -z "$SERVICE_TYPE" ]; then
    echo "Usage: $0 <env> <service> [image-tag]"
    echo ""
    echo "Arguments:"
    echo "  env         Environment: 'dev' or 'prod'"
    echo "  service     Service: 'backend' or 'frontend'"
    echo "  image-tag   (Optional) Specific image tag to rollback to"
    echo ""
    echo "Examples:"
    echo "  $0 dev backend                    # Rollback to previous revision"
    echo "  $0 prod frontend <image-tag>      # Rollback to specific image"
    echo ""
    exit 1
fi

# Validate environment
if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    print_error "Environment must be 'dev' or 'prod'"
    exit 1
fi

# Validate service
if [ "$SERVICE_TYPE" != "backend" ] && [ "$SERVICE_TYPE" != "frontend" ]; then
    print_error "Service must be 'backend' or 'frontend'"
    exit 1
fi

# Set service name
SERVICE_NAME="synapse-${SERVICE_TYPE}-${ENV}"

print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "  Rollback: $SERVICE_NAME"
print_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check gcloud authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    print_error "Not authenticated with gcloud. Run: gcloud auth login"
    exit 1
fi

# Set project
gcloud config set project $PROJECT_ID &> /dev/null
print_success "Using project: $PROJECT_ID"

# Get current revision
print_info "Fetching current service information..."
CURRENT_REVISION=$(gcloud run services describe $SERVICE_NAME \
    --region $REGION \
    --format 'value(status.latestReadyRevisionName)' 2>/dev/null)

if [ -z "$CURRENT_REVISION" ]; then
    print_error "Service $SERVICE_NAME not found in region $REGION"
    exit 1
fi

CURRENT_IMAGE=$(gcloud run services describe $SERVICE_NAME \
    --region $REGION \
    --format 'value(spec.template.spec.containers[0].image)')

print_success "Current revision: $CURRENT_REVISION"
print_info "Current image: $CURRENT_IMAGE"
echo ""

# Rollback method
if [ -n "$IMAGE_TAG" ]; then
    # Method 1: Rollback to specific image
    print_warning "Rolling back to specific image: $IMAGE_TAG"

    # Confirm in production
    if [ "$ENV" = "prod" ]; then
        echo ""
        print_warning "⚠️  PRODUCTION ROLLBACK ⚠️"
        echo ""
        echo "You are about to rollback the PRODUCTION service:"
        echo "  Service: $SERVICE_NAME"
        echo "  From:    $CURRENT_IMAGE"
        echo "  To:      $IMAGE_TAG"
        echo ""
        read -p "Type 'ROLLBACK' to confirm: " confirmation

        if [ "$confirmation" != "ROLLBACK" ]; then
            print_error "Rollback cancelled"
            exit 1
        fi
    fi

    echo ""
    print_info "Deploying rollback image..."

    gcloud run services update $SERVICE_NAME \
        --region $REGION \
        --image $IMAGE_TAG \
        --quiet

    print_success "Rollback deployed with new revision"

else
    # Method 2: Rollback to previous revision
    print_info "Fetching revision history..."

    # Get all revisions
    REVISIONS=$(gcloud run revisions list \
        --service $SERVICE_NAME \
        --region $REGION \
        --format 'value(name)' \
        --sort-by '~metadata.creationTimestamp' \
        --limit 10)

    # Convert to array
    REVISION_ARRAY=($REVISIONS)

    if [ ${#REVISION_ARRAY[@]} -lt 2 ]; then
        print_error "No previous revision found to rollback to"
        exit 1
    fi

    # Current is first, previous is second
    PREVIOUS_REVISION=${REVISION_ARRAY[1]}
    PREVIOUS_IMAGE=$(gcloud run revisions describe $PREVIOUS_REVISION \
        --region $REGION \
        --format 'value(spec.containers[0].image)')

    echo ""
    print_warning "Available revisions (latest first):"
    for i in "${!REVISION_ARRAY[@]}"; do
        REV=${REVISION_ARRAY[$i]}
        REV_IMAGE=$(gcloud run revisions describe $REV \
            --region $REGION \
            --format 'value(spec.containers[0].image)')
        REV_TRAFFIC=$(gcloud run services describe $SERVICE_NAME \
            --region $REGION \
            --format "value(status.traffic[?revisionName=='$REV'].percent)" 2>/dev/null || echo "0")

        if [ "$i" = "0" ]; then
            echo "  ${GREEN}▸ $REV (current, ${REV_TRAFFIC}% traffic)${NC}"
        elif [ "$i" = "1" ]; then
            echo "  ${YELLOW}▸ $REV (will rollback to this)${NC}"
        else
            echo "    $REV"
        fi
    done

    echo ""
    print_warning "Rollback target:"
    echo "  Revision: $PREVIOUS_REVISION"
    echo "  Image:    $PREVIOUS_IMAGE"

    # Confirm in production
    if [ "$ENV" = "prod" ]; then
        echo ""
        print_warning "⚠️  PRODUCTION ROLLBACK ⚠️"
        echo ""
        read -p "Type 'ROLLBACK' to confirm: " confirmation

        if [ "$confirmation" != "ROLLBACK" ]; then
            print_error "Rollback cancelled"
            exit 1
        fi
    fi

    echo ""
    print_info "Shifting traffic to previous revision..."

    gcloud run services update-traffic $SERVICE_NAME \
        --region $REGION \
        --to-revisions $PREVIOUS_REVISION=100 \
        --quiet

    print_success "Traffic shifted to previous revision"
fi

echo ""
print_info "Verifying rollback..."
sleep 3

# Get new current revision
NEW_CURRENT_REVISION=$(gcloud run services describe $SERVICE_NAME \
    --region $REGION \
    --format 'value(status.latestReadyRevisionName)')

NEW_CURRENT_IMAGE=$(gcloud run services describe $SERVICE_NAME \
    --region $REGION \
    --format 'value(spec.template.spec.containers[0].image)')

SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --region $REGION \
    --format 'value(status.url)')

echo ""
print_success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_success "  Rollback Successful!"
print_success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Service:  $SERVICE_NAME"
echo "Region:   $REGION"
echo "Revision: $NEW_CURRENT_REVISION"
echo "Image:    $NEW_CURRENT_IMAGE"
echo "URL:      $SERVICE_URL"
echo ""

# Run health check
print_info "Running health check..."

if [ "$SERVICE_TYPE" = "backend" ]; then
    HEALTH_ENDPOINT="$SERVICE_URL/health"
else
    HEALTH_ENDPOINT="$SERVICE_URL"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_ENDPOINT)

if [ "$HTTP_CODE" = "200" ]; then
    print_success "Health check passed (HTTP $HTTP_CODE)"
else
    print_warning "Health check returned HTTP $HTTP_CODE"
    print_warning "Please verify the service manually: $SERVICE_URL"
fi

echo ""
print_info "To rollback this rollback, use:"
echo "  $0 $ENV $SERVICE_TYPE $CURRENT_IMAGE"
echo ""
