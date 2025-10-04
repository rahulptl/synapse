#!/bin/bash

# =============================================================================
# Synapse Local Development Initialization Script
# =============================================================================
# Description: One-command setup for local development with PostgreSQL + local storage
# Usage: ./scripts/init-local-dev.sh
# =============================================================================

set -e

echo "🚀 Initializing Synapse Local Development Environment"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Step 1: Stop any running containers
# =============================================================================
echo -e "${BLUE}1️⃣  Stopping any running containers...${NC}"
docker compose down 2>/dev/null || echo "No containers to stop"
echo ""

# =============================================================================
# Step 2: Create required directories
# =============================================================================
echo -e "${BLUE}2️⃣  Creating local storage directories...${NC}"
mkdir -p postgres_data
mkdir -p local_storage
mkdir -p backend/storage
echo -e "${GREEN}✅ Directories created${NC}"
echo ""

# =============================================================================
# Step 3: Check if init script exists
# =============================================================================
echo -e "${BLUE}3️⃣  Checking database initialization script...${NC}"
if [ ! -f "backend/init_local_db.sql" ]; then
    echo -e "${YELLOW}⚠️  Warning: backend/init_local_db.sql not found${NC}"
    echo "Database will start empty. Create the file and restart."
else
    echo -e "${GREEN}✅ Initialization script found${NC}"
fi
echo ""

# =============================================================================
# Step 4: Start PostgreSQL container
# =============================================================================
echo -e "${BLUE}4️⃣  Starting PostgreSQL container...${NC}"
docker compose up -d postgres
echo ""

# =============================================================================
# Step 5: Wait for PostgreSQL to be ready
# =============================================================================
echo -e "${BLUE}5️⃣  Waiting for PostgreSQL to be ready...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker exec synapse-postgres pg_isready -U synapse -d synapse_local > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready!${NC}"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${YELLOW}⚠️  PostgreSQL took longer than expected to start${NC}"
    echo "Check logs with: docker compose logs postgres"
fi
echo ""

# =============================================================================
# Step 6: Verify database tables
# =============================================================================
echo -e "${BLUE}6️⃣  Verifying database setup...${NC}"
TABLE_COUNT=$(docker exec synapse-postgres psql -U synapse -d synapse_local -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$TABLE_COUNT" -gt "0" ]; then
    echo -e "${GREEN}✅ Database initialized with $TABLE_COUNT tables${NC}"

    # Show test user info
    echo ""
    echo -e "${GREEN}📝 Test User Credentials:${NC}"
    echo "   Email:    test@synapse.local"
    echo "   Password: test123"
else
    echo -e "${YELLOW}⚠️  Database appears empty (no tables found)${NC}"
    echo "Check initialization logs with: docker compose logs postgres"
fi
echo ""

# =============================================================================
# Step 7: Start backend and frontend
# =============================================================================
echo -e "${BLUE}7️⃣  Starting backend and frontend services...${NC}"
docker compose up -d backend frontend
echo ""

# =============================================================================
# Step 8: Wait for backend health check
# =============================================================================
echo -e "${BLUE}8️⃣  Waiting for backend to be healthy...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is healthy!${NC}"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "  Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${YELLOW}⚠️  Backend health check timeout${NC}"
    echo "Check logs with: docker compose logs backend"
fi
echo ""

# =============================================================================
# Step 9: Show service status
# =============================================================================
echo -e "${BLUE}9️⃣  Checking service status...${NC}"
docker compose ps
echo ""

# =============================================================================
# Success Summary
# =============================================================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Local Development Environment Ready!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📱 Access Your Application:${NC}"
echo "   Frontend:    http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   API Docs:    http://localhost:8000/docs"
echo "   Health:      http://localhost:8000/health"
echo ""
echo -e "${BLUE}🗄️  Database:${NC}"
echo "   Host:     localhost:5432"
echo "   Database: synapse_local"
echo "   User:     synapse"
echo "   Password: localdev123"
echo ""
echo -e "${BLUE}👤 Test User:${NC}"
echo "   Email:    test@synapse.local"
echo "   Password: test123"
echo ""
echo -e "${BLUE}📂 Local Storage:${NC}"
echo "   Path: ./local_storage/"
echo ""
echo -e "${BLUE}🛠️  Useful Commands:${NC}"
echo "   View logs:         docker compose logs -f"
echo "   View backend logs: docker compose logs -f backend"
echo "   Stop services:     docker compose down"
echo "   Reset database:    ./scripts/reset-local-db.sh"
echo "   Restart services:  docker compose restart"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
