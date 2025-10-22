#!/bin/bash

# Simple Migration Script for Profile Fields
# Usage: ./apply_simple_migration.sh

set -e

echo "🔧 Applying Profile Migration to Docker Container..."

# Apply migration
docker exec synapse-backend psql -U synapse:localdev123 -d synapse_local -f migrate_profile.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully!"
    echo ""
    echo "🔍 Verification:"
    docker exec synapse-backend psql -U synapse:localdev123 -d synapse_local -c "\d profiles" | head -20
else
    echo "❌ Migration failed!"
    echo "Check the error message above"
    exit 1
fi

echo "🎉 Migration complete!"