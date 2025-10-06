"""
Text document processor.

Handles plain text files including TXT, LOG, and other text-based formats.
This is the simplest processor and serves as a fallback for unknown formats.
"""
from typing import List, Optional
import logging
import chardet

from .base import DocumentProcessor, ProcessingError

logger = logging.getLogger(__name__)


class TextProcessor(DocumentProcessor):
    """
    Processor for plain text files.

    Handles encoding detection and text extraction from various text formats.
    Supports multiple encodings (UTF-8, Latin-1, etc.) with automatic detection.
    """

    @property
    def supported_extensions(self) -> List[str]:
        """Text file extensions."""
        return [
            'txt',
            'text',
            'log',
            'conf',
            'cfg',
            'ini',
            'env',
            'sh',
            'bat',
            'ps1',
            'properties',
        ]

    @property
    def format_name(self) -> str:
        """Display name."""
        return "Plain Text"

    @property
    def format_category(self) -> str:
        """Format category."""
        return "Documents"

    @property
    def requires_library(self) -> Optional[str]:
        """No external libraries required."""
        return None

    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text with automatic encoding detection.

        Tries UTF-8 first, falls back to chardet for encoding detection,
        and ultimately tries common encodings if detection fails.

        Args:
            file_bytes: Raw file bytes
            filename: Original filename

        Returns:
            Decoded text content

        Raises:
            ProcessingError: If text cannot be decoded
        """
        if not file_bytes:
            raise ProcessingError("Empty file")

        # Try UTF-8 first (most common)
        try:
            text = file_bytes.decode('utf-8')
            logger.debug(f"Decoded {filename} as UTF-8")
            return text
        except UnicodeDecodeError:
            pass

        # Try automatic encoding detection with chardet
        try:
            detection = chardet.detect(file_bytes)
            if detection and detection['encoding']:
                encoding = detection['encoding']
                confidence = detection.get('confidence', 0)

                if confidence > 0.7:  # High confidence
                    text = file_bytes.decode(encoding, errors='replace')
                    logger.info(
                        f"Decoded {filename} as {encoding} "
                        f"(confidence: {confidence:.2f})"
                    )
                    return text
        except Exception as e:
            logger.debug(f"Chardet detection failed: {e}")

        # Fallback to common encodings
        encodings_to_try = [
            'utf-8',
            'latin-1',
            'cp1252',  # Windows
            'iso-8859-1',
            'ascii',
        ]

        for encoding in encodings_to_try:
            try:
                text = file_bytes.decode(encoding, errors='replace')
                logger.info(f"Decoded {filename} as {encoding} (fallback)")
                return text
            except Exception:
                continue

        # Last resort: decode with replacement characters
        try:
            text = file_bytes.decode('utf-8', errors='replace')
            logger.warning(
                f"Could not detect encoding for {filename}, "
                f"using UTF-8 with replacements"
            )
            return text
        except Exception as e:
            raise ProcessingError(f"Failed to decode text file: {e}")

    def validate(self, file_bytes: bytes) -> bool:
        """
        Validate that file is text.

        Checks if file is mostly printable ASCII or valid UTF-8.

        Args:
            file_bytes: Raw file bytes

        Returns:
            True if file appears to be text
        """
        if not file_bytes:
            return False

        # Sample first 8KB for validation
        sample = file_bytes[:8192]

        # Try to decode as UTF-8
        try:
            sample.decode('utf-8')
            return True
        except UnicodeDecodeError:
            pass

        # Check if mostly printable ASCII
        printable_count = sum(
            1 for byte in sample
            if 32 <= byte < 127 or byte in (9, 10, 13)  # Printable + tab/newline/return
        )

        # If >70% is printable, consider it text
        is_text = printable_count / len(sample) > 0.7

        return is_text

    async def postprocess(self, text: str) -> str:
        """
        Postprocess text (minimal for plain text).

        Args:
            text: Extracted text

        Returns:
            Cleaned text
        """
        # For plain text, just strip trailing whitespace from lines
        lines = [line.rstrip() for line in text.split('\n')]
        return '\n'.join(lines)

    def estimate_processing_time(self, file_size: int) -> float:
        """
        Estimate processing time.

        Text processing is very fast (10MB/second).

        Args:
            file_size: File size in bytes

        Returns:
            Estimated time in seconds
        """
        return file_size / (10 * 1024 * 1024)  # 10MB per second
