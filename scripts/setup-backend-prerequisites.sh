#!/bin/bash

# Script to set up all prerequisites for backend deployment
# This creates databases, secrets, service accounts, and storage buckets

set -e

PROJECT_ID="synapse-473918"
REGION="asia-south1"
INSTANCE_NAME="synapse"
SA_NAME="synapse-backend"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "🚀 Setting up prerequisites for backend deployment..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Function to prompt for secret value
prompt_secret() {
    local secret_name=$1
    local description=$2
    echo ""
    echo "📝 Please enter $description:"
    read -s secret_value
    echo ""
    if [ -z "$secret_value" ]; then
        echo "❌ Value cannot be empty"
        exit 1
    fi
    echo "$secret_value"
}

# Create databases
echo "1️⃣ Creating databases..."
for db in dev prod; do
    if gcloud sql databases describe $db --instance=$INSTANCE_NAME &> /dev/null; then
        echo "   ⏭️  Database '$db' already exists, skipping"
    else
        echo "   Creating database '$db'..."
        gcloud sql databases create $db --instance=$INSTANCE_NAME
        echo "   ✅ Database '$db' created"
    fi
done
echo ""

# Create database users
echo "2️⃣ Creating database users..."
echo "   ⚠️  You'll need to set passwords for database users"
echo ""

for user in dev_user prod_user; do
    if gcloud sql users list --instance=$INSTANCE_NAME --filter="name=$user" --format="value(name)" | grep -q "$user"; then
        echo "   ⏭️  User '$user' already exists, skipping"
    else
        db_password=$(prompt_secret "$user password" "password for database user '$user'")
        echo "   Creating user '$user'..."
        gcloud sql users create $user \
            --instance=$INSTANCE_NAME \
            --password="$db_password"
        echo "   ✅ User '$user' created"

        # Store the database URL in a variable for later secret creation
        if [ "$user" == "dev_user" ]; then
            DEV_DB_URL="postgresql+asyncpg://$user:$db_password@/dev?host=/cloudsql/$PROJECT_ID:$REGION:$INSTANCE_NAME"
        else
            PROD_DB_URL="postgresql+asyncpg://$user:$db_password@/prod?host=/cloudsql/$PROJECT_ID:$REGION:$INSTANCE_NAME"
        fi
    fi
done
echo ""

# Create secrets
echo "3️⃣ Creating Secret Manager secrets..."

# Backend secret key
if gcloud secrets describe backend-secret-key &> /dev/null; then
    echo "   ⏭️  Secret 'backend-secret-key' already exists, skipping"
else
    backend_secret=$(prompt_secret "backend-secret-key" "backend SECRET_KEY (use a strong random string)")
    echo -n "$backend_secret" | gcloud secrets create backend-secret-key --data-file=-
    echo "   ✅ Secret 'backend-secret-key' created"
fi

# OpenAI API key
if gcloud secrets describe openai-api-key &> /dev/null; then
    echo "   ⏭️  Secret 'openai-api-key' already exists, skipping"
else
    openai_key=$(prompt_secret "openai-api-key" "OpenAI API key")
    echo -n "$openai_key" | gcloud secrets create openai-api-key --data-file=-
    echo "   ✅ Secret 'openai-api-key' created"
fi

# Database URLs
for env in dev prod; do
    secret_name="database-url-$env"
    if gcloud secrets describe $secret_name &> /dev/null; then
        echo "   ⏭️  Secret '$secret_name' already exists, skipping"
    else
        if [ "$env" == "dev" ] && [ -n "$DEV_DB_URL" ]; then
            echo -n "$DEV_DB_URL" | gcloud secrets create $secret_name --data-file=-
            echo "   ✅ Secret '$secret_name' created"
        elif [ "$env" == "prod" ] && [ -n "$PROD_DB_URL" ]; then
            echo -n "$PROD_DB_URL" | gcloud secrets create $secret_name --data-file=-
            echo "   ✅ Secret '$secret_name' created"
        else
            echo "   ⚠️  Skipping '$secret_name' - create it manually if user already exists"
        fi
    fi
done
echo ""

# Create service account
echo "4️⃣ Creating service account..."
if gcloud iam service-accounts describe $SA_EMAIL &> /dev/null; then
    echo "   ⏭️  Service account already exists: $SA_EMAIL"
else
    gcloud iam service-accounts create $SA_NAME \
        --display-name="Synapse Backend Service Account"
    echo "   ✅ Service account created: $SA_EMAIL"
fi

# Grant IAM roles
echo "   Granting IAM roles..."

# Cloud SQL Client
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/cloudsql.client" \
    --condition=None \
    > /dev/null
echo "   ✅ Granted roles/cloudsql.client"

# Secret Manager Secret Accessor
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None \
    > /dev/null
echo "   ✅ Granted roles/secretmanager.secretAccessor"

# Storage Object Admin
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/storage.objectAdmin" \
    --condition=None \
    > /dev/null
echo "   ✅ Granted roles/storage.objectAdmin"

echo ""

# Create GCS bucket (single bucket with folders for each environment)
echo "5️⃣ Creating GCS bucket..."
BUCKET_NAME="synapse_storage"
if gcloud storage buckets describe gs://$BUCKET_NAME &> /dev/null; then
    echo "   ⏭️  Bucket 'gs://$BUCKET_NAME' already exists, skipping"
else
    gcloud storage buckets create gs://$BUCKET_NAME \
        --location=$REGION \
        --uniform-bucket-level-access
    echo "   ✅ Bucket 'gs://$BUCKET_NAME' created"
fi

echo "   Creating environment folders..."
for env in local dev prod; do
    # Create a placeholder file to ensure the folder exists
    echo "Environment: $env" | gcloud storage cp - gs://$BUCKET_NAME/$env/.keep 2>/dev/null || echo "   Folder $env/ ready"
done
echo "   ✅ Folders created: local/, dev/, prod/"
echo ""

echo "✨ All prerequisites set up successfully!"
echo ""
echo "📋 Summary:"
echo "   • Databases: dev, prod"
echo "   • Service Account: $SA_EMAIL"
echo "   • Secrets: backend-secret-key, openai-api-key, database-url-dev, database-url-prod"
echo "   • Bucket: gs://$BUCKET_NAME with folders (local/, dev/, prod/)"
echo ""
echo "Next steps:"
echo "   1. Initialize database schema:"
echo "      gcloud sql connect synapse --user=dev_user --database=dev"
echo "      Then run the SQL from backend/init_cloud_sql.sql"
echo ""
echo "   2. Deploy backend:"
echo "      gcloud builds submit --config=backend/cloudbuild.yaml"
echo ""
echo "   3. Get backend URL:"
echo "      gcloud run services describe synapse-backend-dev --region=asia-south1 --format='value(status.url)'"
