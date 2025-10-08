"""
File upload and processing service.
"""
import io
import re
import logging
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime, timezone
from fastapi import UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import KnowledgeItem, Folder
from app.models.schemas import (
    FileUploadResponse, ProcessContentResponse, ContentType, ProcessingStatus
)
from app.services.content_service import content_service
from app.core.storage import storage_service
from app.config import settings

logger = logging.getLogger(__name__)


class FileService:
    """Service for handling file uploads and processing."""

    async def upload_file(
        self,
        db: AsyncSession,
        user_id: UUID,
        file: UploadFile,
        folder_id: UUID,
        title: str,
        description: Optional[str] = None
    ) -> FileUploadResponse:
        """
        Upload a file and create a knowledge item.

        Args:
            db: Database session
            user_id: User ID
            file: Uploaded file
            folder_id: Target folder ID
            title: Title for the knowledge item
            description: Optional description

        Returns:
            FileUploadResponse with upload results
        """
        try:
            # Verify folder exists and belongs to user
            folder_stmt = select(Folder).where(
                Folder.id == folder_id,
                Folder.user_id == user_id
            )
            folder_result = await db.execute(folder_stmt)
            folder = folder_result.scalar_one_or_none()

            if not folder:
                raise ValueError("Invalid folder or insufficient permissions")

            # Read file content
            file_content = await file.read()
            file_size = len(file_content)

            # Check file size - Cloud Run has a 32MB request body limit
            # For larger files, use direct GCS upload with signed URLs
            MAX_FILE_SIZE = 32 * 1024 * 1024  # 32MB limit (Cloud Run maximum)

            if file_size > MAX_FILE_SIZE:
                file_size_mb = file_size / (1024 * 1024)
                max_size_mb = MAX_FILE_SIZE / (1024 * 1024)
                raise ValueError(
                    f"File too large. Your file is {file_size_mb:.1f}MB, "
                    f"but maximum size is {max_size_mb:.0f}MB. "
                    f"Cloud Run has a 32MB request limit. For larger files, please contact support."
                )

            # Log file upload for monitoring
            logger.info(
                f"Uploading file: {file.filename} "
                f"({file_size / (1024 * 1024):.1f}MB) "
                f"for user {user_id}"
            )

            # Generate clean, human-readable filename
            storage_filename = self._generate_storage_filename(title, file.filename)
            storage_path = f"{user_id}/{folder_id}/{storage_filename}"

            # Detect content type like edge function
            content_type = self._get_content_type_from_file(file.filename or '', file.content_type or '')

            # Upload file to storage first
            try:
                storage_url = await storage_service.upload_content(
                    storage_path,
                    file_content,
                    file.content_type or "application/octet-stream"
                )
            except Exception as e:
                logger.error(f"Failed to upload file to storage: {e}")
                raise ValueError("Failed to upload file to storage")

            # Create knowledge item with file reference (match edge function format)
            file_content_text = f"[FILE:{storage_path}]"

            # Prepare metadata to match edge function format
            metadata = {
                "storage_path": storage_path,
                "original_filename": file.filename,
                "file_size": file_size,
                "mime_type": file.content_type,
                "stored_in_storage": True,
                "description": description or None
            }

            # Create knowledge item
            from app.models.schemas import KnowledgeItemCreate
            item_data = KnowledgeItemCreate(
                folder_id=folder_id,
                title=title,
                content=file_content_text,
                content_type=content_type,
                source_url=storage_url,
                metadata=metadata
            )

            knowledge_item = await content_service.create_knowledge_item(
                db=db,
                user_id=user_id,
                item_data=item_data
            )

            # Return response matching edge function format
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
                "file_info": {
                    "filename": file.filename,
                    "size": file_size,
                    "type": file.content_type,
                    "content_type": content_type
                }
            }

        except Exception as e:
            logger.error(f"File upload failed: {e}")
            raise

    async def process_content(
        self,
        db: AsyncSession,
        user_id: UUID,
        knowledge_item_id: UUID,
        batch_offset: int = 0
    ) -> ProcessContentResponse:
        """
        Process content for embeddings generation.

        Args:
            db: Database session
            user_id: User ID
            knowledge_item_id: Knowledge item ID to process
            batch_offset: Batch offset for processing

        Returns:
            ProcessContentResponse with processing results
        """
        # Verify the knowledge item belongs to the user
        stmt = select(KnowledgeItem).where(
            KnowledgeItem.id == knowledge_item_id,
            KnowledgeItem.user_id == user_id
        )
        result = await db.execute(stmt)
        item = result.scalar_one_or_none()

        if not item:
            raise ValueError("Knowledge item not found or access denied")

        try:
            # Placeholder for processing - actual implementation will be added with embeddings
            # Update the processing status
            item.processing_status = ProcessingStatus.COMPLETED
            await db.commit()

            return ProcessContentResponse(
                success=True,
                message="Content processed successfully",
                knowledge_item_id=knowledge_item_id,
                vectors_created=0,  # Placeholder
                chunks_processed=1,  # Placeholder
                processing_status=ProcessingStatus.COMPLETED
            )

        except Exception as e:
            logger.error(f"Content processing failed: {e}")
            raise ValueError(f"Content processing failed: {str(e)}")

    async def download_file(
        self,
        db: AsyncSession,
        user_id: UUID,
        item_id: UUID
    ) -> StreamingResponse:
        """
        Download a file from storage.

        Args:
            db: Database session
            user_id: User ID
            item_id: Knowledge item ID

        Returns:
            StreamingResponse with file content
        """
        # Get the knowledge item
        stmt = select(KnowledgeItem).where(
            KnowledgeItem.id == item_id,
            KnowledgeItem.user_id == user_id
        )
        result = await db.execute(stmt)
        item = result.scalar_one_or_none()

        if not item:
            raise ValueError("File not found or access denied")

        if not item.item_metadata or not item.item_metadata.get("storage_path"):
            raise ValueError("File not available for download")

        try:
            # Download from storage
            storage_path = item.item_metadata["storage_path"]
            filename = item.item_metadata.get("original_filename", "download")
            mime_type = item.item_metadata.get("mime_type", "application/octet-stream")

            # Download file content from storage
            file_content = await storage_service.download_content(storage_path)

            def generate():
                yield file_content

            return StreamingResponse(
                generate(),
                media_type=mime_type,
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )

        except Exception as e:
            logger.error(f"File download failed: {e}")
            raise ValueError("File download failed")

    def _get_content_type_from_file(self, filename: str, mime_type: str) -> str:
        """
        Get content type from filename and MIME type (match edge function logic).

        Args:
            filename: Original filename
            mime_type: MIME type from file

        Returns:
            Content type string
        """
        # Match the edge function logic exactly
        ext = filename.split('.')[-1].lower() if '.' in filename else ''

        if mime_type.startswith('image/'):
            return 'image'
        if mime_type == 'application/pdf' or ext == 'pdf':
            return 'pdf'
        if mime_type.startswith('text/') or ext in ['txt', 'md', 'csv']:
            return 'text'
        if ext in ['doc', 'docx', 'odt']:
            return 'document'
        if ext in ['xls', 'xlsx', 'ods']:
            return 'spreadsheet'
        if ext in ['ppt', 'pptx', 'odp']:
            return 'presentation'
        if mime_type.startswith('audio/') or ext in ['mp3', 'wav', 'm4a']:
            return 'audio'
        if mime_type.startswith('video/') or ext in ['mp4', 'avi', 'mov']:
            return 'video'

        return 'file'

    def _generate_storage_filename(self, title: str, original_filename: Optional[str]) -> str:
        """
        Generate clean, human-readable storage filename from title or filename.

        Creates filesystem-safe filenames using title (preferred) or original filename.
        Removes unsafe characters, limits length, and preserves file extensions.

        Args:
            title: Knowledge item title
            original_filename: Original uploaded filename

        Returns:
            Sanitized filename with extension (e.g., "my_document.pdf")
        """
        # Use title if available, otherwise use original filename without extension
        if title:
            base_name = title
        elif original_filename:
            # Remove extension from original filename to use as base
            base_name = original_filename.rsplit('.', 1)[0] if '.' in original_filename else original_filename
        else:
            base_name = 'untitled'

        # Sanitize for filesystem safety
        # Remove/replace unsafe characters: / \ : * ? " < > | and other non-printable chars
        safe_name = re.sub(r'[/\\:*?"<>|\x00-\x1f\x7f-\x9f]', '_', base_name)

        # Remove leading/trailing spaces and dots (problematic on some filesystems)
        safe_name = safe_name.strip('. ')

        # Replace multiple consecutive spaces, underscores, or hyphens with single underscore
        safe_name = re.sub(r'[\s_-]+', '_', safe_name)

        # Limit length to 200 chars (leaving room for extension and folder paths)
        safe_name = safe_name[:200]

        # Handle edge case: sanitization resulted in empty string
        if not safe_name:
            safe_name = 'file'

        # Get extension from original filename
        ext = ''
        if original_filename and '.' in original_filename:
            # Use lowercase extension for consistency
            ext = '.' + original_filename.rsplit('.', 1)[1].lower()

        return f"{safe_name}{ext}"

    async def _store_file_content_for_processing(self, knowledge_item_id: UUID, content: bytes):
        """
        Store file content temporarily for processing.

        In a real implementation, this might use a cache or temporary storage.
        For now, we'll modify the processing service to handle this directly.
        """
        # This is a placeholder - in practice, you might store this in Redis,
        # a temporary file, or pass it directly to the processing service
        pass

    async def generate_signed_upload_url(
        self,
        db: AsyncSession,
        user_id: UUID,
        filename: str,
        content_type: str,
        folder_id: UUID,
        file_size: int
    ) -> Dict[str, Any]:
        """
        Generate a signed URL for direct upload to cloud storage.

        This allows clients to upload large files (>32MB) directly to GCS,
        bypassing the Cloud Run request size limit.

        Args:
            db: Database session
            user_id: User ID
            filename: Original filename
            content_type: MIME type
            folder_id: Target folder ID
            file_size: File size in bytes

        Returns:
            Dict with upload_url, storage_path, and expires_in
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

        # Generate storage path
        import uuid
        from datetime import datetime, timezone

        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
        random_id = str(uuid.uuid4())[:8]
        # Use clean filename for storage
        clean_filename = self._generate_storage_filename("", filename)
        storage_path = f"{user_id}/{folder_id}/{timestamp}-{random_id}-{clean_filename}"

        # Generate signed URL (1 hour expiration)
        expiration_seconds = 3600
        try:
            signed_url = await storage_service.generate_signed_upload_url(
                storage_path,
                content_type,
                expiration_seconds
            )

            return {
                "upload_url": signed_url,
                "storage_path": storage_path,
                "expires_in": expiration_seconds
            }
        except Exception as e:
            logger.error(f"Failed to generate signed URL: {e}")
            raise ValueError("Failed to generate signed upload URL")

    async def create_knowledge_item_from_storage(
        self,
        db: AsyncSession,
        user_id: UUID,
        storage_path: str,
        folder_id: UUID,
        title: str,
        description: Optional[str],
        file_size: int,
        content_type: str
    ) -> Dict[str, Any]:
        """
        Create a knowledge item from a file already uploaded to storage.

        This is called after a direct upload to GCS via signed URL.

        Args:
            db: Database session
            user_id: User ID
            storage_path: Path to file in storage
            folder_id: Target folder ID
            title: Title for the knowledge item
            description: Optional description
            file_size: File size in bytes
            content_type: MIME type

        Returns:
            FileUploadResponse dict
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

        # Get public URL for the uploaded file
        # For GCS, construct the public URL
        storage_url = f"gs://{settings.GCS_BUCKET_NAME}/{storage_path}"

        # Create knowledge item with file reference
        file_content_text = f"[FILE:{storage_path}]"

        # Detect content type from filename
        filename = storage_path.split('/')[-1]
        detected_content_type = self._get_content_type_from_file(filename, content_type)

        # Prepare metadata
        metadata = {
            "storage_path": storage_path,
            "original_filename": filename,
            "file_size": file_size,
            "mime_type": content_type,
            "stored_in_storage": True,
            "description": description or None,
            "upload_method": "signed_url"  # Track upload method
        }

        # Create knowledge item
        from app.models.schemas import KnowledgeItemCreate
        item_data = KnowledgeItemCreate(
            folder_id=folder_id,
            title=title,
            content=file_content_text,
            content_type=detected_content_type,
            source_url=storage_url,
            metadata=metadata
        )

        knowledge_item = await content_service.create_knowledge_item(
            db=db,
            user_id=user_id,
            item_data=item_data
        )

        # Return response matching regular upload format
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
            "file_info": {
                "filename": filename,
                "size": file_size,
                "type": content_type,
                "content_type": detected_content_type,
                "storage_path": storage_path,
                "upload_method": "signed_url"
            }
        }


# Service instance
file_service = FileService()