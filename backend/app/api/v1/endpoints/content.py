"""
Content management endpoints.
"""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Header, Path, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import validate_any_auth
from app.services.content_service import content_service
from app.models.schemas import (
    KnowledgeItemCreate, KnowledgeItemUpdate, ContentType
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class MoveContentRequest(BaseModel):
    """Request model for moving content to a different folder."""
    target_folder_id: UUID


class RenameContentRequest(BaseModel):
    """Request model for renaming content."""
    new_title: str


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
            logger.error(f"Failed to add background task for content creation: {e}", exc_info=True)
            # Mark item as failed so user knows there's an issue
            knowledge_item.processing_status = "failed"
            await db.commit()
            raise HTTPException(
                status_code=500,
                detail=f"Item created but processing failed to start: {str(e)}"
            )

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
                "metadata": content_service.sanitize_metadata_for_response(knowledge_item.id, knowledge_item.item_metadata),
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


@router.get("/search-titles")
async def search_content_titles(
    q: str = Query(..., min_length=1, description="Search query"),
    folder_ids: Optional[str] = Query(None, description="Comma-separated folder IDs"),
    limit: int = Query(10, ge=1, le=50, description="Max results"),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Search knowledge items by title for @ autocomplete.

    Args:
        q: Search query
        folder_ids: Comma-separated list of folder IDs to filter by
        limit: Maximum number of results (default 10)

    Returns:
        List of matching items with title, folder, and match score
    """
    user_id = UUID(auth_data["user_id"])

    # Parse folder_ids if provided
    folder_id_list = []
    if folder_ids:
        try:
            folder_id_list = [UUID(fid.strip()) for fid in folder_ids.split(',') if fid.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid folder ID format")

    try:
        from app.models.database import KnowledgeItem, Folder
        from sqlalchemy import select, or_, func

        logger.info(f"Searching titles: q='{q}', user_id={user_id}, folder_ids={folder_id_list}")

        # Build base query
        stmt = select(KnowledgeItem, Folder.name.label('folder_name')).join(
            Folder, KnowledgeItem.folder_id == Folder.id
        ).where(
            KnowledgeItem.user_id == user_id,
            KnowledgeItem.processing_status == 'completed'  # Only show processed items
        )

        # Add folder filter if specified
        if folder_id_list:
            stmt = stmt.where(KnowledgeItem.folder_id.in_(folder_id_list))

        # Add fuzzy title search - search in title only for simplicity
        search_pattern = f"%{q}%"
        stmt = stmt.where(KnowledgeItem.title.ilike(search_pattern))

        # Order by relevance (exact matches first, then starts-with, then contains)
        # Simple scoring: exact = 1.0, starts-with = 0.8, contains = 0.6
        stmt = stmt.limit(limit)

        result = await db.execute(stmt)
        rows = result.all()

        # Format response with match scores
        response = []
        for item, folder_name in rows:
            # Calculate simple match score
            title_lower = item.title.lower()
            query_lower = q.lower()

            if title_lower == query_lower:
                match_score = 1.0
            elif title_lower.startswith(query_lower):
                match_score = 0.9
            else:
                match_score = 0.7

            response.append({
                "id": str(item.id),
                "title": item.title,
                "folder_id": str(item.folder_id),
                "folder_name": folder_name,
                "content_type": item.content_type,
                "match_score": match_score
            })

        # Sort by match score descending
        response.sort(key=lambda x: x["match_score"], reverse=True)

        return response

    except Exception as e:
        logger.error(f"Failed to search content titles: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to search content titles")


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
        "metadata": content_service.sanitize_metadata_for_response(knowledge_item.id, knowledge_item.item_metadata),
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
            logger.error(f"Failed to add background task for content update: {e}", exc_info=True)
            # Mark item as failed so user knows there's an issue
            knowledge_item.processing_status = "failed"
            await db.commit()
            raise HTTPException(
                status_code=500,
                detail=f"Item updated but reprocessing failed to start: {str(e)}"
            )

        # Return safe format
        return {
            "id": str(knowledge_item.id),
            "user_id": str(knowledge_item.user_id),
            "folder_id": str(knowledge_item.folder_id),
            "title": knowledge_item.title,
            "content": knowledge_item.content,
            "content_type": knowledge_item.content_type,
            "source_url": knowledge_item.source_url,
            "metadata": content_service.sanitize_metadata_for_response(knowledge_item.id, knowledge_item.item_metadata),
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


@router.patch("/{content_id}/move")
async def move_content(
    move_request: MoveContentRequest,
    content_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Move knowledge item to a different folder.

    Args:
        content_id: ID of the knowledge item to move
        move_request: Request containing target_folder_id

    Returns:
        Success response with new folder information
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # Import here to avoid circular imports
        from app.models.database import Folder
        from sqlalchemy import select

        # Verify user owns the item
        knowledge_item = await content_service.get_knowledge_item(
            db=db,
            user_id=user_id,
            item_id=content_id,
            include_content=False
        )

        if not knowledge_item:
            raise HTTPException(status_code=404, detail="Content not found or access denied")

        # Verify target folder exists and is owned by user
        folder_stmt = select(Folder).where(
            Folder.id == move_request.target_folder_id,
            Folder.user_id == user_id
        )
        folder_result = await db.execute(folder_stmt)
        target_folder = folder_result.scalar_one_or_none()

        if not target_folder:
            raise HTTPException(status_code=404, detail="Target folder not found or access denied")

        # Update folder_id
        knowledge_item.folder_id = move_request.target_folder_id
        await db.commit()
        await db.refresh(knowledge_item)

        logger.info(f"Moved knowledge item {content_id} to folder {move_request.target_folder_id}")

        return {
            "success": True,
            "message": "Content moved successfully",
            "item_id": str(content_id),
            "new_folder_id": str(move_request.target_folder_id),
            "new_folder_name": target_folder.name
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to move content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to move content")


@router.patch("/{content_id}/rename")
async def rename_content(
    rename_request: RenameContentRequest,
    content_id: UUID = Path(...),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Rename a knowledge item (convenience endpoint for updating just the title).

    Args:
        content_id: ID of the knowledge item to rename
        rename_request: Request containing new_title

    Returns:
        Updated item information
    """
    user_id = UUID(auth_data["user_id"])

    # Validate new title
    new_title = rename_request.new_title.strip()
    if not new_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    if len(new_title) > 500:
        raise HTTPException(status_code=400, detail="Title too long (max 500 characters)")

    try:
        # Use the existing update_knowledge_item method with just the title field
        from app.models.schemas import KnowledgeItemUpdate
        update_data = KnowledgeItemUpdate(title=new_title)

        knowledge_item = await content_service.update_knowledge_item(
            db=db,
            user_id=user_id,
            item_id=content_id,
            update_data=update_data
        )

        if not knowledge_item:
            raise HTTPException(status_code=404, detail="Content not found or access denied")

        # Return safe format
        return {
            "success": True,
            "message": f"Item renamed to '{new_title}'",
            "item": {
                "id": str(knowledge_item.id),
                "user_id": str(knowledge_item.user_id),
                "folder_id": str(knowledge_item.folder_id),
                "title": knowledge_item.title,
                "content_type": knowledge_item.content_type,
                "processing_status": knowledge_item.processing_status,
                "created_at": knowledge_item.created_at.isoformat() if knowledge_item.created_at else None,
                "updated_at": knowledge_item.updated_at.isoformat() if knowledge_item.updated_at else None
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to rename content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to rename content")


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

    # Return safe format with detailed processing diagnostics
    return [
        {
            "id": str(item.id),
            "user_id": str(item.user_id),
            "folder_id": str(item.folder_id),
            "title": item.title,
            "content": item.content,
            "content_type": item.content_type,
            "source_url": item.source_url,
            "metadata": content_service.sanitize_metadata_for_response(item.id, item.item_metadata),
            "processing_status": item.processing_status,
            "is_chunked": item.is_chunked,
            "total_chunks": item.total_chunks,
            "chunks_processed": item.chunks_processed,
            "processing_progress": item.processing_progress,
            "estimated_completion": item.estimated_completion.isoformat() if item.estimated_completion else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            # Diagnostic field to help frontend display correct status
            "can_reprocess": item.processing_status in ["completed", "failed"]
        }
        for item in knowledge_items
    ]