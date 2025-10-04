#!/bin/bash

# =============================================================================
# Synapse Local Database Reset Script
# =============================================================================
# Description: Quickly reset local PostgreSQL database to clean state
# Usage: ./scripts/reset-local-db.sh
# =============================================================================

set -e

echo "🔄 Resetting Local PostgreSQL Database"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# =============================================================================
# Confirmation prompt
# =============================================================================
echo -e "${RED}⚠️  WARNING: This will DELETE ALL LOCAL DATA!${NC}"
echo ""
echo "This will:"
echo "  • Stop all running containers"
echo "  • Delete postgres_data/ directory"
echo "  • Delete local_storage/ directory"
echo "  • Restart PostgreSQL with fresh database"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Reset cancelled"
    exit 0
fi

echo ""

# =============================================================================
# Step 1: Stop all containers
# =============================================================================
echo -e "${BLUE}1️⃣  Stopping all containers...${NC}"
docker compose down
echo -e "${GREEN}✅ Containers stopped${NC}"
echo ""

# =============================================================================
# Step 2: Remove data directories
# =============================================================================
echo -e "${BLUE}2️⃣  Removing data directories...${NC}"

if [ -d "postgres_data" ]; then
    rm -rf postgres_data
    echo -e "${GREEN}✅ Removed postgres_data/${NC}"
else
    echo "   postgres_data/ doesn't exist"
fi

if [ -d "local_storage" ]; then
    rm -rf local_storage
    echo -e "${GREEN}✅ Removed local_storage/${NC}"
else
    echo "   local_storage/ doesn't exist"
fi

if [ -d "backend/storage" ]; then
    rm -rf backend/storage
    echo -e "${GREEN}✅ Removed backend/storage/${NC}"
else
    echo "   backend/storage/ doesn't exist"
fi

echo ""

# =============================================================================
# Step 3: Recreate directories
# =============================================================================
echo -e "${BLUE}3️⃣  Recreating directories...${NC}"
mkdir -p postgres_data
mkdir -p local_storage
mkdir -p backend/storage
echo -e "${GREEN}✅ Directories created${NC}"
echo ""

# =============================================================================
# Step 4: Start PostgreSQL
# =============================================================================
echo -e "${BLUE}4️⃣  Starting fresh PostgreSQL container...${NC}"
docker compose up -d postgres
echo ""

# =============================================================================
# Step 5: Wait for PostgreSQL to be ready
# =============================================================================
echo -e "${BLUE}5️⃣  Waiting for PostgreSQL to initialize...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker exec synapse-postgres pg_isready -U synapse -d synapse_local > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready!${NC}"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Initializing... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ PostgreSQL failed to start${NC}"
    echo "Check logs with: docker compose logs postgres"
    exit 1
fi
echo ""

# =============================================================================
# Step 6: Verify database
# =============================================================================
echo -e "${BLUE}6️⃣  Verifying database setup...${NC}"
TABLE_COUNT=$(docker exec synapse-postgres psql -U synapse -d synapse_local -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | tr -d ' ')

if [ "$TABLE_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✅ Database initialized with $TABLE_COUNT tables${NC}"
else
    echo -e "${YELLOW}⚠️  Database is empty (0 tables)${NC}"
    echo "Make sure backend/init_local_db.sql exists"
fi
echo ""

# =============================================================================
# Step 7: Optionally start backend and frontend
# =============================================================================
echo -e "${BLUE}7️⃣  Starting backend and frontend...${NC}"
docker compose up -d backend frontend
echo ""

echo "Waiting for services to start..."
sleep 5
echo ""

# =============================================================================
# Success Summary
# =============================================================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Database Reset Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📊 Database Status:${NC}"
echo "   Tables: $TABLE_COUNT"
echo "   Database: synapse_local"
echo "   User: synapse"
echo ""
echo -e "${BLUE}👤 Test User Available:${NC}"
echo "   Email:    test@synapse.local"
echo "   Password: test123"
echo ""
echo -e "${BLUE}🌐 Services:${NC}"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo -e "${BLUE}📝 Next Steps:${NC}"
echo "   • View logs: docker compose logs -f"
echo "   • Access frontend and login with test user"
echo "   • Check backend health: curl http://localhost:8000/health"
echo ""
echo -e "${GREEN}Fresh start ready! 🚀${NC}"
