"""
Image document processor.

Handles image files with OCR (Optical Character Recognition) to extract text.
Uses EasyOCR for advanced multi-language OCR with GPU acceleration support.
Supports common image formats: JPG, PNG, GIF, BMP, TIFF, WebP.
"""
from typing import List, Optional
import io
import logging
import numpy as np

from .base import DocumentProcessor, ProcessingError

logger = logging.getLogger(__name__)

# Silence noisy logs
logging.getLogger('PIL').setLevel(logging.INFO)
logging.getLogger('easyocr').setLevel(logging.INFO)

# Optional dependencies
try:
    from PIL import Image
    import easyocr
    OCR_AVAILABLE = True
except ImportError:
    Image = None
    easyocr = None
    OCR_AVAILABLE = False
    logger.warning("EasyOCR not available - image text extraction disabled")


class ImageProcessor(DocumentProcessor):
    """
    Processor for image files.

    Uses EasyOCR for advanced multi-language text extraction.
    Supports GPU acceleration for faster processing.
    More accurate than Tesseract for most use cases.
    """

    @property
    def supported_extensions(self) -> List[str]:
        """Image file extensions."""
        return [
            'jpg',
            'jpeg',
            'png',
            'gif',
            'bmp',
            'tiff',
            'tif',
            'webp',
        ]

    @property
    def format_name(self) -> str:
        """Display name."""
        return "Image (EasyOCR)"

    @property
    def format_category(self) -> str:
        """Format category."""
        return "Images"

    @property
    def requires_library(self) -> Optional[str]:
        """Required libraries."""
        return "easyocr>=1.7.0, Pillow>=10.0.0, torch>=2.0.0"

    @property
    def requires_system_dependency(self) -> Optional[str]:
        """System dependency."""
        return None  # EasyOCR has no system dependencies

    def _check_dependencies(self) -> bool:
        """Check if OCR dependencies are available."""
        return OCR_AVAILABLE

    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from image using EasyOCR.

        Supports: PNG, JPEG, JPG, GIF, BMP, TIFF, WebP

        EasyOCR advantages:
        - 80+ languages supported
        - Better accuracy than Tesseract
        - GPU acceleration
        - No system dependencies

        Args:
            file_bytes: Raw image bytes
            filename: Original filename

        Returns:
            Extracted text via OCR

        Raises:
            ProcessingError: If OCR fails or dependencies unavailable
        """
        if not OCR_AVAILABLE:
            raise ProcessingError(
                "Image OCR requires EasyOCR and Pillow. "
                "Install with: pip install easyocr torch Pillow"
            )

        if not file_bytes:
            raise ProcessingError("Empty image file")

        try:
            # Get preloaded EasyOCR reader from model loader
            from app.services.model_loader import get_easyocr_reader

            reader = get_easyocr_reader()

            # Open image with PIL
            img = Image.open(io.BytesIO(file_bytes))

            # Convert to RGB if needed (EasyOCR works best with RGB)
            if img.mode not in ('RGB', 'L'):
                logger.debug(f"Converting image from {img.mode} to RGB")
                img = img.convert('RGB')

            # Preprocess for better OCR accuracy
            img = await self._preprocess_image(img)

            # Convert to numpy array for EasyOCR
            img_array = np.array(img)

            # Perform OCR with EasyOCR
            # Result format: list of (bbox, text, confidence)
            results = reader.readtext(img_array)

            # Extract text from results
            if results:
                # Sort by Y-coordinate (top to bottom reading order)
                results_sorted = sorted(results, key=lambda x: x[0][0][1])

                # Join text with newlines (preserve reading order)
                text = '\n'.join([result[1] for result in results_sorted])

                if text.strip():
                    logger.info(
                        f"✅ EasyOCR extracted {len(text)} chars from {filename} "
                        f"({len(results)} text regions found)"
                    )
                    return text

            logger.warning(f"⚠️ No text found in image {filename}")
            return "[IMAGE OCR: No text detected in image]"

        except Exception as e:
            logger.error(f"EasyOCR failed for {filename}: {e}", exc_info=True)
            raise ProcessingError(f"Failed to perform OCR on image: {e}")

    async def _preprocess_image(self, img: 'Image.Image') -> 'Image.Image':
        """
        Preprocess image for better OCR accuracy.

        Applies:
        - Contrast enhancement
        - Noise reduction (if very small)
        - Rotation correction (if needed)

        Args:
            img: PIL Image object

        Returns:
            Preprocessed image
        """
        from PIL import ImageEnhance

        # Enhance contrast for better text recognition
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.5)

        # For very small images, upscale before OCR
        width, height = img.size
        if width < 1000 or height < 1000:
            scale_factor = max(1000 / width, 1000 / height)
            new_size = (int(width * scale_factor), int(height * scale_factor))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            logger.debug(f"Upscaled image to {new_size} for better OCR")

        return img

    def validate(self, file_bytes: bytes) -> bool:
        """
        Validate image file using magic bytes.

        Args:
            file_bytes: Raw file bytes

        Returns:
            True if file is a valid image
        """
        if not file_bytes or len(file_bytes) < 8:
            return False

        # Check magic bytes for common image formats
        magic_signatures = {
            b'\xff\xd8\xff': 'JPEG',
            b'\x89PNG\r\n\x1a\n': 'PNG',
            b'GIF87a': 'GIF',
            b'GIF89a': 'GIF',
            b'BM': 'BMP',
            b'II*\x00': 'TIFF (little-endian)',
            b'MM\x00*': 'TIFF (big-endian)',
            b'RIFF': 'WebP (potentially)',
        }

        for signature in magic_signatures.keys():
            if file_bytes.startswith(signature):
                return True

        return False

    def get_magic_bytes(self) -> Optional[bytes]:
        """Common image magic bytes (JPEG)."""
        return b'\xff\xd8\xff'

    def get_metadata(self, file_bytes: bytes) -> dict:
        """
        Extract image metadata (dimensions, format, etc.).

        Args:
            file_bytes: Raw image bytes

        Returns:
            Dictionary with image metadata
        """
        if not OCR_AVAILABLE:
            return {}

        try:
            img = Image.open(io.BytesIO(file_bytes))

            metadata = {
                'format': img.format,
                'mode': img.mode,
                'width': img.width,
                'height': img.height,
                'size_pixels': img.width * img.height,
            }

            # Extract EXIF data if available
            if hasattr(img, '_getexif') and img._getexif():
                exif = img._getexif()
                if exif:
                    # Common EXIF tags
                    exif_tags = {
                        271: 'Make',
                        272: 'Model',
                        306: 'DateTime',
                        36867: 'DateTimeOriginal',
                    }

                    for tag_id, tag_name in exif_tags.items():
                        if tag_id in exif:
                            metadata[f'exif_{tag_name.lower()}'] = str(exif[tag_id])

            return metadata

        except Exception as e:
            logger.debug(f"Failed to extract image metadata: {e}")
            return {}

    async def postprocess(self, text: str) -> str:
        """
        Postprocess OCR text.

        Cleans up common OCR artifacts and formatting issues.

        Args:
            text: Raw OCR text

        Returns:
            Cleaned text
        """
        # Remove excessive whitespace
        lines = [line.strip() for line in text.split('\n')]

        # Remove empty lines
        lines = [line for line in lines if line]

        # Remove lines that are just punctuation or special characters
        lines = [
            line for line in lines
            if len([c for c in line if c.isalnum()]) > len(line) * 0.3  # At least 30% alphanumeric
        ]

        return '\n'.join(lines)

    def estimate_processing_time(self, file_size: int) -> float:
        """
        Estimate image OCR processing time with EasyOCR.

        EasyOCR is faster with GPU, slower on CPU.
        Estimate: ~1-2 seconds per MB with GPU, ~3-5 seconds per MB with CPU.

        Args:
            file_size: File size in bytes

        Returns:
            Estimated time in seconds
        """
        from app.config import settings
        import torch

        mb = file_size / (1024 * 1024)

        # Check if GPU is available
        if settings.ENABLE_GPU_ACCELERATION and torch.cuda.is_available():
            # GPU: ~1.5 seconds per MB
            return mb * 1.5
        else:
            # CPU: ~4 seconds per MB
            return mb * 4.0
