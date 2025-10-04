"""
CORS middleware setup for the application.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


def setup_cors(app: FastAPI) -> None:
    """
    Configure CORS middleware for the application.

    Args:
        app: FastAPI application instance
    """
    # Determine allowed origins based on environment
    if settings.ENVIRONMENT in ["development", "local"]:
        allowed_origins = [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            # Cloud Run development URLs (both old and new formats)
            "https://synapse-frontend-dev-7e75zz4oja-el.a.run.app",
            "https://synapse-frontend-dev-11007620517.asia-south1.run.app",
        ]
    else:
        # In production, be more restrictive
        allowed_origins = [
            "https://synapse-frontend-prod-7e75zz4oja-el.a.run.app",
            "https://synapse-frontend-prod-11007620517.asia-south1.run.app",
            # Add your custom domain here if you have one
        ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=[
            "Accept",
            "Accept-Language",
            "Content-Language",
            "Content-Type",
            "Authorization",
            "X-API-Key",
            "X-User-Id",
            "X-Requested-With",
            "Origin",
            "Cache-Control",
            "Pragma",
        ],
        expose_headers=[
            "Content-Length",
            "Content-Range",
            "Content-Type",
            "X-Total-Count",
        ],
        max_age=86400,  # 24 hours
    )