"""
Content processing service for text extraction and chunking.
"""
import io
import logging
import re
import unicodedata
from typing import List, Optional, Dict, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

_magic_import_error: Optional[Exception] = None
try:
    import magic  # type: ignore[import]
except (ImportError, AttributeError, OSError) as exc:  # pragma: no cover - environment specific
    magic = None
    _magic_import_error = exc

_pypdf_import_error: Optional[Exception] = None
try:
    from pypdf import PdfReader  # type: ignore[import]
except ImportError as primary_exc:  # pragma: no cover - environment specific
    try:
        from PyPDF2 import PdfReader  # type: ignore[import]
    except ImportError as fallback_exc:  # pragma: no cover - environment specific
        PdfReader = None  # type: ignore[misc]
        _pypdf_import_error = fallback_exc

_docx_import_error: Optional[Exception] = None
try:
    import docx  # type: ignore[import]
except ImportError as exc:  # pragma: no cover - environment specific
    docx = None
    _docx_import_error = exc

_bs4_import_error: Optional[Exception] = None
try:
    from bs4 import BeautifulSoup
except ImportError as exc:  # pragma: no cover - environment specific
    BeautifulSoup = None
    _bs4_import_error = exc

from app.models.database import KnowledgeItem, Vector
from app.models.schemas import ProcessingStatus, ContentType
from app.core.embeddings import embedding_service
from app.config import settings

logger = logging.getLogger(__name__)

if _magic_import_error:
    logger.warning("python-magic unavailable; MIME sniffing disabled: %s", _magic_import_error)
if _pypdf_import_error:
    logger.warning("pypdf unavailable; PDF extraction disabled: %s", _pypdf_import_error)
if _docx_import_error:
    logger.warning("python-docx unavailable; DOC/DOCX extraction disabled: %s", _docx_import_error)
if _bs4_import_error:
    logger.warning("beautifulsoup4 unavailable; HTML extraction disabled: %s", _bs4_import_error)


class ProcessingService:
    """Service for processing content and generating embeddings."""

    @staticmethod
    def sanitize_text_for_postgres(text: str) -> str:
        """
        Sanitize text to ensure PostgreSQL UTF-8 compatibility.

        Removes or replaces characters that are not valid in PostgreSQL UTF-8:
        - Null bytes (\x00)
        - Invalid UTF-8 sequences
        - Control characters (except common whitespace)
        - Surrogate pairs
        - Non-BMP characters that may cause issues

        Args:
            text: Raw text to sanitize

        Returns:
            Sanitized text safe for PostgreSQL UTF-8
        """
        if not text:
            return text

        try:
            # Step 1: Remove null bytes (most common issue)
            text = text.replace('\x00', '')

            # Step 2: Remove other problematic control characters
            # Keep: \t (tab), \n (newline), \r (carriage return)
            # Remove: Other C0 and C1 control characters
            text = re.sub(r'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)

            # Step 3: Normalize unicode to NFC (Normalization Form Canonical Composition)
            # This helps with combining characters and ensures consistency
            text = unicodedata.normalize('NFC', text)

            # Step 4: Remove invalid UTF-8 sequences by encoding/decoding
            # This will replace invalid sequences with the replacement character
            text = text.encode('utf-8', errors='ignore').decode('utf-8', errors='ignore')

            # Step 5: Remove zero-width characters that can cause issues
            text = text.replace('\u200b', '')  # Zero-width space
            text = text.replace('\u200c', '')  # Zero-width non-joiner
            text = text.replace('\u200d', '')  # Zero-width joiner
            text = text.replace('\ufeff', '')  # Zero-width no-break space (BOM)

            # Step 6: Replace common problematic characters
            text = text.replace('\xa0', ' ')  # Non-breaking space -> regular space

            return text

        except Exception as e:
            logger.error(f"Error sanitizing text: {e}")
            # Fallback: try to at least remove null bytes
            try:
                return text.replace('\x00', '')
            except:
                return ""

    async def process_knowledge_item(self, knowledge_item_id: UUID) -> Dict[str, Any]:
        """
        Process a knowledge item for text extraction and embedding generation.

        Args:
            knowledge_item_id: ID of the knowledge item to process

        Returns:
            Dict with processing results
        """
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            # Get the knowledge item
            stmt = select(KnowledgeItem).where(KnowledgeItem.id == knowledge_item_id)
            result = await db.execute(stmt)
            item = result.scalar_one_or_none()

            if not item:
                raise ValueError(f"Knowledge item {knowledge_item_id} not found")

            try:
                # Update status to processing
                await self._update_processing_status(db, knowledge_item_id, ProcessingStatus.PROCESSING)

                # Extract text content based on content type
                extracted_text = await self._extract_text_content(item)

                # Sanitize extracted text for PostgreSQL
                if extracted_text:
                    extracted_text = self.sanitize_text_for_postgres(extracted_text)

                # Update the item with extracted text if it was from a file
                if item.content_type in [ContentType.PDF, ContentType.DOC, ContentType.DOCX] and extracted_text:
                    await self._update_item_content(db, knowledge_item_id, extracted_text)

                # Chunk the content
                text_to_process = extracted_text or item.content
                # Ensure text to process is also sanitized (in case item.content is used)
                text_to_process = self.sanitize_text_for_postgres(text_to_process)
                chunks = self._chunk_text(text_to_process)

                # Generate embeddings for chunks
                vectors_created = await self._generate_and_store_embeddings(
                    db, knowledge_item_id, chunks
                )

                # Update status to completed
                await self._update_processing_status(db, knowledge_item_id, ProcessingStatus.COMPLETED)

                await db.commit()

                return {
                    "success": True,
                    "vectors_created": vectors_created,
                    "chunks_processed": len(chunks),
                    "extracted_text_length": len(extracted_text) if extracted_text else len(item.content)
                }

            except Exception as e:
                logger.error(f"Processing failed for item {knowledge_item_id}: {e}")
                await self._update_processing_status(db, knowledge_item_id, ProcessingStatus.FAILED)
                await db.commit()
                raise

    async def _extract_text_content(self, item: KnowledgeItem) -> Optional[str]:
        """
        Extract text content from different file types.

        Args:
            item: Knowledge item to extract text from

        Returns:
            Extracted text or None if not applicable
        """
        if item.content_type == ContentType.TEXT:
            return item.content

        elif item.content_type == ContentType.PDF:
            logger.info(f"📄 PDF detected for item {item.id}, extracting text...")
            extracted_text = await self._extract_pdf_text(item)
            if extracted_text:
                logger.info(f"✅ PDF text extracted successfully: {len(extracted_text)} characters")
                logger.debug(f"Extracted text preview: {extracted_text[:200]}...")
            else:
                logger.warning(f"⚠️ PDF text extraction returned empty for item {item.id}")
            return extracted_text

        elif item.content_type in [ContentType.DOC, ContentType.DOCX]:
            return await self._extract_doc_text(item)

        elif item.content_type == ContentType.HTML:
            return self._extract_html_text(item.content)

        else:
            # For other types, use the content as-is
            return item.content

    async def _extract_pdf_text(self, item: KnowledgeItem) -> str:
        """
        Extract text from PDF using pypdf library.

        Args:
            item: Knowledge item with PDF content

        Returns:
            Extracted text from PDF
        """
        try:
            from app.core.storage import storage_service

            if PdfReader is None:
                raise RuntimeError(
                    "pypdf/PyPDF2 is required for PDF text extraction but is not installed."
                )

            # Check if content is stored externally (handle both old and new formats)
            if item.content.startswith("[FILE_STORED:") or item.content.startswith("[FILE:"):
                # Extract storage path from content
                if item.content.startswith("[FILE_STORED:"):
                    storage_path = item.content.replace("[FILE_STORED:", "").rstrip("]")
                elif item.content.startswith("[FILE:"):
                    storage_path = item.content.replace("[FILE:", "").rstrip("]")
                else:
                    # Fallback for any other format
                    storage_path = item.content
                logger.debug(f"Downloading PDF from storage: {storage_path}")

                # Download file content from storage
                pdf_bytes = await storage_service.download_content(storage_path)
            else:
                # Handle content stored as string (shouldn't happen for PDFs but fallback)
                logger.warning(f"PDF content for {item.id} is not stored externally")
                return item.content

            # Extract text from PDF bytes
            pdf_content = io.BytesIO(pdf_bytes)
            reader = PdfReader(pdf_content)

            logger.info(f"📖 Processing PDF with {len(reader.pages)} pages")
            text_content = []
            pages_processed = 0

            for page_num, page in enumerate(reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text.strip():
                        text_content.append(f"--- Page {page_num + 1} ---\n{page_text}")
                        pages_processed += 1
                        logger.debug(f"✓ Page {page_num + 1}: {len(page_text)} characters extracted")
                    else:
                        logger.warning(f"⚠️ Page {page_num + 1}: No text found")
                except Exception as e:
                    logger.warning(f"❌ Failed to extract text from page {page_num + 1} of PDF {item.id}: {e}")
                    continue

            extracted_text = "\n\n".join(text_content)

            logger.info(f"🎯 PDF processing complete: {pages_processed}/{len(reader.pages)} pages processed, {len(extracted_text)} total characters")

            if extracted_text:
                # Log first 300 characters as preview
                preview = extracted_text[:300].replace('\n', ' ').strip()
                logger.info(f"📝 Extracted text preview: {preview}...")

            return extracted_text

        except Exception as e:
            logger.error(f"PDF text extraction failed for item {item.id}: {e}")
            return f"[PDF TEXT EXTRACTION FAILED: {str(e)}]"

    async def _extract_doc_text(self, item: KnowledgeItem) -> str:
        """
        Extract text from DOC/DOCX files.

        Args:
            item: Knowledge item with document content

        Returns:
            Extracted text from document
        """
        try:
            from app.core.storage import storage_service

            if docx is None:
                raise RuntimeError(
                    "python-docx is required for DOC/DOCX extraction but is not installed."
                )

            # Check if content is stored externally (handle both old and new formats)
            if item.content.startswith("[FILE_STORED:") or item.content.startswith("[FILE:"):
                # Extract storage path from content
                if item.content.startswith("[FILE_STORED:"):
                    storage_path = item.content.replace("[FILE_STORED:", "").rstrip("]")
                elif item.content.startswith("[FILE:"):
                    storage_path = item.content.replace("[FILE:", "").rstrip("]")
                else:
                    # Fallback for any other format
                    storage_path = item.content
                logger.debug(f"Downloading document from storage: {storage_path}")

                # Download file content from storage
                doc_bytes = await storage_service.download_content(storage_path)
            else:
                # Handle content stored as string
                logger.warning(f"Document content for {item.id} is not stored externally")
                return item.content

            if item.content_type == ContentType.DOCX:
                # Extract from DOCX
                doc = docx.Document(io.BytesIO(doc_bytes))
                text_content = []
                for paragraph in doc.paragraphs:
                    if paragraph.text.strip():
                        text_content.append(paragraph.text)
                return "\n\n".join(text_content)
            else:
                # DOC files require different handling (could use python-docx2txt or similar)
                logger.warning(f"DOC file extraction not fully implemented for {item.id}")
                return f"[DOC file extraction not implemented - content stored at {storage_path}]"

        except Exception as e:
            logger.error(f"Document text extraction failed for item {item.id}: {e}")
            return f"[DOCUMENT TEXT EXTRACTION FAILED: {str(e)}]"

    def _extract_html_text(self, content: str) -> str:
        """
        Extract text from HTML content.

        Args:
            content: HTML content string

        Returns:
            Plain text extracted from HTML
        """
        try:
            if BeautifulSoup is None:
                raise RuntimeError(
                    "beautifulsoup4 is required for HTML extraction but is not installed."
                )

            soup = BeautifulSoup(content, 'html.parser')
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()

            # Get text and clean up
            text = soup.get_text()
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)

            return text
        except Exception as e:
            logger.error(f"HTML text extraction failed: {e}")
            return content

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

        chunk_size = settings.CHUNK_SIZE
        chunk_overlap = settings.CHUNK_OVERLAP

        # Simple chunking by character count with overlap
        chunks = []
        start = 0

        while start < len(text):
            end = start + chunk_size

            # Try to find a good break point (sentence or paragraph)
            if end < len(text):
                # Look for sentence endings within the last 200 characters
                search_start = max(start, end - 200)
                sentence_breaks = []

                for i in range(search_start, end):
                    if text[i] in '.!?\n':
                        sentence_breaks.append(i + 1)

                if sentence_breaks:
                    end = sentence_breaks[-1]

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            # Move start position with overlap
            start = max(start + 1, end - chunk_overlap)

            # Prevent infinite loop
            if start >= len(text):
                break

        return chunks

    async def _generate_and_store_embeddings(
        self,
        db: AsyncSession,
        knowledge_item_id: UUID,
        chunks: List[str]
    ) -> int:
        """
        Generate embeddings for text chunks and store them.

        Args:
            db: Database session
            knowledge_item_id: ID of the knowledge item
            chunks: Text chunks to generate embeddings for

        Returns:
            Number of vectors created
        """
        vectors_created = 0

        # Delete existing vectors for this item
        from sqlalchemy import delete
        delete_stmt = delete(Vector).where(Vector.knowledge_item_id == knowledge_item_id)
        result = await db.execute(delete_stmt)
        logger.info(f"Deleted {result.rowcount} existing vectors for {knowledge_item_id}")

        # Check if embedding service is configured
        from app.config import settings
        if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY == "your-openai-api-key":
            logger.error(f"❌ OpenAI API key not configured properly for {knowledge_item_id}")
            logger.error(f"Current API key: {settings.OPENAI_API_KEY[:10] if settings.OPENAI_API_KEY else 'None'}...")

            # Create vector records without embeddings as fallback but mark as incomplete
            logger.warning(f"Creating placeholder vectors for {knowledge_item_id} - EMBEDDINGS DISABLED")
            for i, chunk in enumerate(chunks):
                vector = Vector(
                    knowledge_item_id=knowledge_item_id,
                    content_preview=chunk[:500],  # Store preview of chunk content (max 500 chars)
                    embedding=[0.0] * 1536,  # Placeholder embedding for text-embedding-ada-002
                    chunk_index=i
                )
                db.add(vector)
                vectors_created += 1

            logger.warning(f"Created {vectors_created} placeholder vectors for {knowledge_item_id}")
            return vectors_created

        logger.info(f"🔄 Generating embeddings for {len(chunks)} chunks of {knowledge_item_id}")

        for i, chunk in enumerate(chunks):
            try:
                # Generate embedding
                logger.debug(f"Generating embedding for chunk {i+1}/{len(chunks)} (size: {len(chunk)} chars)")
                embedding = await embedding_service.generate_embedding(chunk)

                # Create vector record
                vector = Vector(
                    knowledge_item_id=knowledge_item_id,
                    content_preview=chunk[:500],  # Store preview of chunk content (max 500 chars)
                    embedding=embedding,
                    chunk_index=i
                )

                db.add(vector)
                vectors_created += 1
                logger.debug(f"✓ Created vector {i+1}/{len(chunks)} for {knowledge_item_id}")

            except Exception as e:
                logger.error(f"❌ Failed to generate embedding for chunk {i+1} of item {knowledge_item_id}: {e}")
                # Create vector without embedding as fallback
                vector = Vector(
                    knowledge_item_id=knowledge_item_id,
                    content_preview=chunk[:500],  # Store preview of chunk content (max 500 chars)
                    embedding=[0.0] * 1536,  # Placeholder
                    chunk_index=i
                )
                db.add(vector)
                vectors_created += 1
                continue

        logger.info(f"✅ Successfully created {vectors_created} vectors for {knowledge_item_id}")

        return vectors_created

    async def _update_processing_status(
        self,
        db: AsyncSession,
        knowledge_item_id: UUID,
        status: ProcessingStatus
    ):
        """Update the processing status of a knowledge item."""
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
        """Update the content of a knowledge item with extracted text."""
        await db.execute(
            update(KnowledgeItem)
            .where(KnowledgeItem.id == knowledge_item_id)
            .values(content=content)
        )


# Service instance
processing_service = ProcessingService()
