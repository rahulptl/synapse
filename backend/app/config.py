"""
Application configuration management.
"""
from functools import lru_cache
from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Environment
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str  # Changed from PostgresDsn to support Cloud SQL Unix socket format
    DATABASE_POOL_SIZE: int = 10  # Standard SQLAlchemy connection pool size
    DATABASE_MAX_OVERFLOW: int = 20  # Allow up to 30 connections total (pool_size + max_overflow)

    # Security
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # External APIs
    OPENAI_API_KEY: str

    # OpenAI Vector Stores
    ENABLE_OPENAI_VECTOR_STORES: bool = True  # Feature flag for OpenAI vector stores
    OPENAI_VECTOR_STORE_EXPIRATION_DAYS: int = 365  # Vector store expiration (default: 1 year)
    OPENAI_FILE_PURPOSE: str = "user_data"  # Default purpose for file uploads
    OPENAI_FILE_EXPIRATION_DAYS: int = 30  # File expiration in days
    OPENAI_MAX_FILE_SIZE_MB: int = 512  # Max file size for standard uploads
    OPENAI_MAX_SEARCH_RESULTS: int = 20  # Max results from vector search
    OPENAI_RESPONSES_MODEL: str = "gpt-5"  # Model for Responses API

    # AI Response Configuration - Structured Responses
    AI_RESPONSE_TEMPERATURE: float = 0.7  # Temperature for balanced responses
    AI_RESPONSE_VERBOSITY: str = "medium"  # low, medium, high
    AI_RESPONSE_TOP_P: float = 0.9  # Nucleus sampling for focused output
    AI_PRESENCE_PENALTY: float = 0.1  # Slight penalty to reduce major repetition
    AI_FREQUENCY_PENALTY: float = 0.1  # Slight penalty to reduce word repetition
    AI_RESPONSE_MAX_TOKENS: Optional[int] = None  # No artificial limits - let responses be complete
    OPENAI_RESPONSES_TEMPERATURE: float = 0.7  # Legacy - use AI_RESPONSE_TEMPERATURE
    OPENAI_RESPONSES_MAX_OUTPUT_TOKENS: Optional[int] = None  # Legacy - use AI_RESPONSE_MAX_TOKENS

    # Storage
    STORAGE_BACKEND: str = "gcs"  # supabase, s3, gcs, local
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
    CHUNK_SIZE: int = 500  # Legacy chunking (characters)
    CHUNK_OVERLAP: int = 0  # Legacy chunking overlap - disabled since hybrid search handles boundaries
    SIMILARITY_THRESHOLD: float = 0.7
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_DIMENSIONS: int = 1536

    # Smart Chunking (Docling)
    ENABLE_SMART_CHUNKING: bool = True  # Use Docling's structure-aware chunking when available
    SMART_CHUNK_MAX_TOKENS: int = 512  # Max tokens per chunk (~500-600 chars with metadata)

    # Document Processing Models
    PRELOAD_MODELS_ON_STARTUP: bool = True  # Preload Docling and EasyOCR models at startup
    DOCLING_MODELS_PATH: Optional[str] = None  # Path to Docling models (default: ~/.cache/docling/models)
    EASYOCR_MODELS_PATH: Optional[str] = None  # Path to EasyOCR models (default: ~/.EasyOCR)
    OCR_LANGUAGES: str = "en"  # Comma-separated list of languages for OCR (e.g., "en,es,fr")
    ENABLE_GPU_ACCELERATION: bool = True  # Auto-detect and use GPU if available

    # Chat
    CHAT_MODEL: str = "gpt-5"  # OpenAI chat model
    MAX_CHAT_HISTORY: int = 10
    CHAT_TIMEOUT_SECONDS: int = 60  # Increased for complex RAG responses
    MAX_CONTEXT_TOKENS: int = 120000  # Max tokens for context (leave 8k for response buffer)
    AUTO_MAPREDUCE_THRESHOLD: int = 100000  # Auto-route to map-reduce above this token count
    ENABLE_INTENT_CLASSIFICATION: bool = False  # Disable for faster responses (skip extra LLM call)

    # RAG (Retrieval-Augmented Generation)
    RAG_DEFAULT_LIMIT: int = 15  # Default maximum chunks to retrieve
    RAG_MIN_RESULTS: int = 3  # Minimum chunks to return
    RAG_MAX_RESULTS: int = 15  # Maximum chunks to return
    RAG_MAX_CHUNKS_PER_DOC: int = 3  # Maximum chunks from same document
    RAG_MIN_SIMILARITY: float = 0.3  # Minimum similarity threshold for inclusion

    # Adaptive RAG Tiers (3-tier system)
    QUICK_RAG_CHUNK_LIMIT: int = 15  # Tier 1: Quick RAG with top 15 chunks
    QUICK_RAG_RELEVANCE_THRESHOLD: float = 0.6  # Only include chunks above this similarity
    PROGRESSIVE_MAPREDUCE_THRESHOLD: int = 20  # Tier 2: Use progressive map-reduce above this
    FULL_MAPREDUCE_THRESHOLD: int = 100  # Tier 3: Use full map-reduce above this
    PROGRESSIVE_REDUCE_BATCH_SIZE: int = 3  # Number of map batches per reduce step

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # Logging
    LOG_LEVEL: str = "INFO"  # INFO for production, DEBUG for development
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # Redis (for caching and background tasks)
    REDIS_URL: Optional[str] = None
    ENABLE_CACHING: bool = True
    CACHE_TTL_SECONDS: int = 3600

    # Document Summarization
    ENABLE_DOCUMENT_SUMMARIZATION: bool = True  # Feature flag for document summarization
    SUMMARY_MAX_CHUNK_TOKENS: int = 2000  # Max tokens per summarization chunk
    SUMMARY_OVERLAP_RATIO: float = 0.15  # 15% overlap between chunks
    SUMMARY_PROVIDER: str = "openai"  # openai, azure, anthropic, gemini
    SUMMARY_MODEL_MAP_STAGE: str = "gpt-5"  # Model for chunk summarization
    SUMMARY_MODEL_REDUCE_STAGE: str = "gpt-5"  # Model for final aggregation
    SUMMARY_MAX_PARALLEL_CALLS: int = 8  # Max concurrent chunk summarization calls
    SUMMARY_TIMEOUT_SECONDS: int = 120  # Timeout per summarization call
    SUMMARY_RETRY_ATTEMPTS: int = 2  # Max retry attempts per chunk

    # LLM Provider Configuration
    AZURE_OPENAI_ENDPOINT: Optional[str] = None
    AZURE_OPENAI_API_KEY: Optional[str] = None
    AZURE_OPENAI_API_VERSION: str = "2024-02-15-preview"
    AZURE_DEPLOYMENT_NAME: Optional[str] = None

    ANTHROPIC_API_KEY: Optional[str] = None

    GOOGLE_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-1.5-pro"

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
