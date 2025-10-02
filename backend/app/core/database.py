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
from sqlalchemy.pool import NullPool
import logging

from app.config import settings

logger = logging.getLogger(__name__)

# Import all models to register them with SQLAlchemy
from app.models.database import *  # noqa


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


# Create async engine with pgbouncer compatibility
# Use NullPool to disable connection pooling since pgbouncer handles pooling
engine = create_async_engine(
    str(settings.DATABASE_URL),
    poolclass=NullPool,  # Disable SQLAlchemy pooling, let pgbouncer handle it
    echo=False,  # Disable detailed SQL logging
    future=True,
    # Disable compiled cache to avoid prepared statement issues
    execution_options={
        "compiled_cache": {},
        # Force simple queries, no prepared statements
        "no_parameters": True,
        "render_postcompile": True,
    },
    # Critical: asyncpg connection parameters for pgbouncer compatibility
    connect_args={
        "server_settings": {
            "application_name": "synapse_backend",
        },
        "command_timeout": 60,
        # Disable prepared statements completely
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        # Force asyncpg to use simple query protocol
        "prepared_statement_name_func": lambda: None,
    }
)

# Create session maker

logger.info("Database engine created with pgbouncer compatibility settings")
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def init_db() -> None:
    """Initialize database tables."""
    # Skip database initialization during startup to avoid pgbouncer issues
    # The database connection will be tested when the first request is made
    logger.info("Skipping database initialization during startup")
    logger.info("Database connection will be tested on first request")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session."""
    try:
        async with AsyncSessionLocal() as session:
            try:
                yield session
            except Exception as e:
                logger.error(f"Database session error: {e}")
                await session.rollback()
                raise
            finally:
                await session.close()
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        if "DuplicatePreparedStatementError" in str(e):
            logger.error("pgbouncer prepared statement issue detected - check connection pool configuration")
        raise


async def close_db():
    """Close database connections."""
    await engine.dispose()
    logger.info("Database connections closed")