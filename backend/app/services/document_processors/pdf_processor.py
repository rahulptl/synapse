"""
PDF document processor.

Handles PDF files with multiple extraction methods:
1. PyMuPDF (fitz) - Fast and accurate for text-based PDFs
2. pdfplumber - Fallback for complex layouts and tables
3. pytesseract OCR - For scanned PDFs and images

Includes vector-heavy PDF detection to avoid hanging on certain files.
"""
from typing import List, Optional, Tuple
import io
import logging
import asyncio

from .base import DocumentProcessor, ProcessingError

logger = logging.getLogger(__name__)

# Silence noisy PDF library logs
logging.getLogger('pdfminer').setLevel(logging.WARNING)
logging.getLogger('pdfplumber').setLevel(logging.WARNING)

# Optional dependencies
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    fitz = None
    PYMUPDF_AVAILABLE = False
    logger.warning("PyMuPDF not available - primary PDF extraction disabled")

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    pdfplumber = None
    PDFPLUMBER_AVAILABLE = False
    logger.debug("pdfplumber not available - fallback PDF extraction disabled")

try:
    import pytesseract
    from PIL import Image
    OCR_AVAILABLE = True
except ImportError:
    pytesseract = None
    Image = None
    OCR_AVAILABLE = False
    logger.debug("OCR not available - scanned PDF processing disabled")


class PDFProcessor(DocumentProcessor):
    """
    Processor for PDF files.

    Uses a multi-layered approach:
    1. PyMuPDF for most PDFs (fast, accurate)
    2. pdfplumber for tables/complex layouts (if PyMuPDF fails)
    3. OCR for scanned PDFs (if both text extraction methods fail)

    Includes special handling for vector-heavy PDFs that can hang pdfplumber.
    """

    @property
    def supported_extensions(self) -> List[str]:
        """PDF file extension."""
        return ['pdf']

    @property
    def format_name(self) -> str:
        """Display name."""
        return "PDF Document"

    @property
    def format_category(self) -> str:
        """Format category."""
        return "Documents"

    @property
    def requires_library(self) -> Optional[str]:
        """Required library."""
        return "PyMuPDF>=1.23.0"

    @property
    def requires_system_dependency(self) -> Optional[str]:
        """System dependency for OCR."""
        return "tesseract (optional, for scanned PDFs)"

    def _check_dependencies(self) -> bool:
        """Check if PyMuPDF is available (minimum requirement)."""
        return PYMUPDF_AVAILABLE

    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from PDF using multiple methods with fallbacks.

        Methods tried in order:
        1. PyMuPDF (fitz) - Fast and accurate
        2. pdfplumber - Better for tables/complex layouts
        3. OCR (pytesseract) - For scanned PDFs

        Args:
            file_bytes: Raw PDF bytes
            filename: Original filename

        Returns:
            Extracted text from PDF

        Raises:
            ProcessingError: If all extraction methods fail
        """
        if not file_bytes:
            raise ProcessingError("Empty PDF file")

        if not PYMUPDF_AVAILABLE:
            raise ProcessingError(
                "PDF processing requires PyMuPDF. "
                "Install with: pip install PyMuPDF"
            )

        try:
            # Try PyMuPDF first (primary method) with vector detection
            text, is_vector_heavy = await self._extract_with_pymupdf(file_bytes)

            if self._is_extraction_successful(text):
                logger.info(f"✅ PyMuPDF extracted {len(text)} chars from {filename}")
                return text

            # Skip pdfplumber for vector-heavy PDFs (it will hang)
            if is_vector_heavy:
                logger.info(f"⏭️ Skipping pdfplumber for vector-heavy PDF: {filename}")
            elif PDFPLUMBER_AVAILABLE:
                # Try pdfplumber (fallback) with timeout
                logger.info(f"🔄 Trying pdfplumber for {filename}")
                try:
                    text = await asyncio.wait_for(
                        self._extract_with_pdfplumber(file_bytes),
                        timeout=10.0  # 10 second timeout
                    )
                    if self._is_extraction_successful(text):
                        logger.info(f"✅ pdfplumber extracted {len(text)} chars from {filename}")
                        return text
                except asyncio.TimeoutError:
                    logger.warning(f"⏱️ pdfplumber timeout for {filename} - likely vector-heavy PDF")

            # Try OCR (last resort)
            if OCR_AVAILABLE:
                logger.info(f"🔄 Trying OCR for {filename}")
                text = await self._extract_with_ocr(file_bytes)
                if self._is_extraction_successful(text, min_chars=50):
                    logger.info(f"✅ OCR extracted {len(text)} chars from {filename}")
                    return text

            # Return best available result or error message
            if text:
                logger.warning(f"⚠️ Minimal extraction for {filename}: {len(text)} chars")
                return text

            return self._get_extraction_error_message()

        except Exception as e:
            logger.error(f"PDF extraction failed for {filename}: {e}", exc_info=True)
            raise ProcessingError(f"Failed to extract text from PDF: {e}")

    async def _extract_with_pymupdf(self, pdf_bytes: bytes) -> Tuple[str, bool]:
        """
        Extract text using PyMuPDF (fitz).

        Also detects vector-heavy PDFs that should skip pdfplumber.

        Args:
            pdf_bytes: Raw PDF bytes

        Returns:
            Tuple of (extracted_text, is_vector_heavy)
        """
        if not PYMUPDF_AVAILABLE:
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

            # Extract text from all pages
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
        """
        Extract text using pdfplumber.

        Better for tables and complex layouts but slower.

        Args:
            pdf_bytes: Raw PDF bytes

        Returns:
            Extracted text
        """
        if not PDFPLUMBER_AVAILABLE:
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
        """
        Extract text using OCR (for scanned PDFs).

        Limits to first N pages to prevent excessive processing time.

        Args:
            pdf_bytes: Raw PDF bytes
            max_pages: Maximum pages to OCR (default: 10)

        Returns:
            Extracted text via OCR
        """
        if not (OCR_AVAILABLE and PYMUPDF_AVAILABLE):
            return ""

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            text_parts = []
            total_pages = len(doc)

            for page_num in range(min(total_pages, max_pages)):
                try:
                    page = doc[page_num]
                    # Render at 3x zoom for better OCR quality
                    zoom = 3
                    mat = fitz.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=mat)
                    img = Image.open(io.BytesIO(pix.tobytes("png")))

                    # Perform OCR
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

    def validate(self, file_bytes: bytes) -> bool:
        """
        Validate PDF file using magic bytes.

        Args:
            file_bytes: Raw file bytes

        Returns:
            True if file is a valid PDF
        """
        if not file_bytes or len(file_bytes) < 4:
            return False

        # Check for PDF magic bytes: %PDF
        return file_bytes.startswith(b'%PDF')

    def get_magic_bytes(self) -> Optional[bytes]:
        """PDF magic bytes."""
        return b'%PDF'

    def get_metadata(self, file_bytes: bytes) -> dict:
        """
        Extract PDF metadata (pages, author, title, etc.).

        Args:
            file_bytes: Raw PDF bytes

        Returns:
            Dictionary with PDF metadata
        """
        if not PYMUPDF_AVAILABLE:
            return {}

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")

            metadata = {
                'page_count': len(doc),
                'format': 'PDF',
            }

            # Extract document metadata
            info = doc.metadata
            if info:
                metadata.update({
                    'title': info.get('title', ''),
                    'author': info.get('author', ''),
                    'subject': info.get('subject', ''),
                    'creator': info.get('creator', ''),
                    'producer': info.get('producer', ''),
                    'creation_date': info.get('creationDate', ''),
                    'modification_date': info.get('modDate', ''),
                })

            doc.close()
            return metadata

        except Exception as e:
            logger.debug(f"Failed to extract PDF metadata: {e}")
            return {}

    @staticmethod
    def _is_extraction_successful(text: str, min_chars: int = 100) -> bool:
        """
        Check if text extraction was successful.

        Args:
            text: Extracted text
            min_chars: Minimum characters required

        Returns:
            True if extraction yielded sufficient text
        """
        return bool(text and len(text.strip()) > min_chars)

    @staticmethod
    def _get_extraction_error_message() -> str:
        """Get error message for failed extraction."""
        return (
            "[PDF TEXT EXTRACTION FAILED: All methods returned no text. "
            "This may be a scanned PDF without OCR, or an encrypted/protected PDF.]"
        )

    async def postprocess(self, text: str) -> str:
        """
        Postprocess PDF text.

        Removes excessive whitespace while preserving structure.

        Args:
            text: Extracted text

        Returns:
            Cleaned text
        """
        # Split by page markers
        if "--- Page" in text:
            # Keep page structure
            return text

        # Otherwise, clean up whitespace
        lines = [line.strip() for line in text.split('\n')]
        lines = [line for line in lines if line]
        return '\n'.join(lines)

    def estimate_processing_time(self, file_size: int) -> float:
        """
        Estimate PDF processing time.

        PDFs vary widely - text extraction is fast, OCR is slow.

        Args:
            file_size: File size in bytes

        Returns:
            Estimated time in seconds
        """
        # Assume ~2MB per second for text extraction
        # OCR would be much slower but we can't predict it without trying
        return file_size / (2 * 1024 * 1024)
