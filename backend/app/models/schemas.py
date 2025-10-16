"""
Pydantic models for request/response schemas.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, validator
from enum import Enum


class ContentType(str, Enum):
    """Content type enumeration."""
    TEXT = "text"
    PDF = "pdf"
    DOC = "doc"
    DOCX = "docx"
    HTML = "html"
    IMAGE = "image"
    DOCUMENT = "document"
    SPREADSHEET = "spreadsheet"
    PRESENTATION = "presentation"
    AUDIO = "audio"
    VIDEO = "video"
    FILE = "file"


class ProcessingStatus(str, Enum):
    """Processing status enumeration."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class MessageRole(str, Enum):
    """Message role enumeration."""
    USER = "user"
    ASSISTANT = "assistant"


# Base schemas
class BaseSchema(BaseModel):
    """Base schema with common configuration."""

    class Config:
        from_attributes = True
        use_enum_values = True


# User schemas
class UserBase(BaseSchema):
    email: str
    full_name: Optional[str] = None
    is_active: bool = True


class UserCreate(UserBase):
    pass


class UserUpdate(BaseSchema):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None


class User(UserBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


# API Key schemas
class ApiKeyBase(BaseSchema):
    name: str
    expires_at: Optional[datetime] = None


class ApiKeyCreate(ApiKeyBase):
    pass


class ApiKeyValidation(BaseSchema):
    valid: bool
    user_id: str
    user: Dict[str, Any]
    key_name: str


# Knowledge Item schemas
class KnowledgeItemBase(BaseSchema):
    title: str
    content: str
    content_type: ContentType = ContentType.TEXT
    source_url: Optional[str] = None
    folder_id: UUID
    metadata: Optional[Dict[str, Any]] = None


class KnowledgeItemCreate(KnowledgeItemBase):
    pass


class KnowledgeItemUpdate(BaseSchema):
    title: Optional[str] = None
    content: Optional[str] = None
    content_type: Optional[ContentType] = None
    source_url: Optional[str] = None
    folder_id: Optional[UUID] = None
    metadata: Optional[Dict[str, Any]] = None


class KnowledgeItem(KnowledgeItemBase):
    id: UUID
    user_id: UUID
    processing_status: ProcessingStatus
    is_chunked: bool
    total_chunks: int
    created_at: datetime
    updated_at: datetime


class KnowledgeItemWithContent(KnowledgeItem):
    """Knowledge item with full content (for retrieval)."""
    pass


# Folder schemas
class FolderBase(BaseSchema):
    name: str
    description: Optional[str] = None
    parent_id: Optional[UUID] = None


class FolderCreate(FolderBase):
    pass


class FolderUpdate(BaseSchema):
    name: Optional[str] = None
    description: Optional[str] = None


class Folder(FolderBase):
    id: UUID
    user_id: UUID
    path: str
    depth: int
    created_at: datetime
    updated_at: datetime
    children: List['Folder'] = []
    knowledge_items: List['KnowledgeItem'] = []


class FolderHierarchy(BaseSchema):
    folders: List[Folder]


# Vector schemas
class VectorBase(BaseSchema):
    knowledge_item_id: UUID
    chunk_index: int
    embedding: List[float]
    content_preview: str


class Vector(VectorBase):
    id: UUID
    created_at: datetime


# Search schemas
class SearchQuery(BaseSchema):
    query: str
    folder_id: Optional[UUID] = None
    content_types: Optional[List[ContentType]] = None
    limit: int = Field(default=5, ge=1, le=50)
    similarity_threshold: float = Field(default=0.7, ge=0.0, le=1.0)


class SearchResult(BaseSchema):
    id: UUID
    knowledge_item_id: UUID
    chunk_index: int
    content_preview: str
    similarity: float
    knowledge_item: KnowledgeItem


class SearchResponse(BaseSchema):
    results: List[SearchResult]
    query: str
    total_results: int
    filters: Dict[str, Any]


# File upload schemas
class FileUploadResponse(BaseSchema):
    success: bool
    message: str
    knowledge_item_id: UUID
    filename: str
    content_type: ContentType
    file_size: int
    processing_status: ProcessingStatus


# Content processing schemas
class ProcessContentRequest(BaseSchema):
    knowledge_item_id: UUID
    batch_offset: int = 0


class ProcessContentResponse(BaseSchema):
    success: bool
    message: str
    knowledge_item_id: UUID
    vectors_created: int
    chunks_processed: int
    processing_status: ProcessingStatus


# Chat schemas
class ChatMessage(BaseSchema):
    role: MessageRole
    content: str


class ContextItem(BaseSchema):
    """Context item for chat (folder or file)."""
    id: str  # UUID as string
    type: str  # 'folder' or 'file'


class ChatRequest(BaseSchema):
    message: str
    conversation_id: Optional[UUID] = None
    user_id: UUID
    context_items: Optional[List[ContextItem]] = None  # New field for folders/files with types


class ChatResponse(BaseSchema):
    response: str
    conversation_id: UUID
    job_id: Optional[str] = None
    job_status: Optional[str] = None
    estimated_completion_seconds: Optional[int] = None
    sources: List[Dict[str, Any]]
    context_count: int
    hashtag_info: Dict[str, Any]


class ConversationBase(BaseSchema):
    title: str


class ConversationCreate(ConversationBase):
    pass


class Conversation(ConversationBase):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime


class MessageBase(BaseSchema):
    role: MessageRole
    content: str


class MessageCreate(MessageBase):
    conversation_id: UUID
    user_id: UUID


class Message(MessageBase):
    id: UUID
    conversation_id: UUID
    user_id: UUID
    created_at: datetime


# Delete schemas
class DeleteRequest(BaseSchema):
    item_type: str  # 'content' or 'folder'
    item_id: UUID

    @validator('item_type')
    def validate_item_type(cls, v):
        if v not in ['content', 'folder']:
            raise ValueError('item_type must be "content" or "folder"')
        return v


class DeleteResponse(BaseSchema):
    success: bool
    message: str
    deleted_id: UUID


# Health check
class HealthCheck(BaseSchema):
    status: str
    environment: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# Error schemas
class ErrorResponse(BaseSchema):
    detail: str
    error_code: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# Folder content response for folder-content edge function compatibility
class FolderContentResponse(BaseSchema):
    folder: Dict[str, Any]  # Contains id and name
    content: List[Dict[str, Any]]  # Knowledge items without full content


# Search response to match query edge function format
class QuerySearchResponse(BaseSchema):
    query: str
    results: List[Dict[str, Any]]
    total: int
    filtered_by: Dict[str, Any]


# Ingest content response to match ingest-content edge function
class IngestContentResponse(BaseSchema):
    success: bool
    item: KnowledgeItem
    processing_status: str
    storage_info: Optional[Dict[str, Any]] = None


# Upload file response to match upload-file edge function
class UploadFileResponse(BaseSchema):
    success: bool
    item: KnowledgeItem
    processing_status: str
    file_info: Dict[str, Any]


# API Key schemas
class ApiKeyCreate(BaseSchema):
    name: str = Field(..., min_length=1, max_length=100)
    expires_in_days: Optional[int] = Field(None, gt=0, le=365)


class ApiKeyResponse(BaseSchema):
    id: UUID
    name: str
    key_prefix: str
    api_key: Optional[str] = None  # Only included when creating
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime


# Processing Job schemas
class ProcessingJobStatus(BaseSchema):
    """Processing job status schema."""
    job_id: UUID
    status: str  # queued, processing, completed, failed, cancelled
    progress: float  # 0.0 to 1.0
    current_phase: str
    processed_items: int
    total_items: int
    estimated_completion_seconds: Optional[int]
    result: Optional[Dict[str, Any]]
    aggregation_details: Optional[Dict[str, Any]]
    error_message: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]


# Progressive Map-Reduce schemas
class MapBatchResult(BaseSchema):
    """Result from processing a single map batch with context tracking."""
    findings: List[str] = Field(default_factory=list, description="Key findings from this batch")
    data_points: List[Dict[str, Any]] = Field(default_factory=list, description="Extracted data points")
    partial_answer: str = Field(default="", description="What we know so far from this batch")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence in findings (0-1)")
    needs_more_info: bool = Field(default=True, description="Whether more batches needed")
    processed_chunk_ids: List[int] = Field(default_factory=list, description="IDs of chunks processed")
    batch_index: int = Field(default=0, description="Index of this batch")
    items_in_batch: int = Field(default=0, description="Number of items in batch")
    relevant: bool = Field(default=True, description="Whether batch contains relevant info")


class ReduceState(BaseSchema):
    """State carried through progressive reduce iterations."""
    accumulated_findings: List[str] = Field(default_factory=list, description="All findings so far")
    accumulated_data: List[Dict[str, Any]] = Field(default_factory=list, description="All data points")
    current_answer: str = Field(default="", description="Current working answer")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Overall confidence")
    batches_processed: int = Field(default=0, description="Number of batches processed so far")
    total_chunks_seen: int = Field(default=0, description="Total chunks processed")
    next_focus_areas: List[str] = Field(default_factory=list, description="What to look for in next batches")
    missing_info: List[str] = Field(default_factory=list, description="What information is still needed")


# Update forward references
Folder.model_rebuild()