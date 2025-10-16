"""
File upload and management endpoints.
"""
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import validate_any_auth
from app.services.file_service import file_service
from app.services.processing_service import processing_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder_id: UUID = Form(...),
    title: str = Form(...),
    description: str = Form(None),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Upload a file and create a knowledge item.

    The file is uploaded to storage immediately and a knowledge item is created.
    Text extraction and OpenAI indexing happens in the background.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        result = await file_service.upload_file(
            db=db,
            user_id=user_id,
            file=file,
            folder_id=folder_id,
            title=title,
            description=description
        )

        # Trigger background processing for text extraction and OpenAI indexing
        knowledge_item_id = result["item"]["id"]
        background_tasks.add_task(
            processing_service.process_knowledge_item,
            knowledge_item_id
        )
        logger.info(f"Queued background processing for knowledge item {knowledge_item_id}")

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"File upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="File upload failed")


@router.get("/download/{item_id}")
async def download_file(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Download a file from storage.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        file_response = await file_service.download_file(
            db=db,
            user_id=user_id,
            item_id=item_id
        )
        return file_response
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="File download failed")


@router.get("/supported-formats")
async def get_supported_formats():
    """
    Get information about all supported file formats.

    Returns format information grouped by category, useful for frontend display.
    """
    from app.services.document_processors import DocumentProcessorFactory

    try:
        format_info = DocumentProcessorFactory.get_format_display_info()
        processor_info = DocumentProcessorFactory.get_processor_info()
        stats = DocumentProcessorFactory.get_statistics()

        return {
            **format_info,
            "processors": processor_info,
            "stats": stats
        }
    except Exception as e:
        logger.error(f"Failed to get supported formats: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve supported formats"
        )