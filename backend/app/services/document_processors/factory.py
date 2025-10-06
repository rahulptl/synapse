"""
Document Processor Factory and Registry.

This module provides the factory pattern for creating and managing document processors.
Processors are automatically registered when the module is imported.
"""
from typing import Optional, Dict, List, Type
import logging
from collections import defaultdict

from .base import DocumentProcessor

logger = logging.getLogger(__name__)


class DocumentProcessorFactory:
    """
    Factory for creating and managing document processors.

    The factory maintains a registry of processors and routes files to the
    appropriate processor based on file extension. It also provides information
    about supported formats for display in the frontend.

    Usage:
        # Register a processor
        DocumentProcessorFactory.register(MyProcessor)

        # Get processor for a file
        processor = DocumentProcessorFactory.get_processor("document.pdf")

        # Get all supported extensions
        exts = DocumentProcessorFactory.get_all_supported_extensions()
    """

    # Registry: extension -> processor instance
    _processors: Dict[str, DocumentProcessor] = {}

    # Reverse index: processor class -> list of extensions
    _processor_classes: Dict[Type[DocumentProcessor], List[str]] = {}

    # Category grouping for frontend display
    _categories: Dict[str, List[str]] = defaultdict(list)

    @classmethod
    def register(cls, processor_class: Type[DocumentProcessor]) -> None:
        """
        Register a document processor class.

        This method instantiates the processor and registers it for all
        its supported extensions. If a processor's dependencies are not
        available, it will still be registered but marked as unavailable.

        Args:
            processor_class: DocumentProcessor subclass to register

        Example:
            DocumentProcessorFactory.register(PDFProcessor)
        """
        try:
            processor = processor_class()

            # Track processor class
            extensions = processor.supported_extensions
            cls._processor_classes[processor_class] = extensions

            # Register for each extension
            for ext in extensions:
                ext_lower = ext.lower().lstrip('.')
                if ext_lower in cls._processors:
                    logger.warning(
                        f"Extension '{ext_lower}' already registered to "
                        f"{cls._processors[ext_lower].__class__.__name__}, "
                        f"overriding with {processor_class.__name__}"
                    )

                cls._processors[ext_lower] = processor

                # Add to category
                category = processor.format_category
                if ext_lower not in cls._categories[category]:
                    cls._categories[category].append(ext_lower)

            logger.info(
                f"Registered {processor_class.__name__} for extensions: "
                f"{extensions} (available: {processor.is_available()})"
            )

        except Exception as e:
            logger.error(
                f"Failed to register processor {processor_class.__name__}: {e}",
                exc_info=True
            )

    @classmethod
    def get_processor(cls, filename: str) -> Optional[DocumentProcessor]:
        """
        Get appropriate processor for a file.

        Selects processor based on file extension. Returns None if no
        processor is registered for the extension.

        Args:
            filename: Original filename with extension

        Returns:
            DocumentProcessor instance or None

        Example:
            processor = DocumentProcessorFactory.get_processor("report.pdf")
            if processor and processor.is_available():
                text = await processor.extract_text(file_bytes, filename)
        """
        ext = cls._get_extension(filename)
        if not ext:
            return None

        processor = cls._processors.get(ext)

        if processor and not processor.is_available():
            logger.warning(
                f"Processor for '{ext}' is registered but dependencies "
                f"are not available: {processor.__class__.__name__}"
            )
            return None

        return processor

    @classmethod
    def get_processor_by_extension(cls, extension: str) -> Optional[DocumentProcessor]:
        """
        Get processor by extension directly.

        Args:
            extension: File extension (with or without leading dot)

        Returns:
            DocumentProcessor instance or None
        """
        ext = extension.lower().lstrip('.')
        processor = cls._processors.get(ext)

        if processor and processor.is_available():
            return processor

        return None

    @classmethod
    def get_all_supported_extensions(cls) -> List[str]:
        """
        Get list of all supported file extensions.

        Only includes extensions from processors that have their
        dependencies available.

        Returns:
            Sorted list of extensions (without leading dots)

        Example:
            ['csv', 'doc', 'docx', 'html', 'pdf', 'txt', ...]
        """
        available_extensions = [
            ext for ext, proc in cls._processors.items()
            if proc.is_available()
        ]
        return sorted(available_extensions)

    @classmethod
    def get_all_extensions_including_unavailable(cls) -> List[str]:
        """
        Get all registered extensions, including unavailable processors.

        Returns:
            Sorted list of all registered extensions
        """
        return sorted(cls._processors.keys())

    @classmethod
    def get_format_display_info(cls) -> Dict[str, any]:
        """
        Get formatted information about supported formats for frontend display.

        Returns dictionary with:
        - categories: Formats grouped by category (Documents, Spreadsheets, etc.)
        - extensions: Flat list of all extensions
        - accept_string: HTML accept attribute value
        - processors: Detailed processor information

        Returns:
            Dictionary with format display information

        Example:
            {
                "categories": {
                    "Documents": [
                        {"name": "PDF", "extensions": ["pdf"]},
                        {"name": "Word", "extensions": ["docx", "doc"]},
                    ],
                    "Spreadsheets": [...]
                },
                "extensions": [".pdf", ".docx", ".xlsx", ...],
                "accept_string": ".pdf,.docx,.xlsx,...",
                "total_formats": 35
            }
        """
        # Group by category
        category_info = defaultdict(list)

        # Track which processors we've seen (to avoid duplicates)
        seen_processors = set()

        for ext, processor in cls._processors.items():
            if not processor.is_available():
                continue

            processor_class = processor.__class__

            # Skip if we've already added this processor
            if processor_class in seen_processors:
                continue

            seen_processors.add(processor_class)
            category = processor.format_category

            category_info[category].append({
                "name": processor.format_name,
                "extensions": processor.supported_extensions,
                "requires_library": processor.requires_library,
                "requires_system": processor.requires_system_dependency,
            })

        # Get all available extensions
        extensions = cls.get_all_supported_extensions()
        extensions_with_dots = [f".{ext}" for ext in extensions]

        return {
            "categories": dict(category_info),
            "extensions": extensions_with_dots,
            "accept_string": ",".join(extensions_with_dots),
            "total_formats": len(seen_processors),
            "total_extensions": len(extensions)
        }

    @classmethod
    def get_processor_info(cls) -> List[Dict[str, any]]:
        """
        Get detailed information about all registered processors.

        Returns:
            List of processor information dictionaries

        Example:
            [
                {
                    "name": "PDFProcessor",
                    "format_name": "PDF Document",
                    "extensions": ["pdf"],
                    "available": True,
                    "category": "Documents"
                },
                ...
            ]
        """
        info = []
        seen_classes = set()

        for processor in cls._processors.values():
            processor_class = processor.__class__

            if processor_class in seen_classes:
                continue

            seen_classes.add(processor_class)

            info.append({
                "name": processor_class.__name__,
                "format_name": processor.format_name,
                "category": processor.format_category,
                "extensions": processor.supported_extensions,
                "available": processor.is_available(),
                "requires_library": processor.requires_library,
                "requires_system": processor.requires_system_dependency,
            })

        return sorted(info, key=lambda x: (x['category'], x['format_name']))

    @classmethod
    def detect_format_by_magic_bytes(cls, file_bytes: bytes) -> Optional[str]:
        """
        Detect file format using magic bytes (file signatures).

        Attempts to identify file format by examining the first few bytes
        of the file, which is more reliable than extension-based detection.

        Args:
            file_bytes: Raw file bytes

        Returns:
            Detected extension or None

        Example:
            ext = DocumentProcessorFactory.detect_format_by_magic_bytes(file_bytes)
            if ext:
                processor = DocumentProcessorFactory.get_processor_by_extension(ext)
        """
        if len(file_bytes) < 4:
            return None

        # Common magic bytes signatures
        magic_signatures = {
            b'%PDF': 'pdf',
            b'PK\x03\x04': 'zip_based',  # Could be DOCX, XLSX, PPTX, ODT, etc.
            b'\xff\xd8\xff': 'jpg',
            b'\x89PNG\r\n\x1a\n': 'png',
            b'GIF87a': 'gif',
            b'GIF89a': 'gif',
            b'RIFF': 'wav_or_avi',
            b'\x00\x00\x00\x18ftypmp42': 'mp4',
            b'\x00\x00\x00\x20ftypiso': 'mp4',
        }

        # Check magic bytes
        for signature, format_hint in magic_signatures.items():
            if file_bytes.startswith(signature):
                # For ZIP-based formats, we'd need further inspection
                if format_hint == 'zip_based':
                    return cls._detect_zip_based_format(file_bytes)
                return format_hint

        return None

    @classmethod
    def _detect_zip_based_format(cls, file_bytes: bytes) -> Optional[str]:
        """
        Detect specific format for ZIP-based files (DOCX, XLSX, etc.).

        ZIP-based Office files contain specific internal files that
        identify the format.

        Args:
            file_bytes: Raw file bytes (must be a ZIP archive)

        Returns:
            Detected extension or 'zip'
        """
        import zipfile
        import io

        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                namelist = zf.namelist()

                # DOCX: word/document.xml
                if 'word/document.xml' in namelist:
                    return 'docx'

                # XLSX: xl/workbook.xml
                if 'xl/workbook.xml' in namelist:
                    return 'xlsx'

                # PPTX: ppt/presentation.xml
                if 'ppt/presentation.xml' in namelist:
                    return 'pptx'

                # ODT: content.xml + mimetype="application/vnd.oasis.opendocument.text"
                if 'content.xml' in namelist and 'mimetype' in namelist:
                    mimetype = zf.read('mimetype').decode('utf-8', errors='ignore')
                    if 'opendocument.text' in mimetype:
                        return 'odt'
                    elif 'opendocument.spreadsheet' in mimetype:
                        return 'ods'
                    elif 'opendocument.presentation' in mimetype:
                        return 'odp'

                # Default to ZIP if unknown
                return 'zip'

        except Exception as e:
            logger.debug(f"Failed to inspect ZIP archive: {e}")
            return 'zip'

    @classmethod
    def _get_extension(cls, filename: str) -> Optional[str]:
        """
        Extract file extension from filename.

        Args:
            filename: Filename with extension

        Returns:
            Lowercase extension without leading dot, or None
        """
        if not filename or '.' not in filename:
            return None

        ext = filename.rsplit('.', 1)[-1].lower()
        return ext

    @classmethod
    def clear_registry(cls) -> None:
        """
        Clear all registered processors.

        Used primarily for testing. In production, processors are registered
        once during module initialization.
        """
        cls._processors.clear()
        cls._processor_classes.clear()
        cls._categories.clear()
        logger.info("Cleared processor registry")

    @classmethod
    def get_statistics(cls) -> Dict[str, any]:
        """
        Get statistics about registered processors.

        Returns:
            Dictionary with registry statistics

        Example:
            {
                "total_processors": 8,
                "total_extensions": 25,
                "available_processors": 7,
                "available_extensions": 23,
                "categories": 4
            }
        """
        total_processors = len(set(cls._processors.values()))
        available_processors = len([
            p for p in set(cls._processors.values())
            if p.is_available()
        ])

        return {
            "total_processors": total_processors,
            "total_extensions": len(cls._processors),
            "available_processors": available_processors,
            "available_extensions": len(cls.get_all_supported_extensions()),
            "categories": len(cls._categories),
        }


# Singleton instance for convenience
factory = DocumentProcessorFactory()
