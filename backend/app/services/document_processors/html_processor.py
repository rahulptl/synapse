"""
HTML document processor.

Handles HTML and XML files, extracting clean text content while removing
scripts, styles, and markup.
"""
from typing import List, Optional
import logging

from .base import DocumentProcessor, ProcessingError

logger = logging.getLogger(__name__)

# Optional dependency
try:
    from bs4 import BeautifulSoup
    BEAUTIFULSOUP_AVAILABLE = True
except ImportError:
    BeautifulSoup = None
    BEAUTIFULSOUP_AVAILABLE = False
    logger.warning("beautifulsoup4 not available - HTML processing disabled")


class HTMLProcessor(DocumentProcessor):
    """
    Processor for HTML and XML files.

    Extracts clean text from HTML/XML by removing scripts, styles, and tags.
    Preserves document structure and readability.
    """

    @property
    def supported_extensions(self) -> List[str]:
        """HTML/XML file extensions."""
        return [
            'html',
            'htm',
            'xhtml',
            'xml',
            'svg',
        ]

    @property
    def format_name(self) -> str:
        """Display name."""
        return "HTML/XML"

    @property
    def format_category(self) -> str:
        """Format category."""
        return "Technical"

    @property
    def requires_library(self) -> Optional[str]:
        """Required library."""
        return "beautifulsoup4>=4.12.0"

    def _check_dependencies(self) -> bool:
        """Check if BeautifulSoup is available."""
        return BEAUTIFULSOUP_AVAILABLE

    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from HTML/XML.

        Removes scripts, styles, and markup while preserving text content
        and document structure.

        Args:
            file_bytes: Raw HTML/XML bytes
            filename: Original filename

        Returns:
            Clean text content

        Raises:
            ProcessingError: If parsing fails or BeautifulSoup is unavailable
        """
        if not BEAUTIFULSOUP_AVAILABLE:
            raise ProcessingError(
                "HTML processing requires beautifulsoup4. "
                "Install with: pip install beautifulsoup4"
            )

        if not file_bytes:
            raise ProcessingError("Empty HTML file")

        try:
            # Decode HTML
            try:
                content = file_bytes.decode('utf-8')
            except UnicodeDecodeError:
                # Try with latin-1 encoding
                content = file_bytes.decode('latin-1', errors='replace')

            # Parse HTML
            soup = BeautifulSoup(content, 'html.parser')

            # Remove script and style elements
            for element in soup(['script', 'style', 'noscript']):
                element.decompose()

            # Extract text
            text = soup.get_text()

            # Clean up whitespace
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = '\n'.join(chunk for chunk in chunks if chunk)

            if not text:
                logger.warning(f"No text extracted from {filename}")
                return "[Empty HTML document]"

            logger.info(f"Extracted {len(text)} characters from HTML: {filename}")
            return text

        except Exception as e:
            logger.error(f"HTML extraction failed for {filename}: {e}", exc_info=True)
            raise ProcessingError(f"Failed to extract text from HTML: {e}")

    def validate(self, file_bytes: bytes) -> bool:
        """
        Validate HTML/XML file.

        Checks for HTML/XML markers in the content.

        Args:
            file_bytes: Raw file bytes

        Returns:
            True if file appears to be HTML/XML
        """
        if not file_bytes:
            return False

        # Sample first 8KB
        sample = file_bytes[:8192]

        try:
            text = sample.decode('utf-8', errors='ignore').lower()
        except:
            return False

        # Look for HTML/XML markers
        html_markers = [
            b'<html',
            b'<!doctype html',
            b'<head',
            b'<body',
            b'<?xml',
            b'<svg',
        ]

        for marker in html_markers:
            if marker in sample.lower():
                return True

        return False

    def get_metadata(self, file_bytes: bytes) -> dict:
        """
        Extract metadata from HTML (title, meta tags, etc.).

        Args:
            file_bytes: Raw HTML bytes

        Returns:
            Dictionary with metadata
        """
        if not BEAUTIFULSOUP_AVAILABLE:
            return {}

        try:
            content = file_bytes.decode('utf-8', errors='replace')
            soup = BeautifulSoup(content, 'html.parser')

            metadata = {}

            # Extract title
            if soup.title:
                metadata['title'] = soup.title.string

            # Extract meta tags
            meta_tags = soup.find_all('meta')
            for meta in meta_tags:
                name = meta.get('name') or meta.get('property')
                content = meta.get('content')
                if name and content:
                    metadata[f'meta_{name}'] = content

            return metadata

        except Exception as e:
            logger.debug(f"Failed to extract HTML metadata: {e}")
            return {}

    async def postprocess(self, text: str) -> str:
        """
        Postprocess HTML text.

        Removes excessive whitespace and empty lines.

        Args:
            text: Extracted text

        Returns:
            Cleaned text
        """
        # Split into lines and remove empty ones
        lines = [line.strip() for line in text.split('\n')]
        lines = [line for line in lines if line]

        # Join with single newlines
        return '\n'.join(lines)

    def estimate_processing_time(self, file_size: int) -> float:
        """
        Estimate processing time for HTML.

        HTML parsing is moderate speed (~5MB/second).

        Args:
            file_size: File size in bytes

        Returns:
            Estimated time in seconds
        """
        return file_size / (5 * 1024 * 1024)  # 5MB per second
