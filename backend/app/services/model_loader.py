"""
Centralized loading and caching of heavy ML models.

Docling and EasyOCR are sizable dependencies (hundreds of MB each) that we
only want to initialize once per process.  This module provides thin helpers
used by document processors to fetch shared instances on demand.
"""
from __future__ import annotations

import logging
import threading
import os
from app.config import settings

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Docling loader
# -----------------------------------------------------------------------------

_docling_converter = None
_docling_lock = threading.Lock()


def _load_docling_converter():
    """
    Lazily construct a Docling DocumentConverter with sensible defaults.

    Returns:
        DocumentConverter instance

    Raises:
        RuntimeError: if Docling cannot be imported/initialised
    """
    try:
        from docling.document_converter import DocumentConverter
    except ImportError as exc:
        raise RuntimeError(
            "Docling is required for advanced document extraction. "
            "Install with: pip install docling"
        ) from exc

    logger.info("Initialising Docling converter (this may download models on first run)")
    # Honour custom artifact path if provided (Dockerfile also sets ENV for this).
    if settings.DOCLING_MODELS_PATH:
        os.environ.setdefault("DOCLING_SERVE_ARTIFACTS_PATH", settings.DOCLING_MODELS_PATH)

    converter = DocumentConverter()
    logger.info("Docling converter initialised successfully")
    return converter


def get_docling_converter():
    """Return the shared Docling DocumentConverter instance."""
    global _docling_converter

    if _docling_converter is None:
        with _docling_lock:
            if _docling_converter is None:
                _docling_converter = _load_docling_converter()

    return _docling_converter


# -----------------------------------------------------------------------------
# EasyOCR loader
# -----------------------------------------------------------------------------

_easyocr_reader = None
_easyocr_lock = threading.Lock()


def _load_easyocr_reader():
    """
    Lazily construct an EasyOCR reader with configuration from settings.

    Returns:
        easyocr.Reader instance

    Raises:
        RuntimeError: if EasyOCR cannot be imported/initialised
    """
    try:
        import easyocr
        import torch
    except ImportError as exc:
        raise RuntimeError(
            "EasyOCR is required for image OCR. Install with: pip install easyocr torch"
        ) from exc

    languages = [lang.strip() for lang in settings.OCR_LANGUAGES.split(",") if lang.strip()]
    if not languages:
        languages = ["en"]

    use_gpu = False
    if settings.ENABLE_GPU_ACCELERATION:
        try:
            use_gpu = torch.cuda.is_available()
        except Exception as exc:  # pragma: no cover
            logger.debug("Failed to probe GPU availability: %s", exc)
            use_gpu = False

    logger.info(
        "Initialising EasyOCR reader (languages=%s, gpu=%s)",
        languages,
        use_gpu,
    )
    reader_kwargs = {
        "gpu": use_gpu,
        "download_enabled": True,
    }

    if settings.EASYOCR_MODELS_PATH:
        reader_kwargs["model_storage_directory"] = settings.EASYOCR_MODELS_PATH

    reader = easyocr.Reader(languages, **reader_kwargs)
    logger.info("EasyOCR reader initialised successfully")
    return reader


def get_easyocr_reader():
    """Return a shared EasyOCR Reader instance."""
    global _easyocr_reader

    if _easyocr_reader is None:
        with _easyocr_lock:
            if _easyocr_reader is None:
                _easyocr_reader = _load_easyocr_reader()

    return _easyocr_reader


# -----------------------------------------------------------------------------
# Optional eager preload
# -----------------------------------------------------------------------------

def preload_models():
    """
    Preload heavy models at startup if enabled.

    This avoids per-request cold starts at the cost of longer service boot time.
    """
    if not settings.PRELOAD_MODELS_ON_STARTUP:
        return

    try:
        get_docling_converter()
    except Exception as exc:  # pragma: no cover
        logger.warning("Docling preload failed: %s", exc)

    try:
        get_easyocr_reader()
    except Exception as exc:  # pragma: no cover
        logger.warning("EasyOCR preload failed: %s", exc)


# Kick off preload when module is imported if desired.
preload_models()
