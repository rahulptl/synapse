"""
Image document processor.

Handles image files with OCR (Optical Character Recognition) to extract text.
Supports common image formats: JPG, PNG, GIF, BMP, TIFF, WebP.
"""
from typing import List, Optional
import io
import logging

from .base import DocumentProcessor, ProcessingError

logger = logging.getLogger(__name__)

# Silence noisy PIL logs
logging.getLogger('PIL').setLevel(logging.INFO)
logging.getLogger('pytesseract').setLevel(logging.INFO)

# Optional dependencies
try:
    import pytesseract
    from PIL import Image
    OCR_AVAILABLE = True
except ImportError:
    pytesseract = None
    Image = None
    OCR_AVAILABLE = False
    logger.warning("OCR not available - image text extraction disabled")


class ImageProcessor(DocumentProcessor):
    """
    Processor for image files.

    Uses Tesseract OCR to extract text from images.
    Supports preprocessing for better OCR accuracy.
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
        return "Image (OCR)"

    @property
    def format_category(self) -> str:
        """Format category."""
        return "Images"

    @property
    def requires_library(self) -> Optional[str]:
        """Required libraries."""
        return "pytesseract>=0.3.0, Pillow>=10.0.0"

    @property
    def requires_system_dependency(self) -> Optional[str]:
        """System dependency."""
        return "tesseract"

    def _check_dependencies(self) -> bool:
        """Check if OCR dependencies are available."""
        return OCR_AVAILABLE

    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from image using OCR.

        Supports: PNG, JPEG, JPG, GIF, BMP, TIFF, WebP

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
                "Image OCR requires pytesseract and Pillow. "
                "Install with: pip install pytesseract Pillow\n"
                "System dependency: brew install tesseract (macOS) or "
                "apt-get install tesseract-ocr (Ubuntu)"
            )

        if not file_bytes:
            raise ProcessingError("Empty image file")

        try:
            # Open image with PIL
            img = Image.open(io.BytesIO(file_bytes))

            # Convert to RGB if needed (for RGBA, grayscale, etc.)
            if img.mode not in ('RGB', 'L'):
                logger.debug(f"Converting image from {img.mode} to RGB")
                img = img.convert('RGB')

            # Preprocess for better OCR accuracy
            img = await self._preprocess_image(img)

            # Perform OCR
            text = pytesseract.image_to_string(img)

            if text.strip():
                logger.info(f"✅ OCR extracted {len(text)} chars from image {filename}")
                return text
            else:
                logger.warning(f"⚠️ No text found in image {filename}")
                return "[IMAGE OCR: No text detected in image]"

        except Exception as e:
            logger.error(f"Image OCR failed for {filename}: {e}", exc_info=True)
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
        Estimate image OCR processing time.

        OCR is relatively slow (~1MB per 2-3 seconds).

        Args:
            file_size: File size in bytes

        Returns:
            Estimated time in seconds
        """
        # OCR is slow: ~500KB per second
        return file_size / (500 * 1024)
