#!/bin/bash

# Script to start Cloud SQL instance for dev environment
# Run this at start of workday or when you need the database

set -e

PROJECT_ID="synapse-473918"
INSTANCE_NAME="synapse"

echo "▶️  Starting Cloud SQL instance: $INSTANCE_NAME"

# Check current state
CURRENT_STATE=$(gcloud sql instances describe $INSTANCE_NAME \
  --project=$PROJECT_ID \
  --format='value(settings.activationPolicy)')

if [ "$CURRENT_STATE" == "ALWAYS" ]; then
    echo "✅ Instance is already running"

    # Show connection info
    CONNECTION_NAME=$(gcloud sql instances describe $INSTANCE_NAME \
      --project=$PROJECT_ID \
      --format='value(connectionName)')
    echo ""
    echo "Connection: $CONNECTION_NAME"
    exit 0
fi

# Start the instance
echo "Starting instance (this takes ~30 seconds)..."
gcloud sql instances patch $INSTANCE_NAME \
  --activation-policy=ALWAYS \
  --project=$PROJECT_ID \
  --quiet

# Wait for it to be ready
echo "Waiting for instance to be ready..."
for i in {1..12}; do
    STATE=$(gcloud sql instances describe $INSTANCE_NAME \
      --project=$PROJECT_ID \
      --format='value(state)')

    if [ "$STATE" == "RUNNABLE" ]; then
        echo "✅ Cloud SQL instance is running!"

        CONNECTION_NAME=$(gcloud sql instances describe $INSTANCE_NAME \
          --project=$PROJECT_ID \
          --format='value(connectionName)')

        echo ""
        echo "📊 Instance Details:"
        echo "  Connection: $CONNECTION_NAME"
        echo "  Status: RUNNABLE"
        echo ""
        echo "You can now connect to the database"
        exit 0
    fi

    echo "  Waiting... ($i/12)"
    sleep 5
done

echo "⚠️  Instance started but might still be initializing"
echo "Check status with: gcloud sql instances describe $INSTANCE_NAME"
