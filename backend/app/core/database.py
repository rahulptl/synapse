"""
Database connection and session management.
"""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
import logging
import re

from app.config import settings

logger = logging.getLogger(__name__)

# Import all models to register them with SQLAlchemy
from app.models.database import *  # noqa


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


def get_database_url() -> str:
    """Get database URL with Cloud SQL socket path if configured."""
    base_url = str(settings.DATABASE_URL)

    # If running on Cloud Run with Cloud SQL connection
    if settings.CLOUD_SQL_CONNECTION_NAME:
        # Replace host:port pattern with Cloud SQL Unix socket path
        # Pattern: postgresql+asyncpg://user:pass@host:port/dbname
        # Becomes: postgresql+asyncpg://user:pass@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE

        # Remove host and port, add Cloud SQL socket path
        base_url = re.sub(
            r'@[^/]+/',
            f'@/',
            base_url
        )

        # Add host parameter for Cloud SQL socket
        if '?' in base_url:
            base_url += f'&host=/cloudsql/{settings.CLOUD_SQL_CONNECTION_NAME}'
        else:
            base_url += f'?host=/cloudsql/{settings.CLOUD_SQL_CONNECTION_NAME}'

    return base_url


# Create async engine with standard SQLAlchemy connection pooling
engine = create_async_engine(
    get_database_url(),
    pool_size=settings.DATABASE_POOL_SIZE,  # Default: 5
    max_overflow=settings.DATABASE_MAX_OVERFLOW,  # Default: 10
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=3600,  # Recycle connections after 1 hour
    echo=False,  # Disable detailed SQL logging
    future=True,
    connect_args={
        "server_settings": {
            "application_name": "synapse_backend",
        },
        "command_timeout": 60,
    }
)

# Create session maker
logger.info(f"Database engine created with standard SQLAlchemy pooling (pool_size={settings.DATABASE_POOL_SIZE}, max_overflow={settings.DATABASE_MAX_OVERFLOW})")
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def init_db() -> None:
    """Initialize database tables."""
    logger.info("Database initialization complete")
    logger.info("Using standard SQLAlchemy connection pooling")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            logger.error(f"Database session error: {e}")
            await session.rollback()
            raise
        finally:
            await session.close()


async def close_db():
    """Close database connections."""
    await engine.dispose()
    logger.info("Database connections closed")