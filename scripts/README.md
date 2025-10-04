# Synapse Deployment Scripts

Collection of scripts for deploying and managing Synapse across different environments.

## Quick Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `dev-local.sh` | Local development with hot reload | `./scripts/dev-local.sh` |
| `rollback.sh` | Rollback Cloud Run deployments | `./scripts/rollback.sh <env> <service> [image]` |

## Local Development

### dev-local.sh

Start complete development environment with hot reload:

```bash
./scripts/dev-local.sh
```

**Features:**
- ✅ Auto-checks prerequisites (Docker, Node.js)
- ✅ Creates development Docker Compose config
- ✅ Starts all services (PostgreSQL, Backend, Redis, Frontend)
- ✅ Enables hot reload for instant updates
- ✅ Displays service URLs and helpful commands

**Services Started:**
- Frontend: http://localhost:5173 (Vite dev server)
- Backend: http://localhost:8000 (FastAPI with reload)
- Database: localhost:5432 (PostgreSQL + pgvector)
- Redis: localhost:6379 (Caching)

**What It Creates:**
- `docker-compose.dev.yml` - Development compose configuration
- `backend/Dockerfile.dev` - Backend development Dockerfile
- `logs/frontend-dev.log` - Frontend development logs

## Rollback

### rollback.sh

Rollback Cloud Run services to previous revisions:

```bash
# Rollback to previous revision
./scripts/rollback.sh dev backend
./scripts/rollback.sh prod frontend

# Rollback to specific image
./scripts/rollback.sh prod backend gcr.io/synapse-473918/synapse-backend:prod-20250104-143022
```

**Features:**
- ✅ Lists available revisions
- ✅ Shows current vs target deployment
- ✅ Requires confirmation for production
- ✅ Runs health checks after rollback
- ✅ Provides rollback-the-rollback command

**Arguments:**
1. `env` - Environment: `dev` or `prod`
2. `service` - Service: `backend` or `frontend`
3. `image` - (Optional) Specific image tag to rollback to

**Examples:**

```bash
# Rollback dev backend to previous revision
./scripts/rollback.sh dev backend

# Rollback prod frontend to specific image
./scripts/rollback.sh prod frontend gcr.io/synapse-473918/synapse-frontend:prod-20250103-120000

# Production requires typing 'ROLLBACK' to confirm
```

## Cloud Deployment

Cloud deployments use GitHub Actions workflows (not scripts):

- **Dev**: `.github/workflows/deploy-dev.yml`
- **Prod**: `.github/workflows/deploy-prod.yml`

See [DEPLOYMENT.md](../DEPLOYMENT.md) for details.

## Other Scripts

### Cloud SQL Management

Located in root `scripts/` directory:
- `cloud-sql-start.sh` - Start Cloud SQL proxy
- `cloud-sql-stop.sh` - Stop Cloud SQL proxy
- `reset-local-db.sh` - Reset local database
- `init-local-dev.sh` - Initialize local development environment

## Prerequisites

### All Scripts
- Bash shell
- Git

### Local Development (`dev-local.sh`)
- Docker (20.10+)
- Docker Compose (v2.0+)
- Node.js (18+) - optional but recommended

### Rollback (`rollback.sh`)
- gcloud CLI
- Authenticated to GCP project `synapse-473918`
- Appropriate IAM permissions (Cloud Run Admin)

## Authentication

### Local Development
No authentication needed - runs entirely locally.

### Cloud Operations (Rollback)

Authenticate with gcloud:
```bash
gcloud auth login
gcloud config set project synapse-473918
```

Verify authentication:
```bash
gcloud auth list
```

## Troubleshooting

### dev-local.sh

**Error: Docker not found**
```bash
# Install Docker
brew install --cask docker  # Mac
# or download from docker.com
```

**Error: Port already in use**
```bash
# Check what's using the port
lsof -i :5173  # Frontend
lsof -i :8000  # Backend

# Kill the process or change port
```

**Frontend not hot-reloading**
```bash
# Kill existing Vite
pkill -f vite

# Restart manually
cd frontend && npm run dev
```

### rollback.sh

**Error: Not authenticated**
```bash
gcloud auth login
gcloud config set project synapse-473918
```

**Error: Service not found**
```bash
# Verify service exists
gcloud run services list --region asia-south1

# Check you're using correct environment
./scripts/rollback.sh dev backend  # Not prod
```

**Rollback fails health check**
```bash
# Check service logs
gcloud run services logs read synapse-backend-dev --region asia-south1 --limit 50

# Manual verification
curl https://service-url/health
```

## Script Maintenance

### Adding New Scripts

1. Create script in `scripts/` directory
2. Make executable: `chmod +x scripts/new-script.sh`
3. Add shebang: `#!/bin/bash`
4. Add documentation header
5. Update this README
6. Update main DEPLOYMENT.md

### Naming Convention

- Kebab-case: `my-script.sh`
- Descriptive: `deploy-local.sh` not `dl.sh`
- Extension: `.sh` for bash scripts

### Script Template

```bash
#!/bin/bash
# Script Name: What it does
# Usage: ./scripts/script-name.sh [args]

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✓ ${1}${NC}"; }
print_error() { echo -e "${RED}✗ ${1}${NC}"; }

# Main logic
main() {
    print_success "Script completed"
}

main "$@"
```

## CI/CD Integration

### GitHub Actions

Scripts are used by GitHub Actions workflows:

```yaml
- name: Rollback on failure
  if: failure()
  run: ./scripts/rollback.sh prod backend
```

### Local Testing

Test workflows locally with [act](https://github.com/nektos/act):

```bash
# Install act
brew install act

# Run workflow locally
act workflow_dispatch -W .github/workflows/deploy-dev.yml
```

## Related Documentation

- [DEPLOYMENT.md](../DEPLOYMENT.md) - Complete deployment guide
- [setup-github-environment.md](./setup-github-environment.md) - GitHub environment setup
- [README.md](../README.md) - Project overview

## Support

For script issues:
1. Check this README
2. Check script output for errors
3. Review related documentation
4. Check GitHub Actions logs (for CI/CD issues)
