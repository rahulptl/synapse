#!/usr/bin/env python3
"""
Download all document processing models for offline deployment.

This script downloads models during Docker build to avoid:
1. Runtime downloads on first request
2. Network dependencies in production
3. Slow cold starts

Models downloaded:
- Docling: Layout analysis, table extraction, OCR models (~2-3 GB)
- EasyOCR: English language pack (~500 MB per language)

Usage:
    python download_models.py
    python download_models.py --languages en,es,fr
"""
import os
import sys
import argparse
import logging
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def download_docling_models():
    """
    Download Docling models by initializing DocumentConverter.

    This triggers automatic model download and caching.
    Models are cached in /app/.cache/docling/models in Docker.
    """
    logger.info("="*60)
    logger.info("Downloading Docling models...")
    logger.info("="*60)

    try:
        from docling.document_converter import DocumentConverter

        # Set custom path if specified
        models_path = os.getenv('DOCLING_SERVE_ARTIFACTS_PATH')
        if models_path:
            models_path = os.path.expanduser(models_path)
            Path(models_path).mkdir(parents=True, exist_ok=True)
            logger.info(f"Using custom Docling models path: {models_path}")

        # Initialize converter (this downloads models automatically)
        logger.info("Initializing Docling DocumentConverter...")
        logger.info("This will download ~2-3 GB of models (one-time operation)...")

        converter = DocumentConverter()

        logger.info("✅ Docling models downloaded successfully")
        return True

    except ImportError as e:
        logger.error(f"❌ Docling not installed: {e}")
        logger.info("Install with: pip install docling")
        return False
    except Exception as e:
        logger.error(f"❌ Failed to download Docling models: {e}", exc_info=True)
        return False


def download_easyocr_models(languages=['en']):
    """
    Download EasyOCR models for specified languages.

    Models are cached in /app/.cache/easyocr in Docker.

    Args:
        languages: List of language codes (e.g., ['en', 'es', 'fr'])
    """
    logger.info("="*60)
    logger.info(f"Downloading EasyOCR models for languages: {languages}")
    logger.info("="*60)

    try:
        import easyocr
        import torch

        # Set custom path if specified
        models_path = os.getenv('EASYOCR_MODULE_PATH')
        if models_path:
            models_path = os.path.expanduser(models_path)
            Path(models_path).mkdir(parents=True, exist_ok=True)
            logger.info(f"Using custom EasyOCR models path: {models_path}")

        # Check GPU availability (will be CPU in Docker build)
        has_gpu = torch.cuda.is_available()
        if has_gpu:
            logger.info(f"🚀 GPU detected: {torch.cuda.get_device_name(0)}")
        else:
            logger.info("⚡ No GPU detected, downloading CPU-compatible models")

        # Download models for each language
        for lang in languages:
            logger.info(f"Downloading EasyOCR model for '{lang}'...")
            try:
                # Initialize reader (triggers model download)
                reader = easyocr.Reader(
                    [lang],
                    gpu=has_gpu,
                    download_enabled=True,
                    verbose=True
                )
                logger.info(f"✅ EasyOCR model '{lang}' downloaded successfully")
            except Exception as e:
                logger.error(f"❌ Failed to download EasyOCR model '{lang}': {e}")
                return False

        logger.info("✅ All EasyOCR models downloaded successfully")
        return True

    except ImportError as e:
        logger.error(f"❌ EasyOCR not installed: {e}")
        logger.info("Install with: pip install easyocr torch")
        return False
    except Exception as e:
        logger.error(f"❌ Failed to download EasyOCR models: {e}", exc_info=True)
        return False


def verify_downloads():
    """
    Verify that models were downloaded successfully.

    Checks:
    - Docling models directory exists and has content
    - EasyOCR models directory exists and has .pth files
    """
    logger.info("="*60)
    logger.info("Verifying model downloads...")
    logger.info("="*60)

    all_ok = True

    # Check Docling models
    docling_path = os.getenv('DOCLING_SERVE_ARTIFACTS_PATH', '~/.cache/docling/models')
    docling_path = os.path.expanduser(docling_path)

    if os.path.exists(docling_path):
        model_files = list(Path(docling_path).rglob('*'))
        model_count = len(model_files)

        # Calculate total size
        total_size_mb = sum(f.stat().st_size for f in model_files if f.is_file()) / (1024 * 1024)

        logger.info(f"✅ Docling models found: {docling_path}")
        logger.info(f"   Files: {model_count}, Total size: {total_size_mb:.1f} MB")
    else:
        logger.warning(f"⚠️ Docling models directory not found: {docling_path}")
        all_ok = False

    # Check EasyOCR models
    easyocr_path = os.getenv('EASYOCR_MODULE_PATH', '~/.EasyOCR')
    easyocr_path = os.path.expanduser(easyocr_path)

    if os.path.exists(easyocr_path):
        model_files = list(Path(easyocr_path).rglob('*.pth'))
        model_count = len(model_files)

        # Calculate total size
        total_size_mb = sum(f.stat().st_size for f in model_files) / (1024 * 1024)

        logger.info(f"✅ EasyOCR models found: {easyocr_path}")
        logger.info(f"   .pth files: {model_count}, Total size: {total_size_mb:.1f} MB")
    else:
        logger.warning(f"⚠️ EasyOCR models directory not found: {easyocr_path}")
        all_ok = False

    return all_ok


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Download document processing models for offline deployment'
    )
    parser.add_argument(
        '--languages',
        type=str,
        default='en',
        help='Comma-separated list of language codes for OCR (default: en)'
    )
    parser.add_argument(
        '--skip-docling',
        action='store_true',
        help='Skip Docling model download'
    )
    parser.add_argument(
        '--skip-easyocr',
        action='store_true',
        help='Skip EasyOCR model download'
    )
    parser.add_argument(
        '--verify-only',
        action='store_true',
        help='Only verify existing models without downloading'
    )

    args = parser.parse_args()

    if args.verify_only:
        success = verify_downloads()
        sys.exit(0 if success else 1)

    # Parse languages
    languages = [lang.strip() for lang in args.languages.split(',')]

    logger.info("="*60)
    logger.info("Model Download Script for Synapse")
    logger.info("="*60)
    logger.info(f"Languages: {languages}")
    logger.info(f"Skip Docling: {args.skip_docling}")
    logger.info(f"Skip EasyOCR: {args.skip_easyocr}")
    logger.info("="*60)

    success = True

    # Download Docling models
    if not args.skip_docling:
        if not download_docling_models():
            success = False

    # Download EasyOCR models
    if not args.skip_easyocr:
        if not download_easyocr_models(languages):
            success = False

    # Verify downloads
    if success:
        success = verify_downloads()

    # Summary
    logger.info("="*60)
    if success:
        logger.info("✅ All models downloaded and verified successfully!")
        logger.info("Models are now cached and ready for production use.")
    else:
        logger.error("❌ Some models failed to download. Check logs above.")
    logger.info("="*60)

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
