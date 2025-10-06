"""
Word document processor.

Handles Microsoft Word files (DOCX, DOC) and OpenDocument Text (ODT).
"""
from typing import List, Optional
import io
import logging

from .base import DocumentProcessor, ProcessingError

logger = logging.getLogger(__name__)

# Optional dependencies
try:
    import docx
    DOCX_AVAILABLE = True
except ImportError:
    docx = None
    DOCX_AVAILABLE = False
    logger.warning("python-docx not available - DOCX processing disabled")


class WordProcessor(DocumentProcessor):
    """
    Processor for Microsoft Word and OpenDocument text files.

    Supports:
    - DOCX (Office Open XML)
    - DOC (legacy Word format - limited support)
    - ODT (OpenDocument Text)
    """

    @property
    def supported_extensions(self) -> List[str]:
        """Word document extensions."""
        return [
            'docx',
            'doc',  # Limited support - may require pandoc
        ]

    @property
    def format_name(self) -> str:
        """Display name."""
        return "Word Document"

    @property
    def format_category(self) -> str:
        """Format category."""
        return "Documents"

    @property
    def requires_library(self) -> Optional[str]:
        """Required library."""
        return "python-docx>=0.8.0"

    def _check_dependencies(self) -> bool:
        """Check if python-docx is available."""
        return DOCX_AVAILABLE

    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from Word document.

        Args:
            file_bytes: Raw document bytes
            filename: Original filename

        Returns:
            Extracted text content

        Raises:
            ProcessingError: If extraction fails or library unavailable
        """
        if not DOCX_AVAILABLE:
            raise ProcessingError(
                "Word processing requires python-docx. "
                "Install with: pip install python-docx"
            )

        if not file_bytes:
            raise ProcessingError("Empty Word document")

        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

        try:
            if ext == 'docx':
                return await self._extract_docx(file_bytes, filename)
            elif ext == 'doc':
                # Legacy DOC format
                return await self._extract_doc(file_bytes, filename)
            else:
                raise ProcessingError(f"Unsupported Word format: {ext}")

        except Exception as e:
            logger.error(f"Word extraction failed for {filename}: {e}", exc_info=True)
            raise ProcessingError(f"Failed to extract text from Word document: {e}")

    async def _extract_docx(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from DOCX file.

        Args:
            file_bytes: Raw DOCX bytes
            filename: Original filename

        Returns:
            Extracted text
        """
        try:
            doc = docx.Document(io.BytesIO(file_bytes))

            # Extract paragraphs
            text_parts = []
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text_parts.append(paragraph.text)

            # Extract tables
            for table in doc.tables:
                table_text = []
                for row in table.rows:
                    row_text = ' | '.join(cell.text.strip() for cell in row.cells)
                    if row_text.strip():
                        table_text.append(row_text)

                if table_text:
                    text_parts.append('\n'.join(table_text))

            text = '\n\n'.join(text_parts)

            if not text:
                logger.warning(f"No text extracted from DOCX: {filename}")
                return "[Empty Word document]"

            logger.info(f"Extracted {len(text)} characters from DOCX: {filename}")
            return text

        except Exception as e:
            raise ProcessingError(f"DOCX extraction failed: {e}")

    async def _extract_doc(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from legacy DOC file.

        DOC format is complex and requires external tools (antiword, pandoc).
        This provides a basic fallback message.

        Args:
            file_bytes: Raw DOC bytes
            filename: Original filename

        Returns:
            Extracted text or error message
        """
        logger.warning(f"Legacy DOC format not fully supported: {filename}")
        return (
            "[DOC format not fully supported - please convert to DOCX. "
            "Legacy .DOC files require external tools like antiword or pandoc.]"
        )

    def validate(self, file_bytes: bytes) -> bool:
        """
        Validate Word document.

        DOCX files are ZIP archives with specific content.

        Args:
            file_bytes: Raw file bytes

        Returns:
            True if file appears to be a Word document
        """
        if not file_bytes or len(file_bytes) < 4:
            return False

        # DOCX is a ZIP file (PK\x03\x04)
        if file_bytes.startswith(b'PK\x03\x04'):
            # Further check: should contain word/ directory
            import zipfile
            import io

            try:
                with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                    return 'word/document.xml' in zf.namelist()
            except:
                return False

        # Legacy DOC format (complex binary format)
        # Magic bytes: \xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1 (OLE2/CFB)
        if file_bytes.startswith(b'\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1'):
            return True

        return False

    def get_magic_bytes(self) -> Optional[bytes]:
        """DOCX magic bytes (ZIP signature)."""
        return b'PK\x03\x04'

    def get_metadata(self, file_bytes: bytes) -> dict:
        """
        Extract Word document metadata.

        Args:
            file_bytes: Raw DOCX bytes

        Returns:
            Dictionary with metadata (author, title, etc.)
        """
        if not DOCX_AVAILABLE:
            return {}

        try:
            doc = docx.Document(io.BytesIO(file_bytes))
            core_props = doc.core_properties

            metadata = {}

            if core_props.title:
                metadata['title'] = core_props.title
            if core_props.author:
                metadata['author'] = core_props.author
            if core_props.subject:
                metadata['subject'] = core_props.subject
            if core_props.keywords:
                metadata['keywords'] = core_props.keywords
            if core_props.created:
                metadata['created'] = str(core_props.created)
            if core_props.modified:
                metadata['modified'] = str(core_props.modified)

            # Count paragraphs and tables
            metadata['paragraph_count'] = len(doc.paragraphs)
            metadata['table_count'] = len(doc.tables)

            return metadata

        except Exception as e:
            logger.debug(f"Failed to extract Word metadata: {e}")
            return {}

    async def postprocess(self, text: str) -> str:
        """
        Postprocess Word document text.

        Args:
            text: Extracted text

        Returns:
            Cleaned text
        """
        # Remove excessive empty lines
        lines = [line.strip() for line in text.split('\n')]

        # Keep empty lines for paragraph separation, but limit to single blank line
        cleaned_lines = []
        prev_empty = False

        for line in lines:
            if not line:
                if not prev_empty:
                    cleaned_lines.append('')
                    prev_empty = True
            else:
                cleaned_lines.append(line)
                prev_empty = False

        return '\n'.join(cleaned_lines)

    def estimate_processing_time(self, file_size: int) -> float:
        """
        Estimate Word document processing time.

        DOCX extraction is moderate speed (~5MB/second).

        Args:
            file_size: File size in bytes

        Returns:
            Estimated time in seconds
        """
        return file_size / (5 * 1024 * 1024)  # 5MB per second
