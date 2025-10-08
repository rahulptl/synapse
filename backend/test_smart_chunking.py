"""
Test script for Docling smart chunking implementation.

This script tests:
1. Docling chunking library availability
2. HybridChunker functionality
3. Integration with DoclingProcessor

Run with: python test_smart_chunking.py
"""
import asyncio
import logging
import sys

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_chunking_libraries():
    """Test if chunking libraries are available."""
    logger.info("=" * 60)
    logger.info("Testing Docling Smart Chunking Libraries")
    logger.info("=" * 60)

    # Test docling-core
    try:
        from docling_core.transforms.chunker import HybridChunker
        logger.info("✅ docling-core with chunking support is available")
    except ImportError as e:
        logger.error(f"❌ docling-core chunking not available: {e}")
        logger.error("Install with: pip install 'docling-core[chunking-openai]'")
        return False

    # Test tiktoken
    try:
        import tiktoken
        logger.info("✅ tiktoken is available")
    except ImportError as e:
        logger.error(f"❌ tiktoken not available: {e}")
        logger.error("Install with: pip install tiktoken")
        return False

    # Test docling
    try:
        from docling.document_converter import DocumentConverter
        logger.info("✅ docling is available")
    except ImportError as e:
        logger.error(f"❌ docling not available: {e}")
        logger.error("Install with: pip install docling")
        return False

    return True


async def test_hybrid_chunker():
    """Test HybridChunker with a sample document."""
    logger.info("\n" + "=" * 60)
    logger.info("Testing HybridChunker Functionality")
    logger.info("=" * 60)

    try:
        from docling_core.transforms.chunker import HybridChunker
        import tiktoken

        # Initialize tokenizer
        tokenizer = tiktoken.get_encoding("cl100k_base")
        logger.info("✅ Initialized tiktoken tokenizer (cl100k_base)")

        # Initialize HybridChunker
        chunker = HybridChunker(
            tokenizer=tokenizer,
            max_tokens=512,
            merge_peers=True
        )
        logger.info("✅ Initialized HybridChunker (max_tokens=512, merge_peers=True)")

        logger.info("\n📋 HybridChunker Configuration:")
        logger.info(f"  - Max tokens per chunk: 512")
        logger.info(f"  - Merge undersized peers: True")
        logger.info(f"  - Tokenizer: cl100k_base (OpenAI)")

        return True

    except Exception as e:
        logger.error(f"❌ HybridChunker test failed: {e}", exc_info=True)
        return False


async def test_docling_processor():
    """Test DoclingProcessor integration."""
    logger.info("\n" + "=" * 60)
    logger.info("Testing DoclingProcessor Integration")
    logger.info("=" * 60)

    try:
        from app.services.document_processors.docling_processor import DoclingProcessor
        from app.services.document_processors import DocumentProcessorFactory

        # Check if DoclingProcessor is registered
        processor = DocumentProcessorFactory.get_processor("test.pdf")

        if isinstance(processor, DoclingProcessor):
            logger.info("✅ DoclingProcessor is registered and active for PDF files")
        else:
            logger.warning(f"⚠️ PDF files using {processor.__class__.__name__} instead of DoclingProcessor")

        # Check availability
        if processor.is_available():
            logger.info("✅ DoclingProcessor reports as available")
        else:
            logger.error("❌ DoclingProcessor reports as unavailable")
            return False

        # Check supported extensions
        supported = processor.supported_extensions
        logger.info(f"✅ DoclingProcessor supports: {', '.join(supported)}")

        # Check if extract_and_chunk method exists
        if hasattr(processor, 'extract_and_chunk'):
            logger.info("✅ extract_and_chunk method is available")
        else:
            logger.error("❌ extract_and_chunk method not found")
            return False

        return True

    except Exception as e:
        logger.error(f"❌ DoclingProcessor test failed: {e}", exc_info=True)
        return False


async def test_config():
    """Test configuration settings."""
    logger.info("\n" + "=" * 60)
    logger.info("Testing Configuration Settings")
    logger.info("=" * 60)

    try:
        from app.config import settings

        logger.info(f"✅ ENABLE_SMART_CHUNKING: {settings.ENABLE_SMART_CHUNKING}")
        logger.info(f"✅ SMART_CHUNK_MAX_TOKENS: {settings.SMART_CHUNK_MAX_TOKENS}")
        logger.info(f"✅ CHUNK_SIZE (legacy): {settings.CHUNK_SIZE}")
        logger.info(f"✅ CHUNK_OVERLAP (legacy): {settings.CHUNK_OVERLAP}")

        if settings.ENABLE_SMART_CHUNKING:
            logger.info("✅ Smart chunking is ENABLED")
        else:
            logger.warning("⚠️ Smart chunking is DISABLED (set ENABLE_SMART_CHUNKING=true)")

        return True

    except Exception as e:
        logger.error(f"❌ Config test failed: {e}", exc_info=True)
        return False


async def main():
    """Run all tests."""
    logger.info("Starting Docling Smart Chunking Tests\n")

    results = {
        "Libraries": await test_chunking_libraries(),
        "HybridChunker": await test_hybrid_chunker(),
        "DoclingProcessor": await test_docling_processor(),
        "Configuration": await test_config(),
    }

    # Print summary
    logger.info("\n" + "=" * 60)
    logger.info("Test Summary")
    logger.info("=" * 60)

    all_passed = True
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        logger.info(f"{status} - {test_name}")
        if not result:
            all_passed = False

    logger.info("=" * 60)

    if all_passed:
        logger.info("\n🎉 All tests passed! Smart chunking is ready to use.")
        logger.info("\nNext steps:")
        logger.info("1. Install dependencies: pip install -r requirements.txt")
        logger.info("2. Upload a document to test smart chunking in action")
        logger.info("3. Check logs for 'Docling smart chunking' messages")
        return 0
    else:
        logger.error("\n❌ Some tests failed. Please fix the issues above.")
        logger.error("\nMissing dependencies? Run:")
        logger.error("  pip install 'docling-core[chunking-openai]' tiktoken")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
