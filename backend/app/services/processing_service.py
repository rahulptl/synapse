"""
Content processing service for text extraction and chunking.
"""
import logging
import re
import time
import unicodedata
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from app.models.database import KnowledgeItem, Vector
from app.models.schemas import ProcessingStatus, ContentType
from app.core.embeddings import embedding_service
from app.config import settings
from app.services.document_processors import DocumentProcessorFactory, ProcessingError as DocProcessingError

logger = logging.getLogger(__name__)

# ============================================================================
# Optional Library Imports
# ============================================================================

# HTML extraction (still used directly for HTML content type)
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None
    logger.warning("beautifulsoup4 unavailable; HTML extraction disabled")


# ============================================================================
# Processing Service
# ============================================================================

class ProcessingService:
    """Service for processing content and generating embeddings."""

    # ========================================================================
    # Public Methods
    # ========================================================================

    async def process_knowledge_item(self, knowledge_item_id: UUID) -> Dict[str, Any]:
        """
        Process a knowledge item for text extraction and embedding generation.

        Args:
            knowledge_item_id: ID of the knowledge item to process

        Returns:
            Dict with processing results including success status, vectors created,
            chunks processed, and extracted text length
        """
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            # Get the knowledge item
            item = await self._get_knowledge_item(db, knowledge_item_id)
            if not item:
                raise ValueError(f"Knowledge item {knowledge_item_id} not found")

            try:
                # Update status to processing
                await self._update_processing_status(db, knowledge_item_id, ProcessingStatus.PROCESSING)

                # Try smart chunking with Docling for supported file types
                chunks = None
                use_smart_chunking = False

                if settings.ENABLE_SMART_CHUNKING and item.item_metadata and 'original_filename' in item.item_metadata:
                    from app.services.document_processors import DocumentProcessorFactory
                    from app.services.document_processors.docling_processor import DoclingProcessor

                    filename = item.item_metadata['original_filename']
                    processor = DocumentProcessorFactory.get_processor(filename)

                    # Check if this file can use Docling smart chunking
                    if isinstance(processor, DoclingProcessor) and processor.is_available():
                        from app.core.storage import storage_service

                        try:
                            # Get file bytes from storage
                            file_bytes = await self._get_file_bytes(item, storage_service)

                            if file_bytes:
                                logger.info(f"Attempting Docling smart chunking for {filename}")

                                # Use Docling's smart chunking (structure-aware + token-aware)
                                chunks = await processor.extract_and_chunk(
                                    file_bytes=file_bytes,
                                    filename=filename,
                                    max_tokens=settings.SMART_CHUNK_MAX_TOKENS
                                )

                                if chunks:
                                    use_smart_chunking = True
                                    logger.info(
                                        f"✅ Smart chunking successful: {len(chunks)} chunks created for {filename}"
                                    )

                                    # Extract full text for storage (for search/display)
                                    extracted_text = "\n\n".join(chunks)
                                    text_to_process = self.sanitize_text_for_postgres(extracted_text)

                                    # Update item with extracted text
                                    if text_to_process:
                                        await self._update_item_content(db, knowledge_item_id, text_to_process)

                        except Exception as e:
                            logger.warning(
                                f"Docling smart chunking failed for {filename}, falling back to legacy: {e}"
                            )
                            chunks = None  # Will trigger fallback

                # Fallback to legacy extraction and chunking
                if not use_smart_chunking:
                    logger.info(f"Using legacy chunking for item {knowledge_item_id}")

                    # Extract and sanitize text
                    extracted_text = await self._extract_text_content(item)
                    if extracted_text:
                        extracted_text = self.sanitize_text_for_postgres(extracted_text)

                    # Update item with extracted text for file types
                    file_types_to_update = [
                        ContentType.PDF,
                        ContentType.DOC,
                        ContentType.DOCX,
                        ContentType.IMAGE,
                        ContentType.SPREADSHEET,  # XLSX, XLS, CSV
                        ContentType.PRESENTATION,  # PPTX, PPT
                    ]
                    if item.content_type in file_types_to_update and extracted_text:
                        await self._update_item_content(db, knowledge_item_id, extracted_text)

                    # Chunk text using legacy method
                    text_to_process = self.sanitize_text_for_postgres(extracted_text or item.content)
                    chunks = self._chunk_text(text_to_process)

                # Initialize progress tracking
                item.total_chunks = len(chunks)
                item.chunks_processed = 0
                item.processing_progress = 0.0
                await db.commit()

                # Generate and store embeddings (with parallel batch processing)
                vectors_created = await self._generate_and_store_embeddings(db, item, chunks)

                # Update status to completed
                await self._update_processing_status(db, knowledge_item_id, ProcessingStatus.COMPLETED)
                await db.commit()

                return {
                    "success": True,
                    "vectors_created": vectors_created,
                    "chunks_processed": len(chunks),
                    "extracted_text_length": len(text_to_process)
                }

            except Exception as e:
                logger.error(f"Processing failed for item {knowledge_item_id}: {e}", exc_info=True)
                await self._update_processing_status(db, knowledge_item_id, ProcessingStatus.FAILED)
                await db.commit()
                raise

    # ========================================================================
    # Text Sanitization
    # ========================================================================

    @staticmethod
    def sanitize_text_for_postgres(text: str) -> str:
        """
        Sanitize text for PostgreSQL UTF-8 compatibility.

        Removes:
        - Null bytes and control characters
        - Invalid UTF-8 sequences
        - Zero-width characters

        Args:
            text: Raw text to sanitize

        Returns:
            Sanitized text safe for PostgreSQL
        """
        if not text:
            return text

        try:
            # Remove null bytes and control characters (keep \t, \n, \r)
            text = text.replace('\x00', '')
            text = re.sub(r'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)

            # Normalize unicode (NFC)
            text = unicodedata.normalize('NFC', text)

            # Handle invalid UTF-8 sequences
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

    # ========================================================================
    # Text Extraction
    # ========================================================================

    async def _extract_text_content(self, item: KnowledgeItem) -> Optional[str]:
        """
        Extract text content from different file types.

        Uses DocumentProcessorFactory for modern formats (PDF, DOCX, etc.).
        Falls back to simple extraction for plain text/HTML.

        Args:
            item: Knowledge item to extract text from

        Returns:
            Extracted text or None
        """
        # Handle plain text and HTML directly
        if item.content_type == ContentType.TEXT:
            return item.content

        if item.content_type == ContentType.HTML:
            return self._extract_html_text(item.content)

        # Use processor framework for file-based content
        if item.item_metadata and 'original_filename' in item.item_metadata:
            from app.core.storage import storage_service

            filename = item.item_metadata['original_filename']
            processor = DocumentProcessorFactory.get_processor(filename)

            if processor and processor.is_available():
                try:
                    file_bytes = await self._get_file_bytes(item, storage_service)
                    if file_bytes:
                        logger.info(f"Extracting {filename} with {processor.__class__.__name__}")
                        text = await processor.extract_text(file_bytes, filename)
                        text = await processor.postprocess(text)
                        return self.sanitize_text_for_postgres(text)

                except Exception as e:
                    logger.warning(f"Processor failed for {filename}: {e}")

        # Final fallback
        return item.content

    def _extract_html_text(self, content: str) -> str:
        """Extract plain text from HTML content."""
        if not BeautifulSoup:
            return content

        try:
            soup = BeautifulSoup(content, 'html.parser')

            # Remove scripts and styles
            for element in soup(["script", "style"]):
                element.decompose()

            # Extract and clean text
            text = soup.get_text()
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            return ' '.join(chunk for chunk in chunks if chunk)

        except Exception as e:
            logger.error(f"HTML extraction error: {e}")
            return content

    # ========================================================================
    # Text Chunking
    # ========================================================================

    def _chunk_text(self, text: str) -> List[str]:
        """
        Split text into chunks for embedding generation.

        Args:
            text: Text to chunk

        Returns:
            List of text chunks
        """
        if not text:
            return []

        chunks = []
        start = 0
        chunk_size = settings.CHUNK_SIZE
        chunk_overlap = settings.CHUNK_OVERLAP

        while start < len(text):
            end = start + chunk_size

            # Find good break point (sentence ending)
            if end < len(text):
                search_start = max(start, end - 200)
                sentence_breaks = [i + 1 for i in range(search_start, end) if text[i] in '.!?\n']
                if sentence_breaks:
                    end = sentence_breaks[-1]

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            # Move with overlap
            start = max(start + 1, end - chunk_overlap)

        return chunks

    # ========================================================================
    # Embeddings
    # ========================================================================

    async def _generate_and_store_embeddings(
        self,
        db: AsyncSession,
        item: KnowledgeItem,
        chunks: List[str]
    ) -> int:
        """
        Generate embeddings for chunks using PARALLEL batch processing.

        This method processes chunks in parallel batches for 10-15x speedup compared
        to sequential processing. Progress is tracked in real-time with ETA calculation.

        Args:
            db: Database session
            item: KnowledgeItem being processed (for progress tracking)
            chunks: List of text chunks to embed

        Returns:
            Number of vectors created
        """
        # Delete existing vectors
        await db.execute(delete(Vector).where(Vector.knowledge_item_id == item.id))

        # Check API key configuration
        if not self._is_embedding_service_configured():
            logger.warning(f"Creating placeholder vectors for {item.id} - embeddings disabled")
            return await self._create_placeholder_vectors(db, item.id, chunks)

        # Configuration
        batch_size = 10  # Process 10 chunks simultaneously
        total_chunks = len(chunks)
        processed_count = 0
        start_time = time.time()

        logger.info(f"🔄 Generating embeddings for {total_chunks} chunks using parallel batch processing (batch_size={batch_size})")

        # Process in parallel batches
        for batch_start in range(0, total_chunks, batch_size):
            batch_end = min(batch_start + batch_size, total_chunks)
            batch_chunks = chunks[batch_start:batch_end]
            batch_num = (batch_start // batch_size) + 1
            total_batches = (total_chunks + batch_size - 1) // batch_size

            try:
                # PARALLEL: Use batch API (10x faster than sequential)
                logger.debug(f"Processing batch {batch_num}/{total_batches} ({len(batch_chunks)} chunks)")
                embeddings = await embedding_service.generate_embeddings_batch(
                    texts=batch_chunks,
                    batch_size=batch_size
                )

                # Store all embeddings in this batch
                for i, embedding in enumerate(embeddings):
                    chunk_index = batch_start + i
                    vector = Vector(
                        knowledge_item_id=item.id,
                        content_preview=chunks[chunk_index][:500],
                        embedding=embedding,
                        chunk_index=chunk_index
                    )
                    db.add(vector)
                    processed_count += 1

            except Exception as e:
                logger.error(f"Batch {batch_num} failed, falling back to individual processing: {e}")
                # Fallback: Process this batch sequentially with placeholders for failures
                for i, chunk in enumerate(batch_chunks):
                    chunk_index = batch_start + i
                    try:
                        embedding = await embedding_service.generate_embedding(chunk)
                    except Exception as individual_error:
                        logger.error(f"Chunk {chunk_index} failed: {individual_error}")
                        embedding = [0.0] * 1536  # Placeholder

                    vector = Vector(
                        knowledge_item_id=item.id,
                        content_preview=chunk[:500],
                        embedding=embedding,
                        chunk_index=chunk_index
                    )
                    db.add(vector)
                    processed_count += 1

            # Update progress after each batch
            progress = (processed_count / total_chunks) * 100.0

            # Calculate ETA
            elapsed = time.time() - start_time
            if processed_count > 0:
                avg_time_per_chunk = elapsed / processed_count
                remaining_chunks = total_chunks - processed_count
                eta_seconds = avg_time_per_chunk * remaining_chunks
                item.estimated_completion = datetime.utcnow() + timedelta(seconds=eta_seconds)
            else:
                item.estimated_completion = None

            item.chunks_processed = processed_count
            item.processing_progress = progress

            # Commit progress after each batch
            await db.commit()

            logger.info(
                f"📊 Progress: {processed_count}/{total_chunks} chunks ({progress:.1f}%) - "
                f"Batch {batch_num}/{total_batches} complete"
            )

        total_time = time.time() - start_time
        logger.info(
            f"✅ Created {processed_count} vectors for {item.id} in {total_time:.2f}s "
            f"({total_chunks / total_time:.1f} chunks/sec)"
        )

        return processed_count

    async def _create_placeholder_vectors(
        self,
        db: AsyncSession,
        knowledge_item_id: UUID,
        chunks: List[str]
    ) -> int:
        """Create placeholder vectors when embedding service is unavailable."""
        for i, chunk in enumerate(chunks):
            vector = Vector(
                knowledge_item_id=knowledge_item_id,
                content_preview=chunk[:500],
                embedding=[0.0] * 1536,
                chunk_index=i
            )
            db.add(vector)

        return len(chunks)

    # ========================================================================
    # Database Operations
    # ========================================================================

    async def _get_knowledge_item(self, db: AsyncSession, item_id: UUID) -> Optional[KnowledgeItem]:
        """Get knowledge item by ID."""
        result = await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id))
        return result.scalar_one_or_none()

    async def _update_processing_status(
        self,
        db: AsyncSession,
        knowledge_item_id: UUID,
        status: ProcessingStatus
    ):
        """Update processing status of a knowledge item."""
        await db.execute(
            update(KnowledgeItem)
            .where(KnowledgeItem.id == knowledge_item_id)
            .values(processing_status=status)
        )

    async def _update_item_content(
        self,
        db: AsyncSession,
        knowledge_item_id: UUID,
        content: str
    ):
        """Update content of a knowledge item with extracted text."""
        await db.execute(
            update(KnowledgeItem)
            .where(KnowledgeItem.id == knowledge_item_id)
            .values(content=content)
        )

    # ========================================================================
    # Helper Methods
    # ========================================================================

    @staticmethod
    async def _get_file_bytes(item: KnowledgeItem, storage_service) -> Optional[bytes]:
        """Extract file bytes from storage."""
        if not (item.content.startswith("[FILE_STORED:") or item.content.startswith("[FILE:")):
            return None

        # Extract storage path
        if item.content.startswith("[FILE_STORED:"):
            storage_path = item.content.replace("[FILE_STORED:", "").rstrip("]")
        elif item.content.startswith("[FILE:"):
            storage_path = item.content.replace("[FILE:", "").rstrip("]")
        else:
            storage_path = item.content

        return await storage_service.download_content(storage_path)

    @staticmethod
    def _is_embedding_service_configured() -> bool:
        """Check if embedding service is properly configured."""
        return bool(
            settings.OPENAI_API_KEY and
            settings.OPENAI_API_KEY != "your-openai-api-key"
        )


# ============================================================================
# Service Instance
# ============================================================================

processing_service = ProcessingService()
