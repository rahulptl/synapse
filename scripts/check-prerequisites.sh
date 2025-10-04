#!/bin/bash

# Script to check if all prerequisites for backend deployment are set up
# Run this before deploying the backend to Cloud Run

set -e

PROJECT_ID="synapse-473918"
REGION="asia-south1"
INSTANCE_NAME="synapse"

echo "🔍 Checking prerequisites for backend deployment..."
echo ""

# Check Cloud SQL Instance
echo "1️⃣ Checking Cloud SQL instance..."
if gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID &> /dev/null; then
    echo "✅ Cloud SQL instance '$INSTANCE_NAME' exists"
    gcloud sql instances describe $INSTANCE_NAME --format="value(state,connectionName)" --project=$PROJECT_ID
else
    echo "❌ Cloud SQL instance '$INSTANCE_NAME' not found"
    echo "   Run: gcloud sql instances create $INSTANCE_NAME --database-version=POSTGRES_15 --tier=db-f1-micro --region=$REGION"
fi
echo ""

# Check databases
echo "2️⃣ Checking databases..."
for db in dev prod; do
    if gcloud sql databases describe $db --instance=$INSTANCE_NAME --project=$PROJECT_ID &> /dev/null; then
        echo "✅ Database '$db' exists"
    else
        echo "❌ Database '$db' not found"
        echo "   Run: gcloud sql databases create $db --instance=$INSTANCE_NAME"
    fi
done
echo ""

# Check secrets
echo "3️⃣ Checking Secret Manager secrets..."
for secret in backend-secret-key openai-api-key database-url-dev database-url-prod; do
    if gcloud secrets describe $secret --project=$PROJECT_ID &> /dev/null; then
        echo "✅ Secret '$secret' exists"
    else
        echo "❌ Secret '$secret' not found"
        echo "   Run: echo -n 'YOUR_VALUE' | gcloud secrets create $secret --data-file=-"
    fi
done
echo ""

# Check service account
echo "4️⃣ Checking service account..."
SA_EMAIL="synapse-backend@$PROJECT_ID.iam.gserviceaccount.com"
if gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID &> /dev/null; then
    echo "✅ Service account exists: $SA_EMAIL"

    # Check IAM roles
    echo "   Checking IAM roles..."
    POLICY=$(gcloud projects get-iam-policy $PROJECT_ID --flatten="bindings[].members" --format="table(bindings.role)" --filter="bindings.members:$SA_EMAIL")

    if echo "$POLICY" | grep -q "cloudsql.client"; then
        echo "   ✅ Has cloudsql.client role"
    else
        echo "   ❌ Missing cloudsql.client role"
    fi

    if echo "$POLICY" | grep -q "secretmanager.secretAccessor"; then
        echo "   ✅ Has secretmanager.secretAccessor role"
    else
        echo "   ❌ Missing secretmanager.secretAccessor role"
    fi

    if echo "$POLICY" | grep -q "storage"; then
        echo "   ✅ Has storage role"
    else
        echo "   ❌ Missing storage role"
    fi
else
    echo "❌ Service account not found: $SA_EMAIL"
    echo "   Run: gcloud iam service-accounts create synapse-backend --display-name='Synapse Backend'"
fi
echo ""

# Check GCS buckets
echo "5️⃣ Checking GCS buckets..."
for bucket in synapse-storage-dev synapse-storage-prod; do
    if gcloud storage buckets describe gs://$bucket --project=$PROJECT_ID &> /dev/null; then
        echo "✅ Bucket 'gs://$bucket' exists"
    else
        echo "❌ Bucket 'gs://$bucket' not found"
        echo "   Run: gcloud storage buckets create gs://$bucket --location=$REGION --uniform-bucket-level-access"
    fi
done
echo ""

# Check existing Cloud Run services
echo "6️⃣ Checking existing Cloud Run services..."
for service in synapse-backend-dev synapse-backend-prod; do
    if gcloud run services describe $service --region=$REGION --project=$PROJECT_ID &> /dev/null 2>&1; then
        URL=$(gcloud run services describe $service --region=$REGION --format='value(status.url)' --project=$PROJECT_ID)
        echo "✅ Service '$service' exists: $URL"
    else
        echo "ℹ️  Service '$service' not deployed yet (this is okay for first deployment)"
    fi
done
echo ""

echo "✨ Prerequisites check complete!"
echo ""
echo "Next steps:"
echo "1. If any prerequisites are missing, follow the instructions above to create them"
echo "2. See CLOUD_BUILD_BACKEND_SETUP.md for detailed setup instructions"
echo "3. Deploy backend: gcloud builds submit --config=backend/cloudbuild.yaml"
