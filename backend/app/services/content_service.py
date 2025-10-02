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

from app.models.database import KnowledgeItem, Folder, Vector
from app.models.schemas import (
    KnowledgeItemCreate, KnowledgeItemUpdate,
    ProcessingStatus, ContentType
)
from app.core.storage import storage_service
from app.config import settings

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
            source_url=item_data.source_url,
            item_metadata={**(item_data.metadata or {}), **storage_metadata},
            processing_status=ProcessingStatus.PENDING
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
            item.processing_status = ProcessingStatus.PENDING

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

        # Delete from external storage if applicable
        if item.item_metadata and item.item_metadata.get("stored_in_storage"):
            storage_path = item.item_metadata.get("storage_path")
            if storage_path:
                try:
                    await storage_service.delete_content(storage_path)
                except Exception as e:
                    logger.error(f"Failed to delete stored content: {e}")
                    # Continue with database deletion

        # Delete vectors (should cascade automatically)
        await db.execute(delete(Vector).where(Vector.knowledge_item_id == item_id))

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

        # Get content items
        content_stmt = select(KnowledgeItem).where(
            KnowledgeItem.folder_id == folder_id,
            KnowledgeItem.user_id == user_id
        ).order_by(KnowledgeItem.created_at.desc())

        content_result = await db.execute(content_stmt)
        content_items = content_result.scalars().all()

        # Convert content items to match edge function format
        content_list = []
        for item in content_items:
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

            content_list.append({
                "id": item.id,
                "title": item.title,
                "content": content,  # Include the actual content
                "content_type": item.content_type,
                "source_url": item.source_url,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
                "metadata": item.item_metadata
            })

        return {
            "folder": {
                "id": str(folder.id),
                "name": folder.name
            },
            "items": content_list  # Changed from "content" to "items" to match frontend expectation
        }

# Service instance
content_service = ContentService()