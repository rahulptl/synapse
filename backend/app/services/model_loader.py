"""
Model loader service for preloading and caching document processing models.

This service handles initialization of:
- Docling (unified document processing) - ~2-3 GB models
- EasyOCR (image OCR) - ~500 MB per language

LAZY LOADING APPROACH:
- Models are NOT included in the Docker image (saves ~2.5GB in CI/CD)
- Models are automatically downloaded on first use
- First request after deployment takes ~2-3 minutes (one-time download)
- Subsequent requests use cached models from /app/.cache
- Models persist in Cloud Run instances (warm starts reuse cache)

For local development, pre-download models using:
    python backend/scripts/download_models.py --languages en
"""
import os
import logging
from typing import Optional
import asyncio

logger = logging.getLogger(__name__)

# Global model instances (singletons)
_docling_converter: Optional[object] = None
_easyocr_reader: Optional[object] = None
_models_loaded: bool = False
_loading_lock = asyncio.Lock()


async def preload_models() -> None:
    """
    Preload all document processing models at startup.

    This function:
    1. Downloads Docling models if not present
    2. Initializes Docling DocumentConverter
    3. Initializes EasyOCR Reader with configured languages
    4. Caches instances for reuse

    Should be called during application startup (in lifespan).
    """
    global _models_loaded

    if _models_loaded:
        logger.info("Models already loaded, skipping preload")
        return

    async with _loading_lock:
        # Double-check after acquiring lock
        if _models_loaded:
            return

        logger.info("Starting model preloading...")
        start_time = asyncio.get_event_loop().time()

        try:
            # Run initialization in executor to avoid blocking
            await asyncio.to_thread(_init_docling)
            await asyncio.to_thread(_init_easyocr)

            _models_loaded = True
            elapsed = asyncio.get_event_loop().time() - start_time
            logger.info(f"✅ All models preloaded successfully in {elapsed:.2f}s")

        except Exception as e:
            logger.error(f"❌ Model preloading failed: {e}", exc_info=True)
            logger.warning("Models will be loaded on-demand (first request will be slower)")


def _init_docling() -> None:
    """Initialize Docling DocumentConverter with model downloads."""
    global _docling_converter

    if _docling_converter is not None:
        return

    try:
        from app.config import settings

        # Set environment variables for model paths
        if settings.DOCLING_MODELS_PATH:
            os.environ['DOCLING_SERVE_ARTIFACTS_PATH'] = os.path.expanduser(settings.DOCLING_MODELS_PATH)

        logger.info("Initializing Docling DocumentConverter...")

        try:
            from docling.document_converter import DocumentConverter
            from docling.datamodel.pipeline_options import PdfPipelineOptions

            # Configure pipeline for optimal performance
            pipeline_options = PdfPipelineOptions()
            pipeline_options.do_ocr = True  # Enable OCR for scanned documents

            # Initialize converter (this will download models if needed)
            # Don't specify allowed_formats - let Docling use its defaults
            # Docling will automatically handle: PDF, DOCX, PPTX, XLSX, HTML, MD, etc.
            _docling_converter = DocumentConverter()

            logger.info("✅ Docling DocumentConverter initialized successfully")

        except ImportError as e:
            logger.error(f"❌ Docling not installed: {e}")
            logger.info("Install with: pip install docling")
            raise

    except Exception as e:
        logger.error(f"Failed to initialize Docling: {e}", exc_info=True)
        raise


def _init_easyocr() -> None:
    """Initialize EasyOCR Reader with configured languages."""
    global _easyocr_reader

    if _easyocr_reader is not None:
        return

    try:
        from app.config import settings
        import torch

        # Set environment variables for model paths
        if settings.EASYOCR_MODELS_PATH:
            os.environ['EASYOCR_MODULE_PATH'] = os.path.expanduser(settings.EASYOCR_MODELS_PATH)

        # Parse language list
        languages = [lang.strip() for lang in settings.OCR_LANGUAGES.split(',')]

        # Detect GPU availability
        use_gpu = False
        if settings.ENABLE_GPU_ACCELERATION:
            use_gpu = torch.cuda.is_available()
            if use_gpu:
                logger.info(f"🚀 GPU detected: {torch.cuda.get_device_name(0)}")
            else:
                logger.info("⚡ GPU not available, using CPU for OCR")

        logger.info(f"Initializing EasyOCR Reader for languages: {languages}")

        try:
            import easyocr

            # Initialize reader (this will download models if needed)
            _easyocr_reader = easyocr.Reader(
                languages,
                gpu=use_gpu,
                download_enabled=True,
                verbose=False
            )

            gpu_status = "GPU" if use_gpu else "CPU"
            logger.info(f"✅ EasyOCR Reader initialized successfully ({gpu_status})")

        except ImportError as e:
            logger.error(f"❌ EasyOCR not installed: {e}")
            logger.info("Install with: pip install easyocr")
            raise

    except Exception as e:
        logger.error(f"Failed to initialize EasyOCR: {e}", exc_info=True)
        raise


def get_docling_converter():
    """
    Get the Docling DocumentConverter instance.

    Returns cached instance if available, otherwise initializes on-demand.

    Returns:
        DocumentConverter instance

    Raises:
        RuntimeError: If Docling initialization fails
    """
    global _docling_converter

    if _docling_converter is None:
        logger.warning("Docling not preloaded, initializing on-demand...")
        try:
            _init_docling()
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Docling: {e}")

    return _docling_converter


def get_easyocr_reader():
    """
    Get the EasyOCR Reader instance.

    Returns cached instance if available, otherwise initializes on-demand.

    Returns:
        EasyOCR Reader instance

    Raises:
        RuntimeError: If EasyOCR initialization fails
    """
    global _easyocr_reader

    if _easyocr_reader is None:
        logger.warning("EasyOCR not preloaded, initializing on-demand...")
        try:
            _init_easyocr()
        except Exception as e:
            raise RuntimeError(f"Failed to initialize EasyOCR: {e}")

    return _easyocr_reader


def is_docling_available() -> bool:
    """Check if Docling is available and initialized."""
    try:
        import docling
        return True
    except ImportError:
        return False


def is_easyocr_available() -> bool:
    """Check if EasyOCR is available and initialized."""
    try:
        import easyocr
        return True
    except ImportError:
        return False


def get_model_status() -> dict:
    """
    Get status of all loaded models.

    Returns:
        Dict with model loading status and information
    """
    return {
        "models_preloaded": _models_loaded,
        "docling": {
            "available": is_docling_available(),
            "loaded": _docling_converter is not None
        },
        "easyocr": {
            "available": is_easyocr_available(),
            "loaded": _easyocr_reader is not None
        }
    }
