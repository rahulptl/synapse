"""
File upload and management endpoints.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import validate_dual_auth
from app.services.file_service import file_service
from app.models.schemas import ProcessContentRequest
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def process_knowledge_item_background(knowledge_item_id: UUID):
    """
    Background task to process a knowledge item.

    This is a sync function that properly handles the async processing
    using asyncio.run() which is the correct pattern for FastAPI BackgroundTasks.
    """
    import asyncio

    async def _async_process():
        try:
            from app.services.processing_service import processing_service

            logger.info(f"✓ Background processing started for knowledge item {knowledge_item_id}")
            result = await processing_service.process_knowledge_item(knowledge_item_id)
            logger.info(f"✓ Background processing completed for {knowledge_item_id}: {result}")
            return result
        except Exception as e:
            logger.error(f"✗ Background processing failed for {knowledge_item_id}: {e}")
            # Update item status to failed
            try:
                from app.core.database import AsyncSessionLocal
                from app.models.schemas import ProcessingStatus
                from app.models.database import KnowledgeItem
                from sqlalchemy import update

                async with AsyncSessionLocal() as db:
                    await db.execute(
                        update(KnowledgeItem)
                        .where(KnowledgeItem.id == knowledge_item_id)
                        .values(processing_status=ProcessingStatus.FAILED)
                    )
                    await db.commit()
                    logger.info(f"Updated status to FAILED for {knowledge_item_id}")
            except Exception as status_error:
                logger.error(f"Failed to update status for {knowledge_item_id}: {status_error}")
            raise

    try:
        # Use asyncio.run() which is the proper way to run async code from sync context
        result = asyncio.run(_async_process())
        logger.info(f"✓ Background task completed successfully for {knowledge_item_id}")
        return result
    except Exception as e:
        logger.error(f"✗ Background task execution failed for {knowledge_item_id}: {e}")
        return None


@router.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder_id: UUID = Form(...),
    title: str = Form(...),
    description: str = Form(None),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
):
    """
    Upload a file and create a knowledge item.

    Equivalent to: upload-file edge function
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # The file_service.upload_file already returns the correct format
        result = await file_service.upload_file(
            db=db,
            user_id=user_id,
            file=file,
            folder_id=folder_id,
            title=title,
            description=description
        )

        # Add background processing task
        try:
            knowledge_item_id = result["item"]["id"]  # Already a UUID object
            if isinstance(knowledge_item_id, str):
                knowledge_item_id = UUID(knowledge_item_id)
            background_tasks.add_task(process_knowledge_item_background, knowledge_item_id)
            logger.info(f"Added background processing task for knowledge item {knowledge_item_id}")
        except Exception as e:
            logger.error(f"Failed to add background task: {e}")
            # Continue without background processing

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="File upload failed")


@router.post("/process")
async def process_content(
    process_request: ProcessContentRequest,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
):
    """
    Process content for embeddings generation.

    Equivalent to: process-content edge function
    """
    user_id = UUID(auth_data["user_id"])

    try:
        result = await file_service.process_content(
            db=db,
            user_id=user_id,
            knowledge_item_id=process_request.knowledge_item_id,
            batch_offset=process_request.batch_offset
        )
        # Return safe format
        return {
            "success": result.success,
            "message": result.message,
            "knowledge_item_id": str(result.knowledge_item_id),
            "vectors_created": result.vectors_created,
            "chunks_processed": result.chunks_processed,
            "processing_status": result.processing_status
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Content processing failed")


@router.get("/download/{item_id}")
async def download_file(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
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


@router.get("/status/{item_id}")
async def get_processing_status(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_dual_auth)
):
    """
    Get processing status for a knowledge item.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        status = await file_service.get_processing_status(
            db=db,
            user_id=user_id,
            item_id=item_id
        )
        return status
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to get processing status")