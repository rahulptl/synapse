"""
Content management service.
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
import logging

from app.models.database import KnowledgeItem, Folder, GCSFile, OpenAIFile
from app.models.schemas import (
    KnowledgeItemCreate, KnowledgeItemUpdate,
    ContentType
)
from app.core.storage import storage_service
from app.config import settings
from app.services.openai import VectorStoreService

logger = logging.getLogger(__name__)


class ContentService:
    """Service for managing knowledge items."""

    @staticmethod
    def sanitize_text_input(text: str) -> str:
        """
        Sanitize user text input for PostgreSQL UTF-8 compatibility.
        This is a wrapper around the processing service sanitizer.
        """
        from app.services.processing_service import ProcessingService
        return ProcessingService.sanitize_text_for_postgres(text)

    @staticmethod
    def sanitize_metadata_for_response(item_id: UUID, metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Sanitize metadata before sending to frontend.

        Removes sensitive internal fields (storage_path, storage_url) and adds
        a download_url that points to the proper API endpoint.

        Args:
            item_id: Knowledge item ID
            metadata: Raw metadata from database

        Returns:
            Dict with sanitized metadata safe for frontend consumption
        """
        if not metadata:
            return {}

        # Remove sensitive fields that should not be exposed to frontend
        sensitive_fields = ['storage_path', 'storage_url']
        safe_metadata = {k: v for k, v in metadata.items() if k not in sensitive_fields}

        # Add proper download URL if this item has a file
        if metadata.get('storage_path'):
            safe_metadata['download_url'] = f"/api/v1/files/download/{item_id}"
            safe_metadata['has_file'] = True

        return safe_metadata

    async def create_knowledge_item(
        self,
        db: AsyncSession,
        user_id: UUID,
        item_data: KnowledgeItemCreate
    ) -> KnowledgeItem:
        """
        Create a new knowledge item.

        Args:
            db: Database session
            user_id: User ID
            item_data: Knowledge item data

        Returns:
            KnowledgeItem: Created knowledge item

        Raises:
            ValueError: If folder doesn't exist or belong to user
        """
        # Verify folder exists and belongs to user
        folder_stmt = select(Folder).where(
            Folder.id == item_data.folder_id,
            Folder.user_id == user_id
        )
        folder_result = await db.execute(folder_stmt)
        folder = folder_result.scalar_one_or_none()

        if not folder:
            raise ValueError("Invalid folder or insufficient permissions")

        # Sanitize content for PostgreSQL UTF-8 compatibility
        sanitized_content = self.sanitize_text_input(item_data.content)
        sanitized_title = self.sanitize_text_input(item_data.title)

        # Handle large content storage (match edge function logic)
        content_size = len(sanitized_content.encode('utf-8'))
        final_content = sanitized_content
        storage_metadata = {}

        # Store large content in storage for content > 1MB (match edge function)
        if content_size > 1024 * 1024:  # 1MB threshold
            timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
            import uuid
            random_id = str(uuid.uuid4())
            storage_path = f"{user_id}/{item_data.folder_id}/{timestamp}-{random_id}.txt"

            try:
                # Upload to storage
                await storage_service.upload_content(
                    storage_path,
                    sanitized_content.encode('utf-8'),
                    "text/plain"
                )

                final_content = f"[STORED_IN_STORAGE:{storage_path}]"
                storage_metadata = {
                    "storage_path": storage_path,
                    "original_size": content_size,
                    "stored_in_storage": True
                }
            except Exception as e:
                logger.error(f"Failed to store large content: {e}")
                # Fall back to storing directly in database
                logger.warning("Falling back to database storage for large content")

        # Create knowledge item
        knowledge_item = KnowledgeItem(
            user_id=user_id,
            folder_id=item_data.folder_id,
            title=sanitized_title,
            content=final_content,
            content_type=item_data.content_type,
            source_type='text',  # Text-based content for OpenAI processing
            item_metadata={**(item_data.metadata or {}), **storage_metadata},
            status="pending"
        )

        db.add(knowledge_item)
        await db.commit()
        await db.refresh(knowledge_item)

        # Background processing is now handled by FastAPI BackgroundTasks in the endpoint
        return knowledge_item

    async def get_knowledge_item(
        self,
        db: AsyncSession,
        user_id: UUID,
        item_id: UUID,
        include_content: bool = True
    ) -> Optional[KnowledgeItem]:
        """
        Get a knowledge item by ID.

        Args:
            db: Database session
            user_id: User ID
            item_id: Knowledge item ID
            include_content: Whether to include full content

        Returns:
            KnowledgeItem: Knowledge item if found
        """
        stmt = select(KnowledgeItem).where(
            KnowledgeItem.id == item_id,
            KnowledgeItem.user_id == user_id
        )

        result = await db.execute(stmt)
        item = result.scalar_one_or_none()

        if not item:
            return None

        # Load full content if stored externally
        if include_content and item.item_metadata and item.item_metadata.get("stored_in_storage"):
            if item.content.startswith('[STORED_IN_STORAGE:'):
                storage_path = item.content.replace('[STORED_IN_STORAGE:', '').replace(']', '')
                try:
                    content_bytes = await storage_service.download_content(storage_path)
                    item.content = content_bytes.decode('utf-8')
                except Exception as e:
                    logger.error(f"Failed to load stored content: {e}")
                    # Keep the storage reference as content

        return item

    async def update_knowledge_item(
        self,
        db: AsyncSession,
        user_id: UUID,
        item_id: UUID,
        update_data: KnowledgeItemUpdate
    ) -> Optional[KnowledgeItem]:
        """
        Update a knowledge item.

        Args:
            db: Database session
            user_id: User ID
            item_id: Knowledge item ID
            update_data: Update data

        Returns:
            KnowledgeItem: Updated knowledge item
        """
        item = await self.get_knowledge_item(db, user_id, item_id, include_content=False)
        if not item:
            return None

        # Update fields
        update_dict = update_data.dict(exclude_unset=True)
        for field, value in update_dict.items():
            if field == "folder_id" and value:
                # Verify new folder exists and belongs to user
                folder_stmt = select(Folder).where(
                    Folder.id == value,
                    Folder.user_id == user_id
                )
                folder_result = await db.execute(folder_stmt)
                if not folder_result.scalar_one_or_none():
                    raise ValueError("Invalid folder or insufficient permissions")

            setattr(item, field, value)

        # If content is updated and it's large, handle storage
        if "content" in update_dict:
            content_size = len(update_dict["content"].encode('utf-8'))
            if content_size > 1024 * 1024:  # 1MB threshold
                # Store in external storage
                timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
                import uuid
                random_id = str(uuid.uuid4())
                storage_path = f"{user_id}/{item.folder_id}/{timestamp}-{random_id}.txt"

                try:
                    await storage_service.upload_content(
                        storage_path,
                        update_dict["content"].encode('utf-8'),
                        "text/plain"
                    )

                    item.content = f"[STORED_IN_STORAGE:{storage_path}]"
                    item.item_metadata = {
                        **(item.item_metadata or {}),
                        "storage_path": storage_path,
                        "original_size": content_size,
                        "stored_in_storage": True
                    }
                except Exception as e:
                    logger.error(f"Failed to store updated content: {e}")
                    raise ValueError("Failed to store updated content")

            # Trigger reprocessing if content changed
            item.status = "pending"

        await db.commit()
        await db.refresh(item)
        return item

    async def delete_knowledge_item(
        self,
        db: AsyncSession,
        user_id: UUID,
        item_id: UUID
    ) -> bool:
        """
        Delete a knowledge item.

        Args:
            db: Database session
            user_id: User ID
            item_id: Knowledge item ID

        Returns:
            bool: True if deleted successfully
        """
        item = await self.get_knowledge_item(db, user_id, item_id, include_content=False)
        if not item:
            return False

        # Collect OpenAI vector store cleanup targets before deleting
        openai_cleanup_targets: List[Dict[str, str]] = []
        if settings.ENABLE_OPENAI_VECTOR_STORES:
            openai_stmt = select(OpenAIFile).where(OpenAIFile.knowledge_item_id == item_id)
            openai_result = await db.execute(openai_stmt)
            for record in openai_result.scalars().all():
                if record.vector_store_id and record.openai_vector_store_file_id:
                    openai_cleanup_targets.append({
                        "vector_store_id": record.vector_store_id,
                        "vector_store_file_id": record.openai_vector_store_file_id
                    })

        # Delete from external storage if applicable
        if item.item_metadata and item.item_metadata.get("stored_in_storage"):
            storage_path = item.item_metadata.get("storage_path")
            if storage_path:
                try:
                    await storage_service.delete_content(storage_path)
                except Exception as e:
                    logger.error(f"Failed to delete stored content: {e}")
                    # Continue with database deletion

        # Remove from OpenAI vector store before deleting database record
        if openai_cleanup_targets:
            vector_store_service = VectorStoreService()
            for target in openai_cleanup_targets:
                try:
                    await vector_store_service.delete_file(
                        vector_store_id=target["vector_store_id"],
                        file_id=target["vector_store_file_id"]
                    )
                except Exception as e:
                    logger.error(
                        "Failed to delete vector store file %s from vector store %s: %s",
                        target["vector_store_file_id"],
                        target["vector_store_id"],
                        e,
                        exc_info=True
                    )

        # Delete knowledge item
        await db.execute(
            delete(KnowledgeItem).where(
                KnowledgeItem.id == item_id,
                KnowledgeItem.user_id == user_id
            )
        )

        await db.commit()
        return True

    async def list_knowledge_items(
        self,
        db: AsyncSession,
        user_id: UUID,
        folder_id: Optional[UUID] = None,
        content_types: Optional[List[ContentType]] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[KnowledgeItem]:
        """
        List knowledge items with filters.

        Args:
            db: Database session
            user_id: User ID
            folder_id: Optional folder filter
            content_types: Optional content type filter
            skip: Number of items to skip
            limit: Maximum number of items to return

        Returns:
            List[KnowledgeItem]: List of knowledge items
        """
        stmt = select(KnowledgeItem).where(KnowledgeItem.user_id == user_id)

        if folder_id:
            stmt = stmt.where(KnowledgeItem.folder_id == folder_id)

        if content_types:
            stmt = stmt.where(KnowledgeItem.content_type.in_(content_types))

        stmt = stmt.order_by(KnowledgeItem.created_at.desc()).offset(skip).limit(limit)

        result = await db.execute(stmt)
        return result.scalars().all()

    async def get_folder_content(
        self,
        db: AsyncSession,
        user_id: UUID,
        folder_id: UUID
    ) -> Dict[str, Any]:
        """
        Get content for a specific folder.

        Args:
            db: Database session
            user_id: User ID
            folder_id: Folder ID

        Returns:
            Dict[str, Any]: Folder information and content

        Raises:
            ValueError: If folder doesn't exist or belong to user
        """
        # Verify folder exists and belongs to user
        folder_stmt = select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == user_id
        )
        folder_result = await db.execute(folder_stmt)
        folder = folder_result.scalar_one_or_none()

        if not folder:
            raise ValueError("Folder not found or insufficient permissions")

        # Get content items with OpenAI status for searchability
        content_stmt = select(KnowledgeItem).where(
            KnowledgeItem.folder_id == folder_id,
            KnowledgeItem.user_id == user_id
        ).order_by(KnowledgeItem.created_at.desc())

        content_result = await db.execute(content_stmt)
        content_items = content_result.scalars().all()

        # Convert content items to match simplified format
        content_list = []
        for item in content_items:
            # Check if item is indexed in OpenAI (searchable)
            is_searchable = item.status == "completed"

            # Load full content if stored externally
            content = item.content
            if item.item_metadata and item.item_metadata.get("stored_in_storage"):
                if item.content.startswith('[STORED_IN_STORAGE:'):
                    storage_path = item.content.replace('[STORED_IN_STORAGE:', '').replace(']', '')
                    try:
                        content_bytes = await storage_service.download_content(storage_path)
                        content = content_bytes.decode('utf-8')
                    except Exception as e:
                        logger.error(f"Failed to load stored content: {e}")
                        # Keep the storage reference as content

            # Format timestamps as UTC ISO strings with 'Z' suffix
            created_at_str = None
            if item.created_at:
                created_at_str = item.created_at.isoformat()
                if not created_at_str.endswith('Z') and '+' not in created_at_str:
                    created_at_str += 'Z'

            updated_at_str = None
            if item.updated_at:
                updated_at_str = item.updated_at.isoformat()
                if not updated_at_str.endswith('Z') and '+' not in updated_at_str:
                    updated_at_str += 'Z'

            content_list.append({
                "id": item.id,
                "title": item.title,
                "content": content,  # Include the actual content
                "content_type": item.content_type,
                "source_type": item.source_type,
                "status": item.status,
                "is_searchable": is_searchable,
                "created_at": created_at_str,
                "updated_at": updated_at_str,
                "metadata": item.item_metadata
            })

        return {
            "folder": {
                "id": str(folder.id),
                "name": folder.name
            },
            "items": content_list  # Changed from "content" to "items" to match frontend expectation
        }

    async def create_knowledge_item_from_bytes(
        self,
        db: AsyncSession,
        user_id: UUID,
        folder_id: UUID,
        filename: str,
        file_bytes: bytes,
        metadata: Optional[Dict[str, Any]] = None
    ) -> KnowledgeItem:
        """
        Create a knowledge item directly from file bytes.

        This is used for programmatically created files (e.g., code interpreter outputs)
        where we have the raw bytes rather than an UploadFile.

        Args:
            db: Database session
            user_id: User ID
            folder_id: Target folder ID
            filename: Filename for the file
            file_bytes: Raw file bytes
            metadata: Additional metadata to store

        Returns:
            KnowledgeItem: Created knowledge item

        Raises:
            ValueError: If folder doesn't exist or upload fails
        """
        # Verify folder exists and belongs to user
        folder_stmt = select(Folder).where(
            Folder.id == folder_id,
            Folder.user_id == user_id
        )
        folder_result = await db.execute(folder_stmt)
        folder = folder_result.scalar_one_or_none()

        if not folder:
            raise ValueError("Invalid folder or insufficient permissions")

        file_size = len(file_bytes)

        # Log file creation for monitoring
        logger.info(
            f"Creating knowledge item from bytes: {filename} "
            f"({file_size / 1024:.1f}KB) for user {user_id}"
        )

        # Generate storage path (similar to file_service)
        import re
        import uuid
        # Clean filename for storage
        storage_filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
        storage_filename = f"{uuid.uuid4().hex[:8]}_{storage_filename}"
        storage_path = f"{user_id}/{folder_id}/{storage_filename}"

        # Detect content type from filename extension
        content_type = self._detect_content_type_from_filename(filename)
        mime_type = self._detect_mime_type_from_filename(filename)

        # Upload file to storage
        try:
            storage_url = await storage_service.upload_content(
                storage_path,
                file_bytes,
                mime_type
            )
        except Exception as e:
            logger.error(f"Failed to upload file bytes to storage: {e}")
            raise ValueError(f"Failed to upload file to storage: {e}")

        # Prepare metadata
        item_metadata = {
            "storage_path": storage_path,
            "original_filename": filename,
            "file_size": file_size,
            "mime_type": mime_type,
            "stored_in_storage": True,
            **(metadata or {})
        }

        # Create knowledge item
        file_content_text = f"[FILE:{storage_path}]"
        knowledge_item = KnowledgeItem(
            user_id=user_id,
            folder_id=folder_id,
            title=filename,
            content=file_content_text,
            content_type=content_type,
            source_type=metadata.get('source_type', 'upload') if metadata else 'upload',
            filename=filename,
            size_bytes=file_size,
            item_metadata=item_metadata,
            status="pending"  # Will be processed in background
        )

        db.add(knowledge_item)
        await db.commit()
        await db.refresh(knowledge_item)

        # Create GCSFile record
        bucket_name = settings.GCS_BUCKET_NAME or "local"
        gcs_file = GCSFile(
            knowledge_item_id=knowledge_item.id,
            bucket_name=bucket_name,
            object_path=storage_path,
            gcs_url=storage_url
        )
        db.add(gcs_file)
        await db.commit()

        logger.info(
            f"Created knowledge item {knowledge_item.id} from bytes: {filename}"
        )

        return knowledge_item

    def _detect_content_type_from_filename(self, filename: str) -> str:
        """Detect ContentType enum from filename extension."""
        ext = filename.split('.')[-1].lower() if '.' in filename else ''

        # Map extensions to ContentType enum values
        ext_map = {
            'pdf': 'pdf',
            'doc': 'doc',
            'docx': 'docx',
            'txt': 'text',
            'md': 'text',
            'csv': 'text',
            'json': 'text',
            'xml': 'text',
            'html': 'html',
            'htm': 'html',
            'png': 'image',
            'jpg': 'image',
            'jpeg': 'image',
            'gif': 'image',
            'bmp': 'image',
            'py': 'text',
            'js': 'text',
            'ts': 'text',
            'java': 'text',
            'cpp': 'text',
            'c': 'text',
            'cs': 'text',
            'rb': 'text',
            'php': 'text',
            'sh': 'text',
            'css': 'text',
        }

        return ext_map.get(ext, 'document')

    def _detect_mime_type_from_filename(self, filename: str) -> str:
        """Detect MIME type from filename extension."""
        ext = filename.split('.')[-1].lower() if '.' in filename else ''

        # Map extensions to MIME types (matching OpenAI's supported types)
        mime_map = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'md': 'text/markdown',
            'csv': 'text/csv',
            'json': 'application/json',
            'xml': 'application/xml',
            'html': 'text/html',
            'htm': 'text/html',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'zip': 'application/zip',
            'tar': 'application/x-tar',
            'py': 'text/x-python',
            'js': 'text/javascript',
            'ts': 'application/typescript',
            'java': 'text/x-java',
            'cpp': 'text/x-c++',
            'c': 'text/x-c',
            'cs': 'text/x-csharp',
            'rb': 'text/x-ruby',
            'php': 'text/x-php',
            'sh': 'application/x-sh',
            'css': 'text/css',
        }

        return mime_map.get(ext, 'application/octet-stream')


# Service instance
content_service = ContentService()
