#!/bin/bash

# Setup Cloud Scheduler to automatically stop/start Cloud SQL
# This saves costs by running the database only during working hours
#
# Schedule:
#   - Start: 9 AM IST (Monday-Friday)
#   - Stop: 9 PM IST (Monday-Friday)
#   - Stopped all weekend
#
# Estimated savings: ~$25-30/month (50% of Cloud SQL costs)

set -e

PROJECT_ID="synapse-473918"
REGION="asia-south1"
INSTANCE_NAME="synapse"

echo "🕐 Setting up Cloud Scheduler for Cloud SQL auto-stop/start"
echo ""

# Enable Cloud Scheduler API
echo "1️⃣ Enabling Cloud Scheduler API..."
gcloud services enable cloudscheduler.googleapis.com --project=$PROJECT_ID

# Create App Engine app if doesn't exist (required for Cloud Scheduler)
echo "2️⃣ Checking App Engine app..."
if ! gcloud app describe --project=$PROJECT_ID &> /dev/null; then
    echo "Creating App Engine app in $REGION..."
    gcloud app create --region=$REGION --project=$PROJECT_ID
else
    echo "✅ App Engine app already exists"
fi

# Create Cloud Scheduler jobs

# Job 1: Start database at 9 AM IST (Monday-Friday)
echo ""
echo "3️⃣ Creating START schedule (9 AM IST, Mon-Fri)..."
gcloud scheduler jobs create http cloud-sql-dev-start \
    --location=$REGION \
    --schedule="0 9 * * 1-5" \
    --time-zone="Asia/Kolkata" \
    --uri="https://sqladmin.googleapis.com/v1/projects/$PROJECT_ID/instances/$INSTANCE_NAME" \
    --http-method=PATCH \
    --message-body='{"settings": {"activationPolicy": "ALWAYS"}}' \
    --headers="Content-Type=application/json" \
    --oauth-service-account-email="$PROJECT_ID@appspot.gserviceaccount.com" \
    --project=$PROJECT_ID \
    --description="Start Cloud SQL dev instance at 9 AM IST on weekdays" \
    || echo "Job 'cloud-sql-dev-start' already exists"

# Job 2: Stop database at 9 PM IST (Monday-Friday)
echo ""
echo "4️⃣ Creating STOP schedule (9 PM IST, Mon-Fri)..."
gcloud scheduler jobs create http cloud-sql-dev-stop \
    --location=$REGION \
    --schedule="0 21 * * 1-5" \
    --time-zone="Asia/Kolkata" \
    --uri="https://sqladmin.googleapis.com/v1/projects/$PROJECT_ID/instances/$INSTANCE_NAME" \
    --http-method=PATCH \
    --message-body='{"settings": {"activationPolicy": "NEVER"}}' \
    --headers="Content-Type=application/json" \
    --oauth-service-account-email="$PROJECT_ID@appspot.gserviceaccount.com" \
    --project=$PROJECT_ID \
    --description="Stop Cloud SQL dev instance at 9 PM IST on weekdays" \
    || echo "Job 'cloud-sql-dev-stop' already exists"

# Job 3: Stop database on Friday night for weekend
echo ""
echo "5️⃣ Creating WEEKEND STOP schedule (Fri 9 PM IST)..."
gcloud scheduler jobs create http cloud-sql-dev-weekend-stop \
    --location=$REGION \
    --schedule="0 21 * * 5" \
    --time-zone="Asia/Kolkata" \
    --uri="https://sqladmin.googleapis.com/v1/projects/$PROJECT_ID/instances/$INSTANCE_NAME" \
    --http-method=PATCH \
    --message-body='{"settings": {"activationPolicy": "NEVER"}}' \
    --headers="Content-Type=application/json" \
    --oauth-service-account-email="$PROJECT_ID@appspot.gserviceaccount.com" \
    --project=$PROJECT_ID \
    --description="Stop Cloud SQL dev instance for weekend" \
    || echo "Job 'cloud-sql-dev-weekend-stop' already exists"

echo ""
echo "✅ Cloud Scheduler setup complete!"
echo ""
echo "📋 Scheduled jobs:"
echo "  • START:  Monday-Friday at 9:00 AM IST"
echo "  • STOP:   Monday-Friday at 9:00 PM IST"
echo "  • Result: Database runs 12 hrs/day on weekdays only"
echo ""
echo "💰 Estimated savings:"
echo "  • Before: $51/month (24/7 operation)"
echo "  • After:  ~$25/month (60 hrs/week vs 168 hrs/week)"
echo "  • SAVINGS: ~$26/month!"
echo ""
echo "🎛️  Manual control:"
echo "  • Start now:  ./scripts/cloud-sql-start.sh"
echo "  • Stop now:   ./scripts/cloud-sql-stop.sh"
echo ""
echo "📊 View schedules:"
echo "  gcloud scheduler jobs list --location=$REGION"
echo ""
echo "⚙️  Modify schedule:"
echo "  gcloud scheduler jobs update http JOB_NAME --location=$REGION --schedule='NEW_CRON'"
