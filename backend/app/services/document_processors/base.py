"""
Base classes and interfaces for document processors.

This module provides the foundation for the extensible document processing framework.
Each document format (PDF, DOCX, XLSX, etc.) implements a processor that inherits from
DocumentProcessor.
"""
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class DocumentFormat(Enum):
    """
    Enumeration of all supported document formats.

    Each format maps to a specific processor implementation.
    """
    # Documents
    PDF = "pdf"
    DOCX = "docx"
    DOC = "doc"
    RTF = "rtf"
    ODT = "odt"
    TEXT = "text"

    # Spreadsheets
    XLSX = "xlsx"
    XLS = "xls"
    CSV = "csv"
    TSV = "tsv"
    ODS = "ods"

    # Presentations
    PPTX = "pptx"
    PPT = "ppt"
    ODP = "odp"

    # Technical/Developer
    MARKDOWN = "markdown"
    RST = "rst"
    JSON = "json"
    XML = "xml"
    YAML = "yaml"
    HTML = "html"

    # Rich Text
    EPUB = "epub"
    LATEX = "latex"

    # Media
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"

    # Archives
    ZIP = "zip"
    TAR = "tar"
    RAR = "rar"


class ProcessingError(Exception):
    """Raised when document processing fails."""
    pass


class ValidationError(Exception):
    """Raised when document validation fails."""
    pass


class DocumentProcessor(ABC):
    """
    Abstract base class for document processors.

    Each processor handles text extraction for a specific format family.
    Processors are registered with the factory and selected based on file extension.

    Usage:
        class MyProcessor(DocumentProcessor):
            @property
            def supported_extensions(self) -> List[str]:
                return ['txt', 'md']

            async def extract_text(self, file_bytes: bytes, filename: str) -> str:
                return file_bytes.decode('utf-8')
    """

    def __init__(self):
        """Initialize processor and check dependencies."""
        self.available = self._check_dependencies()
        if not self.available:
            logger.warning(
                f"{self.__class__.__name__} dependencies not available. "
                f"Supported extensions: {self.supported_extensions}"
            )

    @property
    @abstractmethod
    def supported_extensions(self) -> List[str]:
        """
        Return list of file extensions this processor handles.

        Extensions should be lowercase without the leading dot.
        Example: ['pdf', 'txt', 'md']

        Returns:
            List of supported file extensions
        """
        pass

    @property
    @abstractmethod
    def format_name(self) -> str:
        """
        Human-readable format name for display.

        Used in error messages and frontend display.
        Example: "PDF Document", "Excel Spreadsheet"

        Returns:
            Display name for this format
        """
        pass

    @property
    @abstractmethod
    def format_category(self) -> str:
        """
        Category for grouping formats in UI.

        Examples: "Documents", "Spreadsheets", "Images", "Technical"

        Returns:
            Category name
        """
        pass

    @property
    def requires_library(self) -> Optional[str]:
        """
        Python library required for this processor.

        Returns None if processor uses only built-in libraries.
        Used for dependency checking and installation instructions.

        Returns:
            Library name (e.g., "PyMuPDF") or None
        """
        return None

    @property
    def requires_system_dependency(self) -> Optional[str]:
        """
        System dependency required (e.g., tesseract, pandoc).

        Returns:
            System package name or None
        """
        return None

    @abstractmethod
    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from document bytes.

        This is the core method that performs the actual text extraction.
        Implementations should handle format-specific parsing and return
        clean, readable text suitable for embedding generation.

        Args:
            file_bytes: Raw document bytes
            filename: Original filename (used for format hints and logging)

        Returns:
            Extracted text content as a string

        Raises:
            ProcessingError: If extraction fails
            ValidationError: If file is invalid for this processor
        """
        pass

    def validate(self, file_bytes: bytes) -> bool:
        """
        Validate that file bytes match this format.

        Default implementation checks magic bytes if available.
        Override for format-specific validation.

        Args:
            file_bytes: Raw document bytes

        Returns:
            True if file is valid for this processor

        Raises:
            ValidationError: If validation fails
        """
        # Default: assume valid if we have bytes
        return len(file_bytes) > 0

    def get_metadata(self, file_bytes: bytes) -> Dict[str, Any]:
        """
        Extract metadata from document (optional).

        Override this method to extract format-specific metadata
        like page count, author, creation date, etc.

        Args:
            file_bytes: Raw document bytes

        Returns:
            Dictionary with metadata (page_count, author, etc.)
        """
        return {}

    def _check_dependencies(self) -> bool:
        """
        Check if required dependencies are available.

        Override this method to check for specific libraries.

        Returns:
            True if all dependencies are available
        """
        if self.requires_library:
            try:
                # Try to import the required library
                __import__(self.requires_library.split('>=')[0].split('==')[0].lower().replace('-', '_'))
                return True
            except ImportError:
                logger.warning(
                    f"{self.__class__.__name__} requires {self.requires_library} "
                    f"but it is not installed"
                )
                return False
        return True

    def is_available(self) -> bool:
        """
        Check if this processor is available for use.

        Returns:
            True if processor dependencies are met
        """
        return self.available

    def get_magic_bytes(self) -> Optional[bytes]:
        """
        Return magic bytes (file signature) for format detection.

        Override to provide magic bytes for robust format detection.

        Returns:
            Magic bytes or None if format doesn't have a signature
        """
        return None

    async def preprocess(self, file_bytes: bytes) -> bytes:
        """
        Preprocess file bytes before extraction (optional).

        Override to add preprocessing like decompression, decryption, etc.

        Args:
            file_bytes: Raw file bytes

        Returns:
            Preprocessed bytes
        """
        return file_bytes

    async def postprocess(self, text: str) -> str:
        """
        Postprocess extracted text (optional).

        Override to add cleanup, formatting, sanitization, etc.
        Default implementation strips whitespace and removes empty lines.

        Args:
            text: Extracted text

        Returns:
            Cleaned text
        """
        # Remove excessive whitespace
        lines = [line.strip() for line in text.split('\n')]
        # Remove empty lines
        lines = [line for line in lines if line]
        return '\n'.join(lines)

    def estimate_processing_time(self, file_size: int) -> float:
        """
        Estimate processing time in seconds based on file size.

        Used for progress indication and timeout calculation.
        Override for format-specific estimates.

        Args:
            file_size: File size in bytes

        Returns:
            Estimated processing time in seconds
        """
        # Default: 1MB per second
        return file_size / (1024 * 1024)

    def __repr__(self) -> str:
        """String representation for debugging."""
        return (
            f"<{self.__class__.__name__} "
            f"extensions={self.supported_extensions} "
            f"available={self.available}>"
        )
