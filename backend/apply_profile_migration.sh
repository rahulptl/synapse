#!/bin/bash

# Database Migration Script for User Profile Fields
# Usage: ./apply_profile_migration.sh

set -e  # Exit on any error

echo "🔧 Applying User Profile Database Migration..."

# Get DATABASE_URL from environment file
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ ERROR: Environment file $ENV_FILE not found"
    echo "Please ensure the environment file exists"
    exit 1
fi

# Extract DATABASE_URL from environment file
DATABASE_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2)

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL not found in $ENV_FILE"
    echo "Please ensure DATABASE_URL is set in the environment file"
    exit 1
fi

echo "🔗 Using DATABASE_URL from $ENV_FILE"

# Apply the SQL migration from the migration file
MIGRATION_FILE="./MIGRATION_PROFILE_FIELDS.md"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ ERROR: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "📝 Reading migration from: $MIGRATION_FILE"

# Extract SQL from the markdown file
# This extracts the SQL block between ```sql and ``` markers
python3 << 'EOF'
import re
import sys
import os

try:
    # Get absolute path for migration file
    mig_file = os.path.abspath('$MIGRATION_FILE')
    print(f"Reading migration from: {mig_file}")

    with open(mig_file, 'r') as f:
        content = f.read()

    # Find SQL blocks
    sql_blocks = re.findall(r'```sql\n(.*?)\n```', content, re.DOTALL)

    if sql_blocks:
        sql_content = '\n'.join(sql_blocks)
        print(sql_content)
    else:
        print('-- No SQL blocks found in migration file')
        exit(1)
except Exception as e:
    print(f'Error reading migration file: {e}')
    exit(1)
EOF
> temp_migration.sql

if [ ! -s temp_migration.sql ]; then
    echo "❌ ERROR: Failed to extract SQL from migration file"
    exit 1
fi

echo "🚀 Applying migration to database..."

# Apply the migration
psql "$DATABASE_URL" -f temp_migration.sql

# Check if migration was successful
if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully!"
    echo ""
    echo "📊 Verification Query:"
    echo "You can verify the new columns with:"
    echo "psql \"\$DATABASE_URL\" -c \"\\d profiles\""
    echo ""
    echo "🔍 Check for these new columns:"
    echo "- job_title (TEXT)"
    echo "- company (TEXT)"
    echo "- industry (TEXT)"
    echo "- interests (JSONB)"
    echo "- communication_style (TEXT)"
    echo "- timezone (TEXT)"
    echo "- primary_goals (JSONB)"
    echo "- use_cases (JSONB)"
    echo "- preferred_response_length (TEXT)"
    echo "- topics_of_interest (JSONB)"
    echo "- profile_completed (BOOLEAN)"
    echo "- profile_completed_at (TIMESTAMP WITH TIME ZONE)"
else
    echo "❌ ERROR: Migration failed!"
    echo "Please check the error message above and fix manually"
    exit 1
fi

# Cleanup
rm -f temp_migration.sql

echo "🎉 Migration process completed!"