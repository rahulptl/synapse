"""
SQLAlchemy database models.
"""
from datetime import datetime
from typing import Optional
from uuid import uuid4
from sqlalchemy import (
    String, Text, DateTime, Boolean, Integer,
    ForeignKey, JSON, LargeBinary, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector as PgVector

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

    # Relationships
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan", foreign_keys="[ApiKey.user_id]")
    folders = relationship("Folder", back_populates="user", cascade="all, delete-orphan", foreign_keys="[Folder.user_id]")
    knowledge_items = relationship("KnowledgeItem", back_populates="user", cascade="all, delete-orphan", foreign_keys="[KnowledgeItem.user_id]")
    conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan", foreign_keys="[Conversation.user_id]")


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


class KnowledgeItem(Base):
    """Knowledge item model."""
    __tablename__ = "knowledge_items"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.user_id"), nullable=False)
    folder_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("folders.id"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False, default="text")
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    processing_status: Mapped[str] = mapped_column(Text, default="pending")
    is_chunked: Mapped[bool] = mapped_column(Boolean, default=False)
    total_chunks: Mapped[int] = mapped_column(Integer, default=1)
    item_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("Profile", back_populates="knowledge_items", foreign_keys=[user_id])
    folder = relationship("Folder", back_populates="knowledge_items")
    vectors = relationship("Vector", back_populates="knowledge_item", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_knowledge_items_user_id", "user_id"),
        Index("idx_knowledge_items_folder_id", "folder_id"),
        Index("idx_knowledge_items_processing_status", "processing_status"),
        Index("idx_knowledge_items_user_processing", "user_id", "processing_status"),
    )


class Vector(Base):
    """Vector embeddings for knowledge items."""
    __tablename__ = "vectors"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    knowledge_item_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("knowledge_items.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    embedding: Mapped[Optional[list[float]]] = mapped_column(PgVector(1536), nullable=True)  # Made optional for fallback cases
    content_preview: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    knowledge_item = relationship("KnowledgeItem", back_populates="vectors")

    # Indexes
    __table_args__ = (
        Index("idx_vectors_knowledge_item_id", "knowledge_item_id"),
        Index("idx_vectors_chunk_index", "chunk_index"),
        Index("idx_vectors_embedding", "embedding", postgresql_using="hnsw", postgresql_ops={"embedding": "vector_cosine_ops"}),
    )


class Conversation(Base):
    """Conversation model for chat history."""
    __tablename__ = "conversations"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.user_id"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("Profile", back_populates="conversations", foreign_keys=[user_id])
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index("idx_conversations_user_id", "user_id"),
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

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    user = relationship("Profile", foreign_keys=[user_id])

    # Indexes
    __table_args__ = (
        Index("idx_messages_conversation_id", "conversation_id"),
        Index("idx_messages_user_id", "user_id"),
        Index("idx_messages_created_at", "created_at"),
    )