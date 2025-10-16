"""
Content processing service for text extraction and OpenAI vector stores integration.
"""
import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import KnowledgeItem, GCSFile, OpenAIFile, Profile
from app.config import settings
from app.services.document_processors import DocumentProcessorFactory

logger = logging.getLogger(__name__)


class ProcessingService:
    """Simple service for processing content with OpenAI vector stores."""

    async def process_knowledge_item(self, knowledge_item_id: UUID) -> Dict[str, Any]:
        """
        Process knowledge item by extracting text and uploading to OpenAI vector stores.

        Simplified flow for new 3-table architecture:
        1. Get knowledge item
        2. If it's a file upload, extract text and upload to OpenAI
        3. If it's text entry, upload directly to OpenAI
        4. Update knowledge item status

        Args:
            knowledge_item_id: ID of knowledge item to process

        Returns:
            Dict with processing results
        """
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            # Get knowledge item
            knowledge_item = await self._get_knowledge_item(db, knowledge_item_id)
            if not knowledge_item:
                raise ValueError(f"Knowledge item {knowledge_item_id} not found")

            try:
                # Update status to processing
                knowledge_item.status = 'processing'
                await db.commit()

                if knowledge_item.source_type in ('text', 'ingest'):
                    # Direct text entry - upload to OpenAI as-is
                    result = await self._process_text_entry(db, knowledge_item)
                elif knowledge_item.source_type == 'upload':
                    # File upload - extract text then upload to OpenAI
                    result = await self._process_file_upload(db, knowledge_item)
                else:
                    raise ValueError(f"Unsupported source type: {knowledge_item.source_type}")

                # Update status to completed
                knowledge_item.status = 'completed'
                await db.commit()

                return result

            except Exception as e:
                logger.error(f"Processing failed for knowledge item {knowledge_item_id}: {e}", exc_info=True)
                knowledge_item.status = 'failed'
                await db.commit()
                raise

    # ========================================================================
    # Helper Methods
    # ========================================================================

    async def _process_text_entry(self, db: AsyncSession, item: KnowledgeItem) -> Dict[str, Any]:
        """Process a text entry by uploading directly to OpenAI."""
        try:
            if settings.ENABLE_OPENAI_VECTOR_STORES:
                # Upload to OpenAI vector store
                await self._upload_to_openai_vector_store(db, item, item.content)

            return {
                "success": True,
                "knowledge_item_id": str(item.id),
                "content_length": len(item.content),
                "source_type": "text"
            }
        except Exception as e:
            logger.error(f"Failed to process text entry {item.id}: {e}")
            raise

    async def _process_file_upload(self, db: AsyncSession, item: KnowledgeItem) -> Dict[str, Any]:
        """Process a file upload by extracting text and uploading to OpenAI."""
        try:
            # Get GCS file record
            gcs_stmt = select(GCSFile).where(GCSFile.knowledge_item_id == item.id)
            gcs_result = await db.execute(gcs_stmt)
            gcs_file = gcs_result.scalar_one_or_none()

            if not gcs_file:
                raise ValueError(f"No GCS file found for knowledge item {item.id}")

            # Download file from GCS
            from app.core.storage import storage_service
            file_bytes = await storage_service.download_content(gcs_file.object_path)

            # Extract text using document processor
            filename = item.filename or "unknown"
            processor = DocumentProcessorFactory.get_processor(filename)

            if not processor or not processor.is_available():
                logger.warning(f"No processor available for {filename}")
                extracted_text = ""
            else:
                extracted_text = await processor.extract_text(file_bytes, filename)
                extracted_text = self.sanitize_text_for_postgres(extracted_text)

            # Update item with extracted text
            item.content = extracted_text
            await db.commit()

            if settings.ENABLE_OPENAI_VECTOR_STORES and extracted_text:
                # Upload extracted text to OpenAI vector store
                await self._upload_to_openai_vector_store(db, item, extracted_text)

            return {
                "success": True,
                "knowledge_item_id": str(item.id),
                "extracted_text_length": len(extracted_text),
                "source_type": "upload"
            }
        except Exception as e:
            logger.error(f"Failed to process file upload {item.id}: {e}")
            raise

    async def _upload_to_openai_vector_store(self, db: AsyncSession, item: KnowledgeItem, content: str):
        """Upload content to OpenAI vector store using efficient upload_and_poll method."""
        try:
            from app.services.openai import VectorStoreService

            vector_store_service = VectorStoreService()

            # Get or create user's vector store
            profile_stmt = select(Profile).where(Profile.user_id == item.user_id)
            profile_result = await db.execute(profile_stmt)
            profile = profile_result.scalar_one_or_none()

            user_name = profile.full_name or profile.email if profile else str(item.user_id)

            vector_store = await vector_store_service.get_or_create_user_vector_store(
                user_id=item.user_id,
                user_name=user_name,
                db=db
            )

            # Create attributes for filtering
            attributes = {
                "knowledge_item_id": str(item.id),
                "folder_id": str(item.folder_id),
                "title": item.title,
                "source_type": item.source_type,
            }

            # Create filename for OpenAI
            filename = f"{item.title}.txt"

            # Use efficient upload_and_poll method - uploads file directly to vector store
            # This combines file upload + vector store file creation + polling in one operation
            vector_store_file = await vector_store_service.upload_file_and_poll(
                vector_store_id=vector_store.id,
                content=content,
                filename=filename,
                attributes=attributes
            )

            # Create OpenAI file record
            # Note: upload_and_poll returns the vector store file, not the base file
            # The file_id is accessible via vector_store_file.id
            openai_file = OpenAIFile(
                knowledge_item_id=item.id,
                openai_file_id=vector_store_file.id,  # This is the file ID from OpenAI
                openai_vector_store_file_id=vector_store_file.id,  # Vector store file ID
                vector_store_id=vector_store.id,
                status="completed",
                openai_attributes=attributes,
                usage_bytes=vector_store_file.usage_bytes or 0,
                completed_at=datetime.utcnow()  # Use timezone-naive datetime for PostgreSQL
            )
            db.add(openai_file)
            await db.commit()

            logger.info(f"Successfully uploaded to OpenAI vector store: {item.id}")

        except Exception as e:
            logger.error(f"OpenAI vector store upload failed for {item.id}: {e}", exc_info=True)
            # Don't fail processing, just log error

    @staticmethod
    def sanitize_text_for_postgres(text: str) -> str:
        """Sanitize text for PostgreSQL UTF-8 compatibility."""
        if not text:
            return text

        try:
            # Remove null bytes and control characters
            text = text.replace('\x00', '')
            text = re.sub(r'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)

            # Normalize unicode
            text = unicodedata.normalize('NFC', text)

            # Handle invalid UTF-8
            text = text.encode('utf-8', errors='ignore').decode('utf-8', errors='ignore')

            # Remove zero-width characters
            for char in ['\u200b', '\u200c', '\u200d', '\ufeff']:
                text = text.replace(char, '')

            # Normalize non-breaking spaces
            text = text.replace('\xa0', ' ')

            return text
        except Exception as e:
            logger.error(f"Text sanitization error: {e}")
            return text.replace('\x00', '') if text else ""

    async def _get_knowledge_item(self, db: AsyncSession, item_id: UUID) -> Optional[KnowledgeItem]:
        """Get knowledge item by ID."""
        result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
        return result.scalar_one_or_none()


# Service instance
processing_service = ProcessingService()
