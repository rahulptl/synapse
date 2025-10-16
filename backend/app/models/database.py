"""
SQLAlchemy database models.
"""
from datetime import datetime
from typing import Optional
from uuid import uuid4
from sqlalchemy import (
    String, Text, DateTime, Boolean, Integer, Float,
    ForeignKey, JSON, LargeBinary, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, ARRAY

from app.core.database import Base


class Profile(Base):
    """Profile model."""
    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(Text)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # OpenAI Vector Store (One per User)
    openai_vector_store_id: Mapped[Optional[str]] = mapped_column(Text, unique=True)
    openai_vector_store_status: Mapped[Optional[str]] = mapped_column(Text)  # active, expired, failed
    openai_vector_store_created_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Relationships
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan", foreign_keys="[ApiKey.user_id]")
    folders = relationship("Folder", back_populates="user", cascade="all, delete-orphan", foreign_keys="[Folder.user_id]")
    knowledge_items = relationship("KnowledgeItem", back_populates="user", cascade="all, delete-orphan", foreign_keys="[KnowledgeItem.user_id]")
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan", foreign_keys="[Conversation.user_id]")

    # Indexes
    __table_args__ = (
        Index("idx_profiles_vector_store", "openai_vector_store_id"),
    )


class ApiKey(Base):
    """API Key model."""
    __tablename__ = "api_keys"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.user_id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    key_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    key_prefix: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("Profile", back_populates="api_keys", foreign_keys=[user_id])

    # Indexes
    __table_args__ = (
        Index("idx_api_keys_key_hash", "key_hash"),
        Index("idx_api_keys_user_id", "user_id"),
    )


class Folder(Base):
    """Folder model for organizing knowledge items."""
    __tablename__ = "folders"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.user_id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    parent_id: Mapped[Optional[UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("folders.id"))
    path: Mapped[str] = mapped_column(Text, nullable=False)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("Profile", back_populates="folders", foreign_keys=[user_id])
    parent = relationship("Folder", remote_side=[id], backref="children")
    knowledge_items = relationship("KnowledgeItem", back_populates="folder", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_folders_user_id", "user_id"),
        Index("idx_folders_parent_id", "parent_id"),
        Index("idx_folders_path", "path"),
    )




class GCSFile(Base):
    """GCS storage mapping - where raw files are stored."""
    __tablename__ = "gcs_files"

    # Primary Key & Foreign Key
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    knowledge_item_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        unique=True,
        nullable=False
    )

    # GCS Storage Details
    bucket_name: Mapped[str] = mapped_column(Text, nullable=False)
    object_path: Mapped[str] = mapped_column(Text, nullable=False)  # Full path in bucket
    gcs_url: Mapped[str] = mapped_column(Text, nullable=False)  # gs://bucket/path
    public_url: Mapped[Optional[str]] = mapped_column(Text)  # For public files

    # Storage Metadata
    storage_class: Mapped[Optional[str]] = mapped_column(Text)  # STANDARD, NEARLINE, etc.
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationship
    knowledge_item = relationship("KnowledgeItem", back_populates="gcs_file")

    # Indexes
    __table_args__ = (
        Index("idx_gcs_files_knowledge_item_id", "knowledge_item_id"),
        Index("idx_gcs_files_bucket", "bucket_name", "object_path"),
    )


class OpenAIFile(Base):
    """OpenAI integration mapping - where files are indexed for search."""
    __tablename__ = "openai_files"

    # Primary Key & Foreign Key
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    knowledge_item_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_items.id", ondelete="CASCADE"),
        unique=True,
        nullable=False
    )

    # OpenAI IDs
    openai_file_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)  # From files.create()
    openai_vector_store_file_id: Mapped[Optional[str]] = mapped_column(Text, unique=True)  # From vector_stores.files.create()
    vector_store_id: Mapped[str] = mapped_column(Text, nullable=False)  # User's vector store

    # Processing Status
    status: Mapped[str] = mapped_column(Text, default="pending")  # pending, processing, completed, failed
    error_message: Mapped[Optional[str]] = mapped_column(Text)

    # OpenAI Metadata
    openai_attributes: Mapped[Optional[dict]] = mapped_column(JSON)  # Attributes set in vector store (folder_id, etc.)
    usage_bytes: Mapped[Optional[int]] = mapped_column(Integer)  # Storage used in OpenAI

    # Timestamps
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Relationship
    knowledge_item = relationship("KnowledgeItem", back_populates="openai_file")

    # Indexes
    __table_args__ = (
        Index("idx_openai_files_knowledge_item_id", "knowledge_item_id"),
        Index("idx_openai_files_vector_store", "vector_store_id"),
        Index("idx_openai_files_status", "status"),
        Index("idx_openai_files_openai_id", "openai_file_id"),
    )


class KnowledgeItem(Base):
    """User's knowledge items - simplified central entity supporting both files and direct text."""
    __tablename__ = "knowledge_items"

    # Primary Keys & Foreign Keys
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.user_id"), nullable=False)
    folder_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("folders.id"), nullable=False)

    # Core Content
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)  # Extracted text from files OR direct text input
    content_type: Mapped[str] = mapped_column(Text, nullable=False)  # 'text', 'pdf', 'image', etc.

    # Source Information
    source_type: Mapped[str] = mapped_column(Text, nullable=False)  # 'ingest', 'text', 'upload' etc.
    source_url: Mapped[Optional[str]] = mapped_column(Text)  # URL if ingested from web
    description: Mapped[Optional[str]] = mapped_column(Text)  # User-provided description

    # File-specific Information (nullable for text-only entries)
    filename: Mapped[Optional[str]] = mapped_column(Text)  # Original filename for file uploads
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer)  # File size in bytes

    # Processing Status (simplified)
    status: Mapped[str] = mapped_column(Text, default="pending")  # pending, processing, completed, failed

    # Metadata
    item_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSON)  # Extended metadata for flexibility

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("Profile", back_populates="knowledge_items", foreign_keys=[user_id])
    folder = relationship("Folder", back_populates="knowledge_items")
    gcs_file = relationship("GCSFile", back_populates="knowledge_item", uselist=False, cascade="all, delete-orphan")
    openai_file = relationship("OpenAIFile", back_populates="knowledge_item", uselist=False, cascade="all, delete-orphan")

    # Indexes for Performance
    __table_args__ = (
        Index("idx_knowledge_items_user_folder", "user_id", "folder_id"),
        Index("idx_knowledge_items_user", "user_id"),
        Index("idx_knowledge_items_folder", "folder_id"),
        Index("idx_knowledge_items_created", "created_at"),
        Index("idx_knowledge_items_source_type", "source_type"),
        Index("idx_knowledge_items_status", "status"),
        Index("idx_knowledge_items_title_search", "title", postgresql_using="gin", postgresql_ops={"title": "gin_trgm_ops"}),
    )




class Conversation(Base):
    """Conversation model for chat history."""
    __tablename__ = "conversations"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.user_id"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # OpenAI Responses API Integration
    last_response_id: Mapped[Optional[str]] = mapped_column(Text)  # For conversation continuity
    openai_metadata: Mapped[Optional[dict]] = mapped_column(JSON)  # Store response metadata, usage stats

    # Relationships
    user = relationship("Profile", back_populates="conversations", foreign_keys=[user_id])
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_conversations_user_id", "user_id"),
        Index("idx_conversations_response", "last_response_id"),
    )


class Message(Base):
    """Message model for conversation history."""
    __tablename__ = "messages"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.user_id"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # 'user' or 'assistant'
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Reference to processing job (optional)
    job_id: Mapped[Optional[UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("processing_jobs.id"))

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    user = relationship("Profile", foreign_keys=[user_id])
    job = relationship("ProcessingJob", foreign_keys=[job_id], back_populates="message", uselist=False)

    # Indexes
    __table_args__ = (
        Index("idx_messages_conversation_id", "conversation_id"),
        Index("idx_messages_user_id", "user_id"),
        Index("idx_messages_created_at", "created_at"),
    )


class ProcessingJob(Base):
    """Background processing jobs for long-running queries."""
    __tablename__ = "processing_jobs"

    # Primary fields
    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.user_id"), nullable=False)
    conversation_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)

    # Job details
    job_type: Mapped[str] = mapped_column(Text, nullable=False)  # "aggregation", "full_folder_summary", "filtered_aggregation"
    status: Mapped[str] = mapped_column(Text, default="queued")  # queued, processing, completed, failed, cancelled
    user_query: Mapped[str] = mapped_column(Text, nullable=False)
    intent_data: Mapped[dict] = mapped_column(JSON)  # Parsed intent from classification

    # Progress tracking
    progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0.0 to 1.0
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    total_batches: Mapped[int] = mapped_column(Integer, default=0)
    processed_items: Mapped[int] = mapped_column(Integer, default=0)
    processed_batches: Mapped[int] = mapped_column(Integer, default=0)
    failed_batches: Mapped[int] = mapped_column(Integer, default=0)
    current_phase: Mapped[str] = mapped_column(Text, default="queued")  # queued, map, reduce, synthesis, complete

    # Results
    result: Mapped[Optional[dict]] = mapped_column(JSON)  # Final answer with sources
    aggregation_details: Mapped[Optional[dict]] = mapped_column(JSON)  # Detailed breakdown
    intermediate_results: Mapped[Optional[dict]] = mapped_column(JSON)  # Map phase results (for debugging/resume)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    error_details: Mapped[Optional[dict]] = mapped_column(JSON)  # Stack trace, failed batch info

    # Timing
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    estimated_completion_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    actual_duration_seconds: Mapped[Optional[float]] = mapped_column(Float)

    # Metadata
    processing_metadata: Mapped[Optional[dict]] = mapped_column(JSON)  # Model used, chunk size, etc.

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("Profile", foreign_keys=[user_id])
    conversation = relationship("Conversation", foreign_keys=[conversation_id])
    message = relationship("Message", back_populates="job", uselist=False)

    # Indexes
    __table_args__ = (
        Index("idx_processing_jobs_user_status", "user_id", "status"),
        Index("idx_processing_jobs_conversation", "conversation_id"),
        Index("idx_processing_jobs_status", "status"),
        Index("idx_processing_jobs_created_at", "created_at"),
    )


