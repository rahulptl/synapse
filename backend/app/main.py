"""
FastAPI main application entry point.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn

# Configure logging first
from app.config import settings
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format=settings.LOG_FORMAT,
    handlers=[logging.StreamHandler()]
)

from app.api.v1.router import api_router
from app.core.database import init_db
from app.middleware.cors import setup_cors
from app.middleware.logging import setup_logging, configure_uvicorn_logging


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("Starting up Synapse API...")
    await init_db()
    logger.info("Database initialized")
    yield
    # Shutdown
    logger.info("Shutting down Synapse API...")


def create_application() -> FastAPI:
    """Create FastAPI application with all configurations."""

    app = FastAPI(
        title="Synapse API",
        description="Production-grade Knowledge Management and RAG API",
        version="1.0.0",
        docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
        redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
        lifespan=lifespan
    )

    # Setup middleware
    setup_cors(app)
    setup_logging(app)
    configure_uvicorn_logging()

    # Include API router
    app.include_router(api_router, prefix=settings.API_V1_STR)

    # Global exception handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Global exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )

    # Health check endpoint
    @app.get("/health")
    async def health_check():
        return {"status": "healthy", "environment": settings.ENVIRONMENT}

    return app


app = create_application()

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development"
    )