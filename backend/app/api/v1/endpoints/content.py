"""
Content management endpoints.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Header, Path, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import validate_any_auth
from app.services.content_service import content_service
from app.models.schemas import (
    KnowledgeItemCreate, KnowledgeItemUpdate, ContentType
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/")
async def create_content(
    item_data: KnowledgeItemCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Create a new knowledge item.

    Equivalent to: ingest-content edge function
    """
    user_id = UUID(auth_data["user_id"])

    try:
        knowledge_item = await content_service.create_knowledge_item(
            db=db,
            user_id=user_id,
            item_data=item_data
        )

        # Add background processing task for text content
        try:
            from app.api.v1.endpoints.files import process_knowledge_item_background
            background_tasks.add_task(process_knowledge_item_background, knowledge_item.id)
            logger.info(f"Added background processing task for knowledge item {knowledge_item.id}")
        except Exception as e:
            logger.error(f"Failed to add background task for content creation: {e}")
            # Continue without background processing

        # Return in exact edge function format
        content_size = len(item_data.content.encode('utf-8'))
        return {
            "success": True,
            "item": {
                "id": knowledge_item.id,
                "user_id": knowledge_item.user_id,
                "folder_id": knowledge_item.folder_id,
                "title": knowledge_item.title,
                "content": knowledge_item.content,
                "content_type": knowledge_item.content_type,
                "source_url": knowledge_item.source_url,
                "metadata": knowledge_item.item_metadata,
                "created_at": knowledge_item.created_at.isoformat() if knowledge_item.created_at else None,
                "updated_at": knowledge_item.updated_at.isoformat() if knowledge_item.updated_at else None,
                "processing_status": knowledge_item.processing_status,
                "is_chunked": knowledge_item.is_chunked,
                "total_chunks": knowledge_item.total_chunks
            },
            "processing_status": "queued",
            "storage_info": {
                "content_size": content_size,
                "stored_in_database": content_size <= 1024 * 1024,
                "stored_in_storage": content_size > 1024 * 1024
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create knowledge item")


@router.get("/{content_id}")
async def get_content(
    content_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Get a knowledge item by ID with full content.

    Equivalent to: content edge function
    """
    user_id = UUID(auth_data["user_id"])

    knowledge_item = await content_service.get_knowledge_item(
        db=db,
        user_id=user_id,
        item_id=content_id,
        include_content=True
    )

    if not knowledge_item:
        raise HTTPException(status_code=404, detail="Content not found or access denied")

    # Return in exact edge function format
    return {
        "id": str(knowledge_item.id),
        "title": knowledge_item.title,
        "content": knowledge_item.content,
        "content_type": knowledge_item.content_type,
        "source_url": knowledge_item.source_url,
        "metadata": knowledge_item.item_metadata or {},
        "created_at": knowledge_item.created_at.isoformat() if knowledge_item.created_at else None,
        "updated_at": knowledge_item.updated_at.isoformat() if knowledge_item.updated_at else None,
        "folder_id": str(knowledge_item.folder_id)
    }


@router.put("/{content_id}")
async def update_content(
    update_data: KnowledgeItemUpdate,
    background_tasks: BackgroundTasks,
    content_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Update a knowledge item.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        knowledge_item = await content_service.update_knowledge_item(
            db=db,
            user_id=user_id,
            item_id=content_id,
            update_data=update_data
        )

        if not knowledge_item:
            raise HTTPException(status_code=404, detail="Content not found or access denied")

        # Add background processing task for updated content (if content was changed)
        try:
            # Check if content was actually updated and trigger reprocessing
            content_changed = (
                hasattr(update_data, 'content') and
                update_data.content is not None and
                update_data.content != knowledge_item.content
            )

            if content_changed:
                from app.api.v1.endpoints.files import process_knowledge_item_background
                background_tasks.add_task(process_knowledge_item_background, knowledge_item.id)
                logger.info(f"Added background processing task for updated knowledge item {knowledge_item.id}")
        except Exception as e:
            logger.error(f"Failed to add background task for content update: {e}")
            # Continue without background processing

        # Return safe format
        return {
            "id": str(knowledge_item.id),
            "user_id": str(knowledge_item.user_id),
            "folder_id": str(knowledge_item.folder_id),
            "title": knowledge_item.title,
            "content": knowledge_item.content,
            "content_type": knowledge_item.content_type,
            "source_url": knowledge_item.source_url,
            "metadata": knowledge_item.item_metadata or {},
            "processing_status": knowledge_item.processing_status,
            "is_chunked": knowledge_item.is_chunked,
            "total_chunks": knowledge_item.total_chunks,
            "created_at": knowledge_item.created_at.isoformat() if knowledge_item.created_at else None,
            "updated_at": knowledge_item.updated_at.isoformat() if knowledge_item.updated_at else None
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update knowledge item")


@router.post("/{content_id}/reprocess")
async def reprocess_content(
    content_id: UUID = Path(...),
    background_tasks: BackgroundTasks = None,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Reprocess a knowledge item to update its embeddings.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # Verify the item exists and user has access
        knowledge_item = await content_service.get_knowledge_item(
            db=db,
            user_id=user_id,
            item_id=content_id,
            include_content=False
        )

        if not knowledge_item:
            raise HTTPException(status_code=404, detail="Content not found or access denied")

        # Add background processing task to reprocess
        try:
            from app.api.v1.endpoints.files import process_knowledge_item_background
            background_tasks.add_task(process_knowledge_item_background, knowledge_item.id)
            logger.info(f"Added background reprocessing task for knowledge item {knowledge_item.id}")
        except Exception as e:
            logger.error(f"Failed to add background task for reprocessing: {e}")
            raise HTTPException(status_code=500, detail="Failed to queue reprocessing task")

        return {
            "success": True,
            "message": "Content reprocessing queued",
            "item_id": str(content_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reprocess content: {e}")
        raise HTTPException(status_code=500, detail="Failed to reprocess content")


@router.delete("/{content_id}")
async def delete_content(
    content_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Delete a knowledge item.

    Equivalent to: delete-item edge function (content part)
    """
    user_id = UUID(auth_data["user_id"])

    success = await content_service.delete_knowledge_item(
        db=db,
        user_id=user_id,
        item_id=content_id
    )

    if not success:
        raise HTTPException(status_code=404, detail="Content not found or access denied")

    return {
        "success": True,
        "message": "Content deleted successfully",
        "deleted_id": str(content_id)
    }


@router.get("/")
async def list_content(
    folder_id: Optional[UUID] = None,
    content_types: Optional[List[ContentType]] = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    List knowledge items with optional filters.
    """
    user_id = UUID(auth_data["user_id"])

    knowledge_items = await content_service.list_knowledge_items(
        db=db,
        user_id=user_id,
        folder_id=folder_id,
        content_types=content_types,
        skip=skip,
        limit=limit
    )

    # Return safe format
    return [
        {
            "id": str(item.id),
            "user_id": str(item.user_id),
            "folder_id": str(item.folder_id),
            "title": item.title,
            "content": item.content,
            "content_type": item.content_type,
            "source_url": item.source_url,
            "metadata": item.item_metadata or {},
            "processing_status": item.processing_status,
            "is_chunked": item.is_chunked,
            "total_chunks": item.total_chunks,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None
        }
        for item in knowledge_items
    ]