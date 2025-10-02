"""
Logging middleware and configuration.
"""
import logging
import time
from typing import Callable
from fastapi import FastAPI, Request, Response
from fastapi.routing import APIRoute

from app.config import settings


def setup_logging(app: FastAPI) -> None:
    """
    Configure logging for the application.

    Args:
        app: FastAPI application instance
    """
    # Configure specific loggers
    loggers_to_configure = [
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
        "fastapi",
        "app",
    ]

    for logger_name in loggers_to_configure:
        logger = logging.getLogger(logger_name)
        logger.setLevel(getattr(logging, settings.LOG_LEVEL.upper()))

    # Explicitly disable all SQLAlchemy logging regardless of LOG_LEVEL
    sql_loggers = [
        "sqlalchemy",
        "sqlalchemy.engine",
        "sqlalchemy.engine.Engine",
        "sqlalchemy.pool",
        "sqlalchemy.dialects",
        "sqlalchemy.orm"
    ]

    for logger_name in sql_loggers:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.CRITICAL)
        logger.propagate = False

    # Add request logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next: Callable) -> Response:
        """Log HTTP requests and responses."""
        start_time = time.time()

        # Process request
        response = await call_next(request)

        # Calculate duration
        duration = time.time() - start_time

        # Only log errors, slow requests, or in development mode
        logger = logging.getLogger("app.requests")
        should_log = (
            response.status_code >= 400 or  # Error responses
            duration > 2.0 or  # Slow requests (>2s)
            settings.ENVIRONMENT == "development"  # All requests in dev
        )

        if should_log:
            log_level = logging.ERROR if response.status_code >= 500 else logging.INFO
            logger.log(
                log_level,
                f"{response.status_code} {request.method} {request.url.path} ({duration:.3f}s)"
            )

        return response

    # Add security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next: Callable) -> Response:
        """Add security headers to responses."""
        response = await call_next(request)

        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Add HSTS header in production
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response


class EndpointFilter(logging.Filter):
    """Filter to exclude certain endpoints from logging."""

    def __init__(self, paths_to_exclude: list = None):
        super().__init__()
        self.paths_to_exclude = paths_to_exclude or ["/health", "/docs", "/redoc", "/openapi.json"]

    def filter(self, record: logging.LogRecord) -> bool:
        """Filter log records."""
        if hasattr(record, "args") and len(record.args) >= 3:
            path = record.args[2]
            return path not in self.paths_to_exclude
        return True


def configure_uvicorn_logging():
    """Configure uvicorn logging to reduce noise."""
    # Filter out health check and docs endpoints from access logs
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

    # Completely disable all SQLAlchemy logging
    sql_loggers = [
        "sqlalchemy",
        "sqlalchemy.engine",
        "sqlalchemy.engine.Engine",
        "sqlalchemy.pool",
        "sqlalchemy.dialects",
        "sqlalchemy.orm",
        "sqlalchemy.pool.impl.QueuePool",
        "sqlalchemy.pool.impl.NullPool"
    ]

    for logger_name in sql_loggers:
        logger = logging.getLogger(logger_name)
        logger.setLevel(logging.CRITICAL)  # Only show critical errors
        logger.propagate = False  # Don't propagate to parent loggers