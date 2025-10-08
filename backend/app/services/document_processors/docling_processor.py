"""
Docling document processor.

Unified processor using Docling for all document formats including:
- PDF (text-based and scanned with OCR)
- DOCX, DOC, RTF, ODT
- PPTX, PPT, ODP
- XLSX, XLS
- HTML, Markdown

Docling uses AI models for layout understanding and table extraction,
with EasyOCR integration for scanned documents.
"""
from typing import List, Optional
import io
import logging

from .base import DocumentProcessor, ProcessingError

logger = logging.getLogger(__name__)

# Silence noisy logs from Docling dependencies
logging.getLogger('docling').setLevel(logging.INFO)
logging.getLogger('pdfminer').setLevel(logging.WARNING)
logging.getLogger('PIL').setLevel(logging.INFO)

# Check Docling availability
try:
    from docling.document_converter import DocumentConverter
    from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions
    from docling.datamodel.base_models import InputFormat
    DOCLING_AVAILABLE = True
except ImportError:
    DocumentConverter = None
    PdfPipelineOptions = None
    EasyOcrOptions = None
    InputFormat = None
    DOCLING_AVAILABLE = False
    logger.warning("Docling not available - unified document processing disabled")


class DoclingProcessor(DocumentProcessor):
    """
    Unified processor using Docling for modern document formats.

    Advantages:
    - AI-powered layout understanding (DocLayNet model)
    - Advanced table extraction (TableFormer model)
    - Integrated OCR for scanned documents (EasyOCR)
    - Consistent output across all formats
    - Better handling of complex layouts

    Supports: PDF, DOCX, PPTX, XLSX, HTML, Markdown

    Note: Legacy Office formats (DOC, PPT, XLS) are not supported by Docling
    and will automatically fall back to other registered processors.
    """

    @property
    def supported_extensions(self) -> List[str]:
        """
        Document file extensions supported by Docling.

        Note: Only modern Office formats (DOCX, PPTX, XLSX) are supported.
        Legacy formats (DOC, PPT, XLS) are not supported by Docling.
        """
        return [
            # PDF
            'pdf',
            # Modern Word formats
            'docx',
            # Modern PowerPoint formats
            'pptx',
            # Modern Excel formats
            'xlsx',
            # Web/Markup
            'html', 'htm', 'md', 'markdown',
            # Note: Legacy Office formats (doc, ppt, xls) and OpenDocument (odt, odp, ods)
            # are not supported by Docling and will fall back to other processors
        ]

    @property
    def format_name(self) -> str:
        """Display name."""
        return "Unified Document (Docling)"

    @property
    def format_category(self) -> str:
        """Format category."""
        return "Documents"

    @property
    def requires_library(self) -> Optional[str]:
        """Required libraries."""
        return "docling>=2.55.0"

    def _check_dependencies(self) -> bool:
        """Check if Docling is available."""
        return DOCLING_AVAILABLE

    def _preprocess_excel_to_values(self, file_bytes: bytes, filename: str) -> bytes:
        """
        Preprocess Excel files to convert formulas to calculated values.

        This is necessary because Docling doesn't expose openpyxl's data_only parameter.
        The method:
        1. Loads Excel with data_only=True (extracts calculated values)
        2. Saves to a BytesIO buffer (bakes in the values)
        3. Returns the processed bytes

        Args:
            file_bytes: Original Excel file bytes
            filename: Original filename (for logging)

        Returns:
            Processed Excel file bytes with formulas replaced by values

        Raises:
            ProcessingError: If preprocessing fails
        """
        try:
            import openpyxl
            from io import BytesIO

            # Load workbook with data_only=True to get calculated values
            logger.debug(f"Preprocessing {filename} to extract values instead of formulas")
            input_stream = BytesIO(file_bytes)
            workbook = openpyxl.load_workbook(input_stream, data_only=True)

            # Save to new BytesIO buffer (this bakes in the values)
            output_stream = BytesIO()
            workbook.save(output_stream)
            workbook.close()

            # Get the processed bytes
            output_stream.seek(0)
            processed_bytes = output_stream.read()

            logger.debug(f"Successfully preprocessed {filename} ({len(processed_bytes)} bytes)")
            return processed_bytes

        except ImportError:
            logger.warning(
                "openpyxl not available - Excel formulas may be extracted instead of values. "
                "Install with: pip install openpyxl"
            )
            # Return original bytes if openpyxl not available
            return file_bytes

        except Exception as e:
            logger.warning(f"Excel preprocessing failed for {filename}: {e}. Using original file.")
            # Return original bytes on any error
            return file_bytes

    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from document using Docling.

        Docling automatically:
        - Detects document format
        - Applies appropriate extraction strategy
        - Uses OCR for scanned content
        - Extracts tables and maintains structure
        - Handles complex layouts

        Args:
            file_bytes: Raw document bytes
            filename: Original filename (used for format detection)

        Returns:
            Extracted text in Markdown format

        Raises:
            ProcessingError: If extraction fails
        """
        if not DOCLING_AVAILABLE:
            raise ProcessingError(
                "Docling is not available. Install with: pip install docling easyocr torch"
            )

        if not file_bytes:
            raise ProcessingError("Empty document file")

        import tempfile
        import os
        from pathlib import Path

        # Preprocess Excel files to extract values instead of formulas
        if filename and filename.lower().endswith('.xlsx'):
            file_bytes = self._preprocess_excel_to_values(file_bytes, filename)

        # Create a temporary file for Docling to process
        # Docling requires either a file path or DocumentStream, not BytesIO
        temp_path = None
        try:
            # Get preloaded converter from model loader
            from app.services.model_loader import get_docling_converter

            converter = get_docling_converter()

            # Log processing start
            file_size_mb = len(file_bytes) / (1024 * 1024)
            logger.info(
                f"Processing {filename} with Docling ({file_size_mb:.2f}MB)"
            )

            # Create temporary file with original extension
            suffix = Path(filename).suffix if filename else '.tmp'
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_file.write(file_bytes)
                temp_path = temp_file.name

            # Convert using Docling with file path
            result = converter.convert(
                temp_path,
                raises_on_error=False  # Don't raise on individual page errors
            )

            # Extract text in Markdown format
            # Markdown preserves structure better than plain text
            if hasattr(result.document, 'export_to_markdown'):
                text = result.document.export_to_markdown()
            elif hasattr(result.document, 'export_to_text'):
                text = result.document.export_to_text()
            else:
                # Fallback: try to get text content
                text = str(result.document)

            if text and text.strip():
                logger.info(
                    f"✅ Docling extracted {len(text)} chars from {filename}"
                )
                return text
            else:
                logger.warning(f"⚠️ Docling extracted no text from {filename}")
                return f"[NO TEXT EXTRACTED: Document appears to be empty or unreadable]"

        except Exception as e:
            logger.error(f"Docling extraction failed for {filename}: {e}", exc_info=True)
            raise ProcessingError(f"Failed to extract text with Docling: {e}")

        finally:
            # Clean up temporary file
            if temp_path:
                try:
                    if os.path.exists(temp_path):
                        os.unlink(temp_path)
                        logger.debug(f"Cleaned up temp file: {temp_path}")
                except Exception as cleanup_error:
                    logger.debug(f"Failed to cleanup temp file {temp_path}: {cleanup_error}")

    async def extract_and_chunk(self, file_bytes: bytes, filename: str, max_tokens: int = 512) -> List[str]:
        """
        Extract text and apply smart chunking using Docling's HybridChunker.

        This method:
        1. Extracts document with structure understanding (tables, headers, lists)
        2. Applies HybridChunker for structure-aware + token-aware chunking
        3. Returns chunks with embedded metadata (headers, captions)

        Args:
            file_bytes: Raw document bytes
            filename: Original filename
            max_tokens: Maximum tokens per chunk (default: 512)

        Returns:
            List of text chunks with structure-aware boundaries

        Raises:
            ProcessingError: If extraction or chunking fails
        """
        if not DOCLING_AVAILABLE:
            raise ProcessingError(
                "Docling is not available. Install with: pip install docling easyocr torch"
            )

        if not file_bytes:
            raise ProcessingError("Empty document file")

        import tempfile
        import os
        from pathlib import Path

        # Preprocess Excel files to extract values instead of formulas
        if filename and filename.lower().endswith('.xlsx'):
            file_bytes = self._preprocess_excel_to_values(file_bytes, filename)

        temp_path = None
        try:
            # Import chunking dependencies
            try:
                from docling_core.transforms.chunker import HybridChunker
                import tiktoken
                CHUNKING_AVAILABLE = True
            except ImportError:
                logger.warning(
                    "Docling chunking not available. Install with: "
                    "pip install 'docling-core[chunking-openai]' tiktoken"
                )
                CHUNKING_AVAILABLE = False

            # Get preloaded converter
            from app.services.model_loader import get_docling_converter
            converter = get_docling_converter()

            # Log processing start
            file_size_mb = len(file_bytes) / (1024 * 1024)
            logger.info(
                f"Processing {filename} with Docling smart chunking ({file_size_mb:.2f}MB, max_tokens={max_tokens})"
            )

            # Create temporary file with original extension
            suffix = Path(filename).suffix if filename else '.tmp'
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_file.write(file_bytes)
                temp_path = temp_file.name

            # Convert using Docling
            result = converter.convert(
                temp_path,
                raises_on_error=False
            )

            if not CHUNKING_AVAILABLE:
                # Raise exception to trigger fallback to legacy chunking
                logger.warning("Chunking not available, falling back to legacy chunking")
                raise ProcessingError(
                    "Docling chunking dependencies not installed. "
                    "Install with: pip install 'docling-core[chunking-openai]' tiktoken"
                )

            # Initialize HybridChunker with token-aware settings
            tokenizer = tiktoken.get_encoding("cl100k_base")  # OpenAI tokenizer
            chunker = HybridChunker(
                tokenizer=tokenizer,
                max_tokens=max_tokens,
                merge_peers=True  # Merge undersized chunks with same headings
            )

            # Perform smart chunking
            chunk_iter = chunker.chunk(result.document)

            # Convert chunks to text with metadata context
            chunks = []
            for chunk in chunk_iter:
                # Get chunk text with metadata (headers, captions)
                if hasattr(chunk, 'text'):
                    chunk_text = chunk.text
                elif hasattr(chunk, 'export_to_markdown'):
                    chunk_text = chunk.export_to_markdown()
                else:
                    chunk_text = str(chunk)

                if chunk_text and chunk_text.strip():
                    chunks.append(chunk_text.strip())

            logger.info(
                f"✅ Docling smart chunking created {len(chunks)} structure-aware chunks from {filename}"
            )

            return chunks if chunks else []

        except Exception as e:
            logger.error(f"Docling chunking failed for {filename}: {e}", exc_info=True)
            raise ProcessingError(f"Failed to chunk document with Docling: {e}")

        finally:
            # Clean up temporary file
            if temp_path:
                try:
                    if os.path.exists(temp_path):
                        os.unlink(temp_path)
                        logger.debug(f"Cleaned up temp file: {temp_path}")
                except Exception as cleanup_error:
                    logger.debug(f"Failed to cleanup temp file {temp_path}: {cleanup_error}")

    def _get_pipeline_options(self) -> Optional[object]:
        """
        Get Docling pipeline options configured for optimal extraction.

        Configures:
        - OCR settings (EasyOCR integration)
        - Table extraction
        - Image handling
        - Performance optimizations

        Returns:
            PdfPipelineOptions if available, else None
        """
        if not (PdfPipelineOptions and EasyOcrOptions):
            return None

        try:
            pipeline_options = PdfPipelineOptions()

            # Enable OCR for scanned documents
            pipeline_options.do_ocr = True

            # Configure EasyOCR
            ocr_options = EasyOcrOptions()
            # Additional OCR configuration can be added here
            pipeline_options.ocr_options = ocr_options

            # Enable table extraction
            pipeline_options.do_table_structure = True

            return pipeline_options

        except Exception as e:
            logger.debug(f"Could not configure pipeline options: {e}")
            return None

    def validate(self, file_bytes: bytes) -> bool:
        """
        Validate document file.

        Docling is robust and handles validation internally,
        so we just check for non-empty content.

        Args:
            file_bytes: Raw file bytes

        Returns:
            True if file has content
        """
        return len(file_bytes) > 0

    def get_metadata(self, file_bytes: bytes) -> dict:
        """
        Extract metadata from document.

        Docling provides rich metadata including:
        - Number of pages
        - Number of tables found
        - Images detected
        - Document structure

        Args:
            file_bytes: Raw document bytes

        Returns:
            Dictionary with document metadata
        """
        if not DOCLING_AVAILABLE:
            return {}

        import tempfile
        import os
        from pathlib import Path

        temp_path = None
        try:
            from app.services.model_loader import get_docling_converter

            converter = get_docling_converter()

            # Create temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.tmp') as temp_file:
                temp_file.write(file_bytes)
                temp_path = temp_file.name

            result = converter.convert(temp_path, raises_on_error=False)

            metadata = {
                'processor': 'Docling',
                'format': getattr(result.document, 'format', 'unknown'),
            }

            # Extract page count if available
            if hasattr(result.document, 'pages'):
                metadata['page_count'] = len(result.document.pages)

            # Extract table count if available
            if hasattr(result.document, 'tables'):
                metadata['table_count'] = len(result.document.tables)

            # Extract image count if available
            if hasattr(result.document, 'pictures'):
                metadata['image_count'] = len(result.document.pictures)

            return metadata

        except Exception as e:
            logger.debug(f"Failed to extract metadata with Docling: {e}")
            return {}

        finally:
            # Clean up temporary file
            if temp_path:
                try:
                    if os.path.exists(temp_path):
                        os.unlink(temp_path)
                except Exception:
                    pass  # Ignore cleanup errors for metadata

    async def postprocess(self, text: str) -> str:
        """
        Postprocess extracted text.

        Docling output is already well-formatted in Markdown,
        so minimal postprocessing is needed.

        Args:
            text: Extracted text from Docling

        Returns:
            Cleaned text
        """
        if not text:
            return text

        # Remove excessive blank lines (keep paragraph structure)
        lines = text.split('\n')
        cleaned_lines = []
        prev_blank = False

        for line in lines:
            is_blank = not line.strip()

            # Skip consecutive blank lines
            if is_blank and prev_blank:
                continue

            cleaned_lines.append(line)
            prev_blank = is_blank

        return '\n'.join(cleaned_lines)

    def estimate_processing_time(self, file_size: int) -> float:
        """
        Estimate Docling processing time.

        Docling is slower than simple text extraction due to AI models,
        but provides much better quality. Estimate ~5-10 seconds per MB.

        Args:
            file_size: File size in bytes

        Returns:
            Estimated time in seconds
        """
        # Docling uses AI models: estimate 5-10 seconds per MB
        mb = file_size / (1024 * 1024)
        return mb * 7.5  # Average of 5-10 seconds per MB
