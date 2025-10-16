"""
Content management endpoints.
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Header, Path, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import zipfile
import io
import json
import math
from datetime import datetime

from app.core.database import get_db
from app.core.security import validate_any_auth
from app.services.content_service import content_service
from app.models.schemas import (
    KnowledgeItemCreate, KnowledgeItemUpdate, ContentType
)
from app.models.database import KnowledgeItem, OpenAIFile
from app.config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class MoveContentRequest(BaseModel):
    """Request model for moving content to a different folder."""
    target_folder_id: UUID


class RenameContentRequest(BaseModel):
    """Request model for renaming content."""
    new_title: str


# Pydantic models for text entry
class TextEntryRequest(BaseModel):
    """Request model for creating text-only knowledge items."""
    title: str
    content: str
    folder_id: UUID
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[dict] = None


class TextEntryResponse(BaseModel):
    """Response model for text entry creation."""
    success: bool
    message: str
    item: Dict[str, Any]


@router.post("/text", response_model=TextEntryResponse)
async def create_text_entry(
    text_request: TextEntryRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Create a text-only knowledge entry (no file upload).

    This endpoint allows users to directly add text content without uploading a file.
    The text is stored directly in the knowledge item and sent to OpenAI for search indexing.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        from app.services.openai import FileService, VectorStoreService
        from app.models.database import Profile

        # Validate content
        if not text_request.content or not text_request.content.strip():
            raise HTTPException(status_code=400, detail="Content cannot be empty")

        if len(text_request.content) > 10_000_000:  # 10MB limit
            raise HTTPException(status_code=400, detail="Content too large (max 10MB)")

        # Prepare metadata - merge tags into metadata
        metadata = text_request.metadata or {}
        if text_request.tags:
            metadata['tags'] = text_request.tags

        # Create knowledge item (text entry)
        knowledge_item = KnowledgeItem(
            user_id=user_id,
            folder_id=text_request.folder_id,
            title=text_request.title,
            description=text_request.description,
            content=text_request.content,
            filename=None,  # No file for text entries
            content_type='text/plain',  # Text content type
            size_bytes=None,  # No file size
            source_type='text',  # Direct text input
            item_metadata=metadata,
            status="pending"
        )
        db.add(knowledge_item)
        await db.flush()  # Get ID without committing
        logger.info(f"Created text knowledge item: {knowledge_item.id}")

        # Send to OpenAI for search indexing (parallel processing)
        openai_file = None
        if settings.ENABLE_OPENAI_VECTOR_STORES:
            try:
                file_service = FileService()
                vector_store_service = VectorStoreService()

                # Upload text to OpenAI
                openai_response = await file_service.upload_text_file(
                    content=text_request.content,
                    filename=f"{text_request.title}.txt",
                    purpose=settings.OPENAI_FILE_PURPOSE
                )

                # Get user profile for vector store
                profile_stmt = select(Profile).where(Profile.user_id == user_id)
                profile_result = await db.execute(profile_stmt)
                profile = profile_result.scalar_one_or_none()

                user_name = profile.full_name or profile.email if profile else str(user_id)

                # Get or create user's vector store
                vector_store = await vector_store_service.get_or_create_user_vector_store(
                    user_id=user_id,
                    user_name=user_name,
                    db=db
                )

                # Add to vector store with attributes
                attributes = {
                    "folder_id": str(text_request.folder_id),
                    "title": text_request.title,
                    "source_type": "text",
                }

                vector_store_file = await vector_store_service.add_file_to_vector_store(
                    vector_store_id=vector_store.id,
                    file_id=openai_response.id,
                    attributes=attributes
                )

                # Create OpenAIFile record
                openai_file = OpenAIFile(
                    knowledge_item_id=knowledge_item.id,
                    openai_file_id=openai_response.id,
                    openai_vector_store_file_id=vector_store_file.id,
                    vector_store_id=vector_store.id,
                    status="completed",
                    openai_attributes=attributes,
                    usage_bytes=getattr(openai_response, 'bytes', 0),
                    completed_at=datetime.utcnow()
                )
                db.add(openai_file)
                logger.info(f"Created OpenAIFile record for text entry: {openai_file.openai_file_id}")

            except Exception as e:
                logger.error(f"OpenAI processing failed for text entry: {e}")
                # Continue without OpenAI - don't fail the text entry

        # Update status
        knowledge_item.status = "completed" if openai_file else "failed"

        # Commit all records
        await db.commit()
        logger.info(f"✅ Text entry created successfully: {knowledge_item.id}")

        # Prepare response
        response_data = {
            "id": str(knowledge_item.id),
            "user_id": str(user_id),
            "folder_id": str(text_request.folder_id),
            "title": text_request.title,
            "description": text_request.description,
            "content": text_request.content,
            "content_type": "text/plain",
            "source_type": "text",
            "status": knowledge_item.status,
            "tags": text_request.tags,
            "metadata": text_request.metadata,
            "created_at": knowledge_item.created_at.isoformat() if knowledge_item.created_at else None,
            "updated_at": knowledge_item.updated_at.isoformat() if knowledge_item.updated_at else None,
            "filename": None,  # No file for text entries
            "size_bytes": None,
            "openai_info": {
                "indexed": openai_file is not None,
                "status": "completed" if openai_file else "skipped",
                "vector_store_id": openai_file.vector_store_id if openai_file else None,
                "openai_file_id": openai_file.openai_file_id if openai_file else None
            }
        }

        return TextEntryResponse(
            success=True,
            message=f"Text entry '{text_request.title}' created successfully",
            item=response_data
        )

    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create text entry: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create text entry")


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
            from app.services.processing_service import processing_service
            background_tasks.add_task(processing_service.process_knowledge_item, knowledge_item.id)
            logger.info(f"Added background processing task for knowledge item {knowledge_item.id}")
        except Exception as e:
            logger.error(f"Failed to add background task for content creation: {e}", exc_info=True)
            # Mark item as failed so user knows there's an issue
            knowledge_item.status = "failed"
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
                "status": knowledge_item.status
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
            KnowledgeItem.status.in_(['completed', 'processing', 'pending'])  # Include items being processed
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
                from app.services.processing_service import processing_service
                background_tasks.add_task(processing_service.process_knowledge_item, knowledge_item.id)
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
            from app.services.processing_service import processing_service
            background_tasks.add_task(processing_service.process_knowledge_item, knowledge_item.id)
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


@router.get("/export/folder/{folder_id}")
async def export_folder_as_zip(
    folder_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Export all items in a folder as a ZIP file.
    Includes content, metadata, and folder structure.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # Get folder information
        from app.models.database import Folder as DBFolder
        from sqlalchemy import select

        folder_stmt = select(DBFolder).where(
            DBFolder.id == folder_id,
            DBFolder.user_id == user_id
        )
        folder_result = await db.execute(folder_stmt)
        folder = folder_result.scalar_one_or_none()

        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")

        # Get all items in folder
        items = await content_service.get_folder_contents(
            db=db,
            user_id=user_id,
            folder_id=folder_id
        )

        # Create ZIP file in memory
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add folder metadata
            folder_info = {
                "folder_name": folder.name,
                "folder_path": folder.path,
                "export_date": datetime.utcnow().isoformat(),
                "total_items": len(items)
            }
            zip_file.writestr("folder_info.json", json.dumps(folder_info, indent=2))

            # Add each item
            for item in items:
                # Create safe filename
                safe_title = "".join(c if c.isalnum() or c in (' ', '.', '_', '-') else '_' for c in item.title)

                # Add item content as text file
                content_filename = f"items/{safe_title}.txt"
                zip_file.writestr(content_filename, item.content or "")

                # Add item metadata
                metadata = {
                    "id": str(item.id),
                    "title": item.title,
                    "content_type": item.content_type,
                    "source_url": item.source_url,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                    "updated_at": item.updated_at.isoformat() if item.updated_at else None,
                    "processing_status": item.processing_status,
                    "total_chunks": item.total_chunks
                }
                metadata_filename = f"metadata/{safe_title}_metadata.json"
                zip_file.writestr(metadata_filename, json.dumps(metadata, indent=2))

        # Prepare response
        zip_buffer.seek(0)

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={folder.name.replace(' ', '_')}_export.zip"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.get("/export/item/{item_id}")
async def export_item_as_zip(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Export a single item as a ZIP file.
    Includes content and metadata.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # Get the item
        item = await content_service.get_knowledge_item(
            db=db,
            user_id=user_id,
            item_id=item_id
        )

        if not item:
            raise HTTPException(status_code=404, detail="Item not found")

        # Create ZIP file in memory
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Create safe filename
            safe_title = "".join(c if c.isalnum() or c in (' ', '.', '_', '-') else '_' for c in item.title)

            # Add item content
            content_filename = f"{safe_title}.txt"
            zip_file.writestr(content_filename, item.content or "")

            # Add item metadata
            metadata = {
                "id": str(item.id),
                "title": item.title,
                "content_type": item.content_type,
                "source_url": item.source_url,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
                "processing_status": item.processing_status,
                "total_chunks": item.total_chunks,
                "export_date": datetime.utcnow().isoformat()
            }
            metadata_filename = f"{safe_title}_metadata.json"
            zip_file.writestr(metadata_filename, json.dumps(metadata, indent=2))

        # Prepare response
        zip_buffer.seek(0)

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={safe_title}_export.zip"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Export failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.get("/{item_id}/download-url")
async def get_content_download_url(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth),
    expiration_hours: int = 1
):
    """
    Generate a signed download URL for content stored in cloud storage.

    This endpoint is used when content is stored in GCS/S3/Supabase and users
    need a temporary authenticated URL to access the file.

    Args:
        item_id: UUID of the knowledge item
        expiration_hours: Hours until the signed URL expires (default: 1, max: 24)

    Returns:
        JSON with signed download URL and expiration time
    """
    try:
        user_id = UUID(auth_data["user_id"])

        # Limit expiration to 24 hours
        expiration_hours = min(expiration_hours, 24)
        expiration_seconds = expiration_hours * 3600

        # Get the content item and verify ownership
        item_stmt = select(KnowledgeItem).where(
            KnowledgeItem.id == item_id,
            KnowledgeItem.user_id == user_id
        )
        item_result = await db.execute(item_stmt)
        item = item_result.scalar_one_or_none()

        if not item:
            raise HTTPException(status_code=404, detail="Content not found")

        # Extract storage_path from metadata
        storage_path = None
        if item.item_metadata and isinstance(item.item_metadata, dict):
            storage_path = item.item_metadata.get("storage_path")

        # If no storage_path in metadata, try extracting from source_url
        if not storage_path and item.source_url:
            # Handle gs://bucket/path format
            if item.source_url.startswith("gs://"):
                # Extract path after bucket name
                parts = item.source_url[5:].split("/", 1)
                if len(parts) > 1:
                    storage_path = parts[1]
            # Handle http://storage.googleapis.com/bucket/path format
            elif "storage.googleapis.com" in item.source_url:
                parts = item.source_url.split("/")
                bucket_index = parts.index("storage.googleapis.com") + 1
                if len(parts) > bucket_index + 1:
                    storage_path = "/".join(parts[bucket_index + 1:])

        if not storage_path:
            raise HTTPException(
                status_code=400,
                detail="This content is not stored in cloud storage or storage path not found"
            )

        # Generate signed download URL
        from app.core.storage import storage_service
        signed_url = await storage_service.generate_signed_download_url(
            storage_path,
            expiration_seconds
        )

        return {
            "download_url": signed_url,
            "expires_in_seconds": expiration_seconds,
            "storage_path": storage_path
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate download URL: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate download URL: {str(e)}"
        )


@router.get("/user/storage-usage")
async def get_user_storage_usage(
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Get user's storage usage statistics.

    Returns:
        Storage usage information including used bytes, total limit, and percentages
    """
    try:
        user_id = UUID(auth_data["user_id"])
        STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024  # 1 GB per user

        from sqlalchemy import func, select
        from app.models.database import KnowledgeItem

        # Calculate total storage used by user
        # Sum up content size for text content and file sizes for uploads
        stmt = select(
            func.sum(func.length(KnowledgeItem.content)).label("total_content_bytes"),
            func.sum(KnowledgeItem.size_bytes).label("total_file_bytes"),
            func.count(KnowledgeItem.id).label("total_items")
        ).where(
            KnowledgeItem.user_id == user_id
        )

        result = await db.execute(stmt)
        row = result.first()

        # Calculate total bytes used
        content_bytes = row.total_content_bytes or 0
        file_bytes = row.total_file_bytes or 0
        total_used_bytes = content_bytes + file_bytes

        # Format bytes for display
        def format_bytes(bytes_count: int) -> str:
            if bytes_count == 0:
                return "0 B"
            k = 1024
            sizes = ["B", "KB", "MB", "GB"]
            i = int(math.floor(math.log(bytes_count) / math.log(k)))
            return f"{round(bytes_count / math.pow(k, i), 1)} {sizes[i]}"

        # Calculate percentage
        used_percentage = (total_used_bytes / STORAGE_LIMIT_BYTES) * 100
        used_percentage = min(used_percentage, 100)  # Cap at 100%

        return {
            "used_bytes": total_used_bytes,
            "total_bytes": STORAGE_LIMIT_BYTES,
            "used_percentage": used_percentage,
            "used_formatted": format_bytes(total_used_bytes),
            "total_formatted": format_bytes(STORAGE_LIMIT_BYTES),
            "stats": {
                "total_items": row.total_items or 0,
                "content_bytes": content_bytes,
                "file_bytes": file_bytes,
                "content_formatted": format_bytes(content_bytes),
                "file_formatted": format_bytes(file_bytes)
            }
        }

    except Exception as e:
        logger.error(f"Failed to get storage usage: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get storage usage")
