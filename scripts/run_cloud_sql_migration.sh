#!/bin/bash

# ============================================================================
# Cloud SQL Migration Runner Script
# ============================================================================
# Description: Automated script to run the Cloud SQL migration safely
# Usage: ./scripts/run_cloud_sql_migration.sh [dev|prod|local]
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="synapse-473918"
INSTANCE_NAME="synapse"
BUCKET_NAME="synapse-bucket-473918"
MIGRATION_FILE="backend/migrations/sync_cloud_sql_to_new_architecture.sql"

# Get database name from argument (default: dev)
DATABASE="${1:-dev}"

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Cloud SQL Migration Script${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "Project: ${GREEN}${PROJECT_ID}${NC}"
echo -e "Instance: ${GREEN}${INSTANCE_NAME}${NC}"
echo -e "Database: ${GREEN}${DATABASE}${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""

# ============================================================================
# Step 1: Confirmation
# ============================================================================

echo -e "${YELLOW}⚠️  This will modify your Cloud SQL database schema${NC}"
echo -e "${YELLOW}⚠️  Make sure you have a backup before proceeding${NC}"
echo ""
read -p "Do you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${RED}❌ Migration cancelled${NC}"
    exit 0
fi

# ============================================================================
# Step 2: Create Backup
# ============================================================================

echo ""
echo -e "${BLUE}📦 Step 1: Creating database backup...${NC}"
BACKUP_FILE="backups/pre-migration-${DATABASE}-$(date +%Y%m%d_%H%M%S).sql"
BACKUP_PATH="gs://${BUCKET_NAME}/${BACKUP_FILE}"

echo "Backup path: ${BACKUP_PATH}"

if gcloud sql export sql ${INSTANCE_NAME} ${BACKUP_PATH} \
    --database=${DATABASE} \
    --project=${PROJECT_ID}; then
    echo -e "${GREEN}✓ Backup created successfully${NC}"
else
    echo -e "${RED}❌ Backup failed. Aborting migration.${NC}"
    exit 1
fi

# ============================================================================
# Step 3: Upload Migration Script to Cloud Storage
# ============================================================================

echo ""
echo -e "${BLUE}📤 Step 2: Uploading migration script...${NC}"
MIGRATION_PATH="gs://${BUCKET_NAME}/migrations/sync_cloud_sql_to_new_architecture.sql"

if gsutil cp ${MIGRATION_FILE} ${MIGRATION_PATH}; then
    echo -e "${GREEN}✓ Migration script uploaded${NC}"
else
    echo -e "${RED}❌ Upload failed. Aborting migration.${NC}"
    exit 1
fi

# ============================================================================
# Step 4: Run Migration
# ============================================================================

echo ""
echo -e "${BLUE}🚀 Step 3: Running migration...${NC}"
echo "This may take a few minutes..."

if gcloud sql import sql ${INSTANCE_NAME} ${MIGRATION_PATH} \
    --database=${DATABASE} \
    --project=${PROJECT_ID}; then
    echo -e "${GREEN}✓ Migration completed successfully${NC}"
else
    echo -e "${RED}❌ Migration failed!${NC}"
    echo -e "${YELLOW}💡 You can restore from backup: ${BACKUP_PATH}${NC}"
    exit 1
fi

# ============================================================================
# Step 5: Verification
# ============================================================================

echo ""
echo -e "${BLUE}✅ Step 4: Verifying migration...${NC}"
echo "Please run the following command to verify:"
echo ""
echo -e "${GREEN}gcloud sql connect ${INSTANCE_NAME} --user=postgres --database=${DATABASE}${NC}"
echo ""
echo "Then run these verification queries:"
echo ""
echo -e "${YELLOW}-- Check new tables exist${NC}"
echo "\\dt gcs_files"
echo "\\dt openai_files"
echo ""
echo -e "${YELLOW}-- Verify knowledge_items schema${NC}"
echo "\\d knowledge_items"
echo ""
echo -e "${YELLOW}-- Check migration results${NC}"
echo "SELECT * FROM v_knowledge_items_full LIMIT 5;"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Migration process completed${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 Summary:${NC}"
echo "  • Backup created: ${BACKUP_PATH}"
echo "  • Migration applied to: ${DATABASE}"
echo "  • Old tables preserved (can be dropped manually later)"
echo ""
echo -e "${YELLOW}🔍 Next Steps:${NC}"
echo "  1. Verify the migration using the commands above"
echo "  2. Test uploading a new file"
echo "  3. Test creating a text entry"
echo "  4. Review the migration guide: backend/migrations/CLOUD_SQL_MIGRATION_GUIDE.md"
echo ""
echo -e "${YELLOW}⚠️  Important:${NC}"
echo "  • Old tables (files, vectors, document_summaries) are preserved"
echo "  • Drop them manually only after confirming everything works"
echo "  • Keep the backup for at least 7 days"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
