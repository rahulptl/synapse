"""
Document Processors Module.

This module provides a plugin-based framework for processing different document formats.
All processors are automatically registered when this module is imported.

Usage:
    from app.services.document_processors import DocumentProcessorFactory

    # Get processor for a file
    processor = DocumentProcessorFactory.get_processor("document.pdf")
    if processor:
        text = await processor.extract_text(file_bytes, filename)

    # Get list of supported formats
    extensions = DocumentProcessorFactory.get_all_supported_extensions()

    # Get format info for frontend display
    format_info = DocumentProcessorFactory.get_format_display_info()
"""
import logging

# Import base classes
from .base import (
    DocumentProcessor,
    DocumentFormat,
    ProcessingError,
    ValidationError,
)

# Import factory
from .factory import DocumentProcessorFactory, factory

# Import all processors (this triggers registration)
from .text_processor import TextProcessor
from .html_processor import HTMLProcessor
from .pdf_processor import PDFProcessor
from .word_processor import WordProcessor
from .image_processor import ImageProcessor

logger = logging.getLogger(__name__)


# Auto-register all processors
def _register_processors():
    """
    Register all document processors.

    This function is called automatically when the module is imported.
    Processors are registered in order of preference (more specific first).
    """
    processors_to_register = [
        # Specific formats first
        PDFProcessor,
        WordProcessor,
        ImageProcessor,
        HTMLProcessor,

        # Generic text last (fallback)
        TextProcessor,
    ]

    for processor_class in processors_to_register:
        try:
            DocumentProcessorFactory.register(processor_class)
        except Exception as e:
            logger.error(
                f"Failed to register {processor_class.__name__}: {e}",
                exc_info=True
            )


# Register processors on module import
_register_processors()


# Log registration status
def _log_registration_status():
    """Log processor registration statistics."""
    stats = DocumentProcessorFactory.get_statistics()

    logger.info(
        f"Document processors initialized: "
        f"{stats['available_processors']}/{stats['total_processors']} available, "
        f"{stats['available_extensions']} extensions supported"
    )

    # Log unavailable processors as warnings
    for processor_info in DocumentProcessorFactory.get_processor_info():
        if not processor_info['available']:
            logger.warning(
                f"Processor {processor_info['name']} unavailable: "
                f"requires {processor_info['requires_library']}"
            )


_log_registration_status()


# Expose public API
__all__ = [
    # Base classes
    'DocumentProcessor',
    'DocumentFormat',
    'ProcessingError',
    'ValidationError',

    # Factory
    'DocumentProcessorFactory',
    'factory',

    # Processors (for direct use if needed)
    'TextProcessor',
    'HTMLProcessor',
    'PDFProcessor',
    'WordProcessor',
    'ImageProcessor',
]
