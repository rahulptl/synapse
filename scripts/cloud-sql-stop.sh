#!/bin/bash

# Script to stop Cloud SQL instance for dev environment
# Saves ~50% costs by stopping during non-working hours
# Run this at end of workday or use Cloud Scheduler

set -e

PROJECT_ID="synapse-473918"
INSTANCE_NAME="synapse"

echo "🛑 Stopping Cloud SQL instance: $INSTANCE_NAME"
echo "This will save costs during idle time..."

# Check current state
CURRENT_STATE=$(gcloud sql instances describe $INSTANCE_NAME \
  --project=$PROJECT_ID \
  --format='value(settings.activationPolicy)')

if [ "$CURRENT_STATE" == "NEVER" ]; then
    echo "✅ Instance is already stopped"
    exit 0
fi

# Stop the instance
echo "Stopping instance..."
gcloud sql instances patch $INSTANCE_NAME \
  --activation-policy=NEVER \
  --project=$PROJECT_ID \
  --quiet

echo "✅ Cloud SQL instance stopped successfully"
echo "💰 You'll save ~$1.70/day (~$51/month) while stopped"
echo ""
echo "To restart when needed, run:"
echo "  ./scripts/cloud-sql-start.sh"
