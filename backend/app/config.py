"""
Application configuration management.
"""
from functools import lru_cache
from typing import Optional
from pydantic import PostgresDsn, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Environment
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: PostgresDsn
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10

    # Security
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # External APIs
    OPENAI_API_KEY: str

    # Storage
    STORAGE_BACKEND: str = "supabase"  # supabase, s3, gcs, local
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_JWT_SECRET: Optional[str] = None
    SUPABASE_STORAGE_BUCKET: str = "zyph-storage"

    # S3 (if using S3 backend)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_S3_REGION: Optional[str] = None
    AWS_S3_ENDPOINT_URL: Optional[str] = None

    # GCS (Google Cloud Storage)
    GCS_BUCKET_NAME: Optional[str] = None
    GCS_PROJECT_ID: Optional[str] = None
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None  # Path to service account JSON (local dev only)

    # Cloud SQL
    CLOUD_SQL_CONNECTION_NAME: Optional[str] = None  # Format: PROJECT_ID:REGION:INSTANCE_NAME

    # Processing
    MAX_CONTENT_SIZE_MB: int = 50
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50
    SIMILARITY_THRESHOLD: float = 0.7
    EMBEDDING_MODEL: str = "text-embedding-ada-002"

    # Chat
    CHAT_MODEL: str = "gpt-4o-mini"  # OpenAI chat model
    MAX_CHAT_HISTORY: int = 10
    CHAT_TIMEOUT_SECONDS: int = 60  # Increased for complex RAG responses

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # Logging
    LOG_LEVEL: str = "INFO"  # INFO for production, DEBUG for development
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # Redis (for caching and background tasks)
    REDIS_URL: Optional[str] = None
    ENABLE_CACHING: bool = True
    CACHE_TTL_SECONDS: int = 3600

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: Optional[str]) -> str:
        if isinstance(v, str):
            return v
        raise ValueError("DATABASE_URL must be provided")

    @field_validator("STORAGE_BACKEND")
    @classmethod
    def validate_storage_backend(cls, v: str) -> str:
        if v not in ["supabase", "s3", "gcs", "local"]:
            raise ValueError("STORAGE_BACKEND must be one of: supabase, s3, gcs, local")
        return v

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore"  # Ignore extra fields from .env file
    }


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()