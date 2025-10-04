"""
Content processing service for text extraction and chunking.
"""
import io
import logging
import re
import unicodedata
from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from app.models.database import KnowledgeItem, Vector
from app.models.schemas import ProcessingStatus, ContentType
from app.core.embeddings import embedding_service
from app.config import settings

logger = logging.getLogger(__name__)

# Silence noisy PDF library debug logs to prevent log flooding
logging.getLogger('pdfminer').setLevel(logging.WARNING)
logging.getLogger('pdfplumber').setLevel(logging.WARNING)
logging.getLogger('PIL').setLevel(logging.INFO)
logging.getLogger('pytesseract').setLevel(logging.INFO)

# ============================================================================
# Optional Library Imports
# ============================================================================

# MIME type detection
try:
    import magic
except (ImportError, AttributeError, OSError):
    magic = None
    logger.warning("python-magic unavailable; MIME type detection disabled")

# PDF extraction (primary)
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None
    logger.warning("PyMuPDF unavailable; PDF extraction will fail")

# PDF extraction (fallback)
try:
    import pdfplumber
except ImportError:
    pdfplumber = None
    logger.debug("pdfplumber unavailable; using PyMuPDF only")

# OCR for scanned PDFs
try:
    import pytesseract
    from PIL import Image
except ImportError:
    pytesseract = None
    Image = None
    logger.debug("OCR unavailable; scanned PDFs cannot be processed")

# Document extraction
try:
    import docx
except ImportError:
    docx = None
    logger.warning("python-docx unavailable; DOCX extraction disabled")

# HTML extraction
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

                # Extract and sanitize text
                extracted_text = await self._extract_text_content(item)
                if extracted_text:
                    extracted_text = self.sanitize_text_for_postgres(extracted_text)

                # Update item with extracted text for file types
                if item.content_type in [ContentType.PDF, ContentType.DOC, ContentType.DOCX, ContentType.IMAGE] and extracted_text:
                    await self._update_item_content(db, knowledge_item_id, extracted_text)

                # Chunk and process text
                text_to_process = self.sanitize_text_for_postgres(extracted_text or item.content)
                chunks = self._chunk_text(text_to_process)

                # Generate and store embeddings
                vectors_created = await self._generate_and_store_embeddings(db, knowledge_item_id, chunks)

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

        Args:
            item: Knowledge item to extract text from

        Returns:
            Extracted text or None
        """
        if item.content_type == ContentType.TEXT:
            return item.content

        elif item.content_type == ContentType.PDF:
            return await self._extract_pdf_text(item)

        elif item.content_type == ContentType.IMAGE:
            return await self._extract_image_text(item)

        elif item.content_type in [ContentType.DOC, ContentType.DOCX]:
            return await self._extract_doc_text(item)

        elif item.content_type == ContentType.HTML:
            return self._extract_html_text(item.content)

        else:
            return item.content

    async def _extract_pdf_text(self, item: KnowledgeItem) -> str:
        """
        Extract text from PDF using multiple methods with fallbacks.

        Methods tried in order:
        1. PyMuPDF (fitz) - Fast and accurate
        2. pdfplumber - Better for tables/complex layouts (skipped for vector-heavy PDFs)
        3. OCR (pytesseract) - For scanned PDFs

        Args:
            item: Knowledge item with PDF content

        Returns:
            Extracted text from PDF
        """
        from app.core.storage import storage_service
        import asyncio

        try:
            # Get PDF bytes from storage
            pdf_bytes = await self._get_file_bytes(item, storage_service)
            if not pdf_bytes:
                return item.content

            # Try PyMuPDF first (primary method) with vector detection
            text, is_vector_heavy = await self._extract_with_pymupdf(pdf_bytes)
            if self._is_extraction_successful(text):
                logger.info(f"✅ PyMuPDF extracted {len(text)} chars from {item.id}")
                return text

            # Skip pdfplumber for vector-heavy PDFs (it will hang)
            if is_vector_heavy:
                logger.info(f"⏭️ Skipping pdfplumber for vector-heavy PDF {item.id}")
            elif pdfplumber:
                # Try pdfplumber (fallback) with timeout
                logger.info(f"🔄 Trying pdfplumber for {item.id}")
                try:
                    text = await asyncio.wait_for(
                        self._extract_with_pdfplumber(pdf_bytes),
                        timeout=10.0  # 10 second timeout
                    )
                    if self._is_extraction_successful(text):
                        logger.info(f"✅ pdfplumber extracted {len(text)} chars from {item.id}")
                        return text
                except asyncio.TimeoutError:
                    logger.warning(f"⏱️ pdfplumber timeout for {item.id} - likely vector-heavy PDF")

            # Try OCR (last resort)
            if pytesseract and Image and fitz:
                logger.info(f"🔄 Trying OCR for {item.id}")
                text = await self._extract_with_ocr(pdf_bytes)
                if self._is_extraction_successful(text, min_chars=50):
                    logger.info(f"✅ OCR extracted {len(text)} chars from {item.id}")
                    return text

            # Return best available result or error message
            if text:
                logger.warning(f"⚠️ Minimal extraction for {item.id}: {len(text)} chars")
                return text

            return self._get_extraction_error_message()

        except Exception as e:
            logger.error(f"PDF extraction failed for {item.id}: {e}", exc_info=True)
            return f"[PDF EXTRACTION ERROR: {str(e)}]"

    async def _extract_with_pymupdf(self, pdf_bytes: bytes) -> Tuple[str, bool]:
        """
        Extract text using PyMuPDF (fitz).

        Returns:
            Tuple of (extracted_text, is_vector_heavy)
        """
        if not fitz:
            return "", False

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            # Detect vector-heavy PDFs early (check first page)
            is_vector_heavy = False
            if len(doc) > 0:
                first_page = doc[0]
                first_page_text = first_page.get_text()
                vector_paths = len(first_page.get_drawings())

                # If no text but many vectors, this is likely a vector-based PDF
                if len(first_page_text.strip()) < 50 and vector_paths > 1000:
                    logger.info(f"Vector-heavy PDF detected ({vector_paths} paths), needs OCR")
                    is_vector_heavy = True
                    doc.close()
                    return "", True

            text_parts = []
            for page_num in range(len(doc)):
                try:
                    page = doc[page_num]
                    page_text = page.get_text()
                    if page_text.strip():
                        text_parts.append(f"--- Page {page_num + 1} ---\n{page_text}")
                except Exception as e:
                    logger.debug(f"Page {page_num + 1} extraction failed: {e}")

            doc.close()
            return "\n\n".join(text_parts), is_vector_heavy

        except Exception as e:
            logger.error(f"PyMuPDF error: {e}")
            return "", False

    async def _extract_with_pdfplumber(self, pdf_bytes: bytes) -> str:
        """Extract text using pdfplumber."""
        if not pdfplumber:
            return ""

        try:
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                text_parts = []
                for page_num, page in enumerate(pdf.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text and page_text.strip():
                            text_parts.append(f"--- Page {page_num + 1} ---\n{page_text}")
                    except Exception as e:
                        logger.debug(f"Page {page_num + 1} extraction failed: {e}")

                return "\n\n".join(text_parts)

        except Exception as e:
            logger.error(f"pdfplumber error: {e}")
            return ""

    async def _extract_with_ocr(self, pdf_bytes: bytes, max_pages: int = 10) -> str:
        """Extract text using OCR (for scanned PDFs)."""
        if not (pytesseract and Image and fitz):
            return ""

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            text_parts = []
            total_pages = len(doc)  # Save page count before closing

            for page_num in range(min(total_pages, max_pages)):
                try:
                    page = doc[page_num]
                    # Render at 3x zoom for better OCR quality
                    zoom = 3
                    mat = fitz.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=mat)
                    img = Image.open(io.BytesIO(pix.tobytes("png")))

                    page_text = pytesseract.image_to_string(img)
                    if page_text.strip():
                        text_parts.append(f"--- Page {page_num + 1} (OCR) ---\n{page_text}")

                except Exception as e:
                    logger.debug(f"OCR page {page_num + 1} failed: {e}")

            doc.close()

            if total_pages > max_pages:
                logger.warning(f"OCR limited to {max_pages}/{total_pages} pages")

            return "\n\n".join(text_parts)

        except Exception as e:
            logger.error(f"OCR error: {e}")
            return ""

    async def _extract_image_text(self, item: KnowledgeItem) -> str:
        """
        Extract text from images using OCR.

        Supports: PNG, JPEG, JPG, GIF, BMP, TIFF, WebP

        Args:
            item: Knowledge item with image content

        Returns:
            Extracted text from image via OCR
        """
        from app.core.storage import storage_service

        if not (pytesseract and Image):
            return "[IMAGE OCR UNAVAILABLE: pytesseract or Pillow not installed]"

        try:
            # Get image bytes from storage
            image_bytes = await self._get_file_bytes(item, storage_service)
            if not image_bytes:
                return item.content

            # Open image with PIL
            img = Image.open(io.BytesIO(image_bytes))

            # Convert to RGB if needed (for RGBA, grayscale, etc.)
            if img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')

            # Perform OCR
            text = pytesseract.image_to_string(img)

            if text.strip():
                logger.info(f"✅ OCR extracted {len(text)} chars from image {item.id}")
                return text
            else:
                logger.warning(f"⚠️ No text found in image {item.id}")
                return "[IMAGE OCR: No text detected in image]"

        except Exception as e:
            logger.error(f"Image OCR failed for {item.id}: {e}", exc_info=True)
            return f"[IMAGE OCR ERROR: {str(e)}]"

    async def _extract_doc_text(self, item: KnowledgeItem) -> str:
        """Extract text from DOC/DOCX files."""
        from app.core.storage import storage_service

        if not docx:
            return "[DOCX extraction unavailable - python-docx not installed]"

        try:
            doc_bytes = await self._get_file_bytes(item, storage_service)
            if not doc_bytes:
                return item.content

            if item.content_type == ContentType.DOCX:
                doc = docx.Document(io.BytesIO(doc_bytes))
                text_parts = [p.text for p in doc.paragraphs if p.text.strip()]
                return "\n\n".join(text_parts)
            else:
                return "[DOC format not fully supported - use DOCX]"

        except Exception as e:
            logger.error(f"Document extraction failed for {item.id}: {e}")
            return f"[DOCUMENT EXTRACTION ERROR: {str(e)}]"

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
        knowledge_item_id: UUID,
        chunks: List[str]
    ) -> int:
        """Generate embeddings for chunks and store them."""
        # Delete existing vectors
        await db.execute(delete(Vector).where(Vector.knowledge_item_id == knowledge_item_id))

        # Check API key configuration
        if not self._is_embedding_service_configured():
            logger.warning(f"Creating placeholder vectors for {knowledge_item_id} - embeddings disabled")
            return await self._create_placeholder_vectors(db, knowledge_item_id, chunks)

        # Generate real embeddings
        vectors_created = 0
        logger.info(f"🔄 Generating embeddings for {len(chunks)} chunks")

        for i, chunk in enumerate(chunks):
            try:
                embedding = await embedding_service.generate_embedding(chunk)
                vector = Vector(
                    knowledge_item_id=knowledge_item_id,
                    content_preview=chunk[:500],
                    embedding=embedding,
                    chunk_index=i
                )
                db.add(vector)
                vectors_created += 1

            except Exception as e:
                logger.error(f"Embedding generation failed for chunk {i}: {e}")
                # Create placeholder for failed chunk
                vector = Vector(
                    knowledge_item_id=knowledge_item_id,
                    content_preview=chunk[:500],
                    embedding=[0.0] * 1536,  # Placeholder
                    chunk_index=i
                )
                db.add(vector)
                vectors_created += 1

        logger.info(f"✅ Created {vectors_created} vectors for {knowledge_item_id}")
        return vectors_created

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
    def _is_extraction_successful(text: str, min_chars: int = 100) -> bool:
        """Check if text extraction was successful."""
        return bool(text and len(text.strip()) > min_chars)

    @staticmethod
    def _is_embedding_service_configured() -> bool:
        """Check if embedding service is properly configured."""
        return bool(
            settings.OPENAI_API_KEY and
            settings.OPENAI_API_KEY != "your-openai-api-key"
        )

    @staticmethod
    def _get_extraction_error_message() -> str:
        """Get error message for failed extraction."""
        return (
            "[PDF TEXT EXTRACTION FAILED: All methods returned no text. "
            "This may be a scanned PDF without OCR, or an encrypted/protected PDF.]"
        )


# ============================================================================
# Service Instance
# ============================================================================

processing_service = ProcessingService()
