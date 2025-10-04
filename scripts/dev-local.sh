#!/bin/bash
# Local Development Deployment with Hot Reload
# This script sets up the complete development environment with hot-reload enabled

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_info() {
    echo -e "${BLUE}ℹ ${1}${NC}"
}

print_success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

print_error() {
    echo -e "${RED}✗ ${1}${NC}"
}

print_header() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  $1${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    print_success "Docker is installed"

    # Check Docker Compose
    if ! command -v docker compose &> /dev/null && ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    print_success "Docker Compose is installed"

    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
    print_success "Docker daemon is running"

    # Check Node.js (for frontend hot reload)
    if ! command -v node &> /dev/null; then
        print_warning "Node.js not found. Frontend will run in container (slower hot reload)"
        FRONTEND_MODE="container"
    else
        print_success "Node.js is installed (version: $(node --version))"
        FRONTEND_MODE="host"
    fi
}

# Create docker-compose.dev.yml for hot reload
create_dev_compose() {
    print_header "Creating Development Docker Compose Configuration"

    cat > docker-compose.dev.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: ankane/pgvector:latest
    container_name: synapse-postgres-dev
    environment:
      POSTGRES_DB: synapse_local
      POSTGRES_USER: synapse
      POSTGRES_PASSWORD: localdev123
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
      - ./backend/init_local_db.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - synapse-dev-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U synapse -d synapse_local"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    container_name: synapse-backend-dev
    ports:
      - "8000:8000"
    env_file:
      - ./backend/.env.local
    volumes:
      # Hot reload: mount entire backend directory
      - ./backend:/app
      # Exclude these to prevent conflicts
      - /app/__pycache__
      - /app/.pytest_cache
      # Mount local file storage
      - ./local_storage:/app/storage
    environment:
      ENVIRONMENT: local
      DATABASE_URL: postgresql+asyncpg://synapse:localdev123@postgres:5432/synapse_local
      STORAGE_BACKEND: local
      LOCAL_STORAGE_PATH: /app/storage
      PYTHONUNBUFFERED: 1
      # Enable hot reload with watchdog
      RELOAD: "true"
    command: >
      sh -c "
        pip install watchdog &&
        uvicorn app.main:app
          --host 0.0.0.0
          --port 8000
          --reload
          --reload-dir /app/app
          --log-level debug
      "
    networks:
      - synapse-dev-network
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s

  # Redis for caching (optional but recommended)
  redis:
    image: redis:7-alpine
    container_name: synapse-redis-dev
    ports:
      - "6379:6379"
    networks:
      - synapse-dev-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

networks:
  synapse-dev-network:
    driver: bridge

volumes:
  postgres_dev_data:
EOF

    print_success "Created docker-compose.dev.yml"
}

# Create Dockerfile.dev for backend
create_backend_dev_dockerfile() {
    print_header "Creating Backend Development Dockerfile"

    cat > backend/Dockerfile.dev << 'EOF'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install development dependencies
RUN pip install --no-cache-dir \
    watchdog \
    pytest \
    pytest-asyncio \
    httpx

# Create directories
RUN mkdir -p /app/keys /app/storage

# The app directory will be mounted as volume for hot reload
# No need to COPY app here

EXPOSE 8000

# Command will be overridden in docker-compose.dev.yml
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
EOF

    print_success "Created backend/Dockerfile.dev"
}

# Stop existing containers
stop_existing() {
    print_header "Stopping Existing Containers"

    # Stop production compose
    if docker ps -q --filter "name=synapse-frontend" --filter "name=synapse-backend" | grep -q .; then
        print_info "Stopping production containers..."
        docker compose down 2>/dev/null || true
        print_success "Production containers stopped"
    fi

    # Stop dev compose
    if docker ps -q --filter "name=synapse-.*-dev" | grep -q .; then
        print_info "Stopping existing dev containers..."
        docker compose -f docker-compose.dev.yml down 2>/dev/null || true
        print_success "Dev containers stopped"
    fi
}

# Start development environment
start_dev_environment() {
    print_header "Starting Development Environment"

    print_info "Building and starting services..."
    docker compose -f docker-compose.dev.yml up -d --build

    print_success "Services started!"
    echo ""
    print_info "Waiting for services to be healthy..."
    sleep 5

    # Check health
    check_service_health
}

# Check service health
check_service_health() {
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker exec synapse-postgres-dev pg_isready -U synapse -d synapse_local &> /dev/null; then
            print_success "PostgreSQL is ready"
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:8000/health &> /dev/null; then
            print_success "Backend is ready"
            break
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
}

# Setup frontend for hot reload
setup_frontend() {
    print_header "Setting Up Frontend"

    if [ "$FRONTEND_MODE" = "host" ]; then
        print_info "Starting frontend on host for faster hot reload..."

        # Check if node_modules exists
        if [ ! -d "frontend/node_modules" ]; then
            print_info "Installing frontend dependencies..."
            cd frontend
            npm install
            cd ..
            print_success "Frontend dependencies installed"
        fi

        # Kill existing frontend dev server
        pkill -f "vite" 2>/dev/null || true

        # Start Vite dev server in background
        print_info "Starting Vite dev server..."
        cd frontend
        npm run dev > ../logs/frontend-dev.log 2>&1 &
        cd ..

        sleep 3
        print_success "Frontend dev server started on http://localhost:5173"
    else
        print_info "Frontend will run in Docker container (use npm run dev manually for hot reload)"
    fi
}

# Print access information
print_access_info() {
    print_header "Development Environment Ready!"

    echo -e "${GREEN}Services:${NC}"
    echo "  • Frontend:   http://localhost:5173 (Vite dev server with hot reload)"
    echo "  • Backend:    http://localhost:8000 (FastAPI with auto-reload)"
    echo "  • Database:   postgresql://synapse:localdev123@localhost:5432/synapse_local"
    echo "  • Redis:      redis://localhost:6379/0"
    echo ""
    echo -e "${GREEN}API Documentation:${NC}"
    echo "  • Swagger UI: http://localhost:8000/docs"
    echo "  • ReDoc:      http://localhost:8000/redoc"
    echo ""
    echo -e "${YELLOW}Hot Reload Enabled:${NC}"
    echo "  • Backend:  Edit files in backend/app/ - changes auto-reload"
    echo "  • Frontend: Edit files in frontend/src/ - changes reflect instantly"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo "  • View logs:        docker compose -f docker-compose.dev.yml logs -f"
    echo "  • Backend logs:     docker logs synapse-backend-dev -f"
    echo "  • Database shell:   docker exec -it synapse-postgres-dev psql -U synapse -d synapse_local"
    echo "  • Redis CLI:        docker exec -it synapse-redis-dev redis-cli"
    echo "  • Stop all:         docker compose -f docker-compose.dev.yml down"
    echo "  • Rebuild:          docker compose -f docker-compose.dev.yml up -d --build"
    echo ""
    echo -e "${GREEN}Log Files:${NC}"
    echo "  • Frontend: logs/frontend-dev.log"
    echo ""
}

# Create logs directory
mkdir -p logs

# Main execution
main() {
    print_header "Synapse Local Development Setup"

    check_prerequisites
    create_dev_compose
    create_backend_dev_dockerfile
    stop_existing
    start_dev_environment
    setup_frontend
    print_access_info

    # Follow logs option
    echo -e "${YELLOW}Press Ctrl+C to stop following logs (services will keep running)${NC}"
    echo ""
    sleep 2
    docker compose -f docker-compose.dev.yml logs -f
}

# Run main function
main
