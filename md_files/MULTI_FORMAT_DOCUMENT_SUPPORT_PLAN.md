# Multi-Format Document Support Implementation Plan

**Project:** Synapse RAG System
**Created:** 2025-10-05
**Status:** Planning Phase

---

## Executive Summary

This document outlines a comprehensive plan to expand Synapse's document processing capabilities from the current limited format support (PDF, DOCX, Images, Text, HTML) to a robust multi-format system supporting 20+ popular document types. The implementation includes:

1. **Extensible Document Processor Framework** - Plugin-based architecture for easy format addition
2. **Expanded Format Support** - Coverage of 98% of common business/technical documents
3. **Frontend Format Display** - Clear communication of supported formats to users
4. **Optimized Processing Pipeline** - Improved text extraction, validation, and error handling

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Target Document Formats](#2-target-document-formats)
3. [Architecture Design](#3-architecture-design)
4. [Implementation Plan](#4-implementation-plan)
5. [Library Selection](#5-library-selection)
6. [Frontend Changes](#6-frontend-changes)
7. [Performance Optimization](#7-performance-optimization)
8. [Testing Strategy](#8-testing-strategy)
9. [Rollout Plan](#9-rollout-plan)
10. [Success Metrics](#10-success-metrics)

---

## 1. Current State Analysis

### 1.1 Currently Supported Formats

| Format | Extension | Backend Support | Library | Status |
|--------|-----------|----------------|---------|--------|
| PDF | `.pdf` | ✅ Full | PyMuPDF, pdfplumber, pytesseract | Working |
| DOCX | `.docx` | ✅ Full | python-docx | Working |
| Images | `.jpg, .jpeg, .png, .gif` | ✅ OCR | pytesseract, Pillow | Working |
| Text | `.txt` | ✅ Native | Built-in | Working |
| HTML | `.html, .htm` | ✅ Full | BeautifulSoup | Working |

### 1.2 Current Architecture

```
file_service.py (upload, validation)
    ↓
processing_service.py (extraction orchestrator)
    ↓
content_type detection (_get_content_type_from_file)
    ↓
format-specific extraction methods:
    - _extract_pdf_text()
    - _extract_doc_text()
    - _extract_image_text()
    - _extract_html_text()
```

### 1.3 Current Limitations

1. **Hard-coded format detection** - No plugin system
2. **Limited format coverage** - Only 5 document families
3. **No spreadsheet/presentation support** - Missing XLSX, PPTX, CSV
4. **No markdown support** - Critical for developer workflows
5. **No archive support** - Can't extract from ZIP/RAR
6. **Frontend shows generic text** - "Supports PDFs, documents, images, and more"
7. **No format validation** - Users can upload unsupported formats

---

## 2. Target Document Formats

Based on market research (PDF at 98% adoption, Office formats dominant in enterprise), we'll support these formats:

### 2.1 Priority Tier 1 (Immediate - Weeks 1-2)

**Business Documents**
- ✅ PDF - `.pdf` (already supported)
- ✅ DOCX - `.docx` (already supported)
- 🆕 DOC - `.doc` (legacy Word)
- 🆕 RTF - `.rtf` (Rich Text Format)
- 🆕 ODT - `.odt` (OpenDocument Text)

**Spreadsheets**
- 🆕 XLSX - `.xlsx` (Excel)
- 🆕 XLS - `.xls` (legacy Excel)
- 🆕 CSV - `.csv` (Comma-separated values)
- 🆕 TSV - `.tsv` (Tab-separated values)
- 🆕 ODS - `.ods` (OpenDocument Spreadsheet)

**Presentations**
- 🆕 PPTX - `.pptx` (PowerPoint)
- 🆕 PPT - `.ppt` (legacy PowerPoint)
- 🆕 ODP - `.odp` (OpenDocument Presentation)

### 2.2 Priority Tier 2 (Follow-up - Weeks 3-4)

**Developer/Technical Formats**
- 🆕 Markdown - `.md, .markdown`
- 🆕 reStructuredText - `.rst`
- 🆕 JSON - `.json`
- 🆕 XML - `.xml`
- 🆕 YAML - `.yml, .yaml`
- ✅ HTML - `.html, .htm` (already supported)

**Rich Text Formats**
- 🆕 EPUB - `.epub` (eBook)
- 🆕 LaTeX - `.tex`

### 2.3 Priority Tier 3 (Future - Month 2+)

**Archive Formats** (Extract and process contents)
- 🆕 ZIP - `.zip`
- 🆕 TAR/GZ - `.tar, .tar.gz, .tgz`
- 🆕 RAR - `.rar`

**Code Documentation**
- 🆕 AsciiDoc - `.adoc, .asciidoc`
- 🆕 Jupyter Notebooks - `.ipynb`

**Other**
- ✅ Images - `.jpg, .jpeg, .png, .gif, .bmp, .tiff, .webp` (expand current)
- 🆕 Audio Transcription - `.mp3, .wav, .m4a` (via Whisper API)
- 🆕 Video Transcription - `.mp4, .mov, .avi` (via Whisper API)

### 2.4 Format Coverage Statistics

After full implementation:
- **Total formats supported:** 35+
- **Coverage of business documents:** 98%+ (based on PDF/Office dominance)
- **Coverage of developer workflows:** 95%+ (markdown, code, JSON, etc.)
- **Enterprise compatibility:** Full (all MS Office + OpenDocument formats)

---

## 3. Architecture Design

### 3.1 New Document Processor Framework

We'll implement a **Strategy Pattern + Factory Pattern** hybrid to support extensible document processing:

```python
# New file: backend/app/services/document_processors/base.py

from abc import ABC, abstractmethod
from typing import Optional, List
from enum import Enum

class DocumentFormat(Enum):
    """Enumeration of all supported document formats."""
    # Documents
    PDF = "pdf"
    DOCX = "docx"
    DOC = "doc"
    RTF = "rtf"
    ODT = "odt"

    # Spreadsheets
    XLSX = "xlsx"
    XLS = "xls"
    CSV = "csv"
    TSV = "tsv"
    ODS = "ods"

    # Presentations
    PPTX = "pptx"
    PPT = "ppt"
    ODP = "odp"

    # Technical/Developer
    MARKDOWN = "markdown"
    RST = "rst"
    JSON = "json"
    XML = "xml"
    YAML = "yaml"
    HTML = "html"

    # Rich Text
    EPUB = "epub"
    LATEX = "latex"

    # Media
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"

    # Text
    TEXT = "text"

    # Archives
    ZIP = "zip"
    TAR = "tar"
    RAR = "rar"


class DocumentProcessor(ABC):
    """
    Abstract base class for document processors.

    Each processor handles text extraction for a specific format family.
    """

    @property
    @abstractmethod
    def supported_extensions(self) -> List[str]:
        """Return list of file extensions this processor handles."""
        pass

    @property
    @abstractmethod
    def format_name(self) -> str:
        """Human-readable format name for display."""
        pass

    @property
    @abstractmethod
    def requires_library(self) -> Optional[str]:
        """Python library required for this processor (None if built-in)."""
        pass

    @abstractmethod
    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """
        Extract text from document bytes.

        Args:
            file_bytes: Raw document bytes
            filename: Original filename (for format hints)

        Returns:
            Extracted text content

        Raises:
            ProcessingError: If extraction fails
        """
        pass

    @abstractmethod
    def validate(self, file_bytes: bytes) -> bool:
        """
        Validate that file bytes match this format.

        Returns:
            True if file is valid for this processor
        """
        pass

    def get_metadata(self, file_bytes: bytes) -> dict:
        """
        Extract metadata from document (optional).

        Returns:
            Dictionary with metadata (pages, author, etc.)
        """
        return {}


# New file: backend/app/services/document_processors/factory.py

class DocumentProcessorFactory:
    """Factory for creating document processors."""

    _processors = {}  # Registry of processor instances

    @classmethod
    def register(cls, processor_class: type):
        """Register a document processor class."""
        processor = processor_class()
        for ext in processor.supported_extensions:
            cls._processors[ext.lower()] = processor

    @classmethod
    def get_processor(cls, filename: str) -> Optional[DocumentProcessor]:
        """Get appropriate processor for a file."""
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        return cls._processors.get(ext)

    @classmethod
    def get_all_supported_extensions(cls) -> List[str]:
        """Get list of all supported file extensions."""
        return sorted(list(cls._processors.keys()))

    @classmethod
    def get_format_display_info(cls) -> dict:
        """
        Get formatted information about supported formats for frontend display.

        Returns:
            {
                "categories": {
                    "Documents": ["PDF", "DOCX", "DOC", ...],
                    "Spreadsheets": ["XLSX", "CSV", ...],
                    ...
                },
                "extensions": [".pdf", ".docx", ...],
                "accept_string": ".pdf,.docx,.xlsx,..."  # For HTML accept attribute
            }
        """
        pass
```

### 3.2 Processor Implementation Example

```python
# New file: backend/app/services/document_processors/spreadsheet_processor.py

import io
from typing import List
import openpyxl
import csv

class SpreadsheetProcessor(DocumentProcessor):
    """Processor for Excel and CSV files."""

    @property
    def supported_extensions(self) -> List[str]:
        return ['xlsx', 'xls', 'csv', 'tsv', 'ods']

    @property
    def format_name(self) -> str:
        return "Spreadsheet"

    @property
    def requires_library(self) -> Optional[str]:
        return "openpyxl>=3.1.0"

    async def extract_text(self, file_bytes: bytes, filename: str) -> str:
        """Extract text from spreadsheet by converting cells to readable format."""
        ext = filename.rsplit('.', 1)[-1].lower()

        if ext in ['csv', 'tsv']:
            return self._extract_csv(file_bytes, delimiter=',' if ext == 'csv' else '\t')
        elif ext in ['xlsx', 'xls']:
            return self._extract_excel(file_bytes)
        elif ext == 'ods':
            return self._extract_ods(file_bytes)

    def _extract_excel(self, file_bytes: bytes) -> str:
        """Extract text from Excel workbook."""
        workbook = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)

        text_parts = []
        for sheet_name in workbook.sheetnames:
            sheet = workbook[sheet_name]
            text_parts.append(f"=== Sheet: {sheet_name} ===\n")

            for row in sheet.iter_rows(values_only=True):
                row_text = ' | '.join(str(cell) if cell is not None else '' for cell in row)
                if row_text.strip():
                    text_parts.append(row_text)

        return '\n'.join(text_parts)

    def _extract_csv(self, file_bytes: bytes, delimiter: str = ',') -> str:
        """Extract text from CSV file."""
        text = file_bytes.decode('utf-8', errors='replace')
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)

        rows = []
        for row in reader:
            rows.append(' | '.join(row))

        return '\n'.join(rows)

    def validate(self, file_bytes: bytes) -> bool:
        """Validate spreadsheet file."""
        # Check magic bytes or try to parse
        try:
            # ZIP signature for XLSX (50 4B 03 04)
            if file_bytes[:4] == b'PK\x03\x04':
                return True
            # CSV/TSV are plain text
            file_bytes[:1000].decode('utf-8')
            return True
        except:
            return False
```

### 3.3 Integration with Processing Service

```python
# Modified: backend/app/services/processing_service.py

from app.services.document_processors.factory import DocumentProcessorFactory

class ProcessingService:

    async def _extract_text_content(self, item: KnowledgeItem) -> Optional[str]:
        """
        Extract text using new processor framework.

        Falls back to legacy methods for backward compatibility.
        """
        # Try new framework first
        if item.item_metadata and 'original_filename' in item.item_metadata:
            filename = item.item_metadata['original_filename']
            processor = DocumentProcessorFactory.get_processor(filename)

            if processor:
                try:
                    file_bytes = await self._get_file_bytes(item, storage_service)
                    if file_bytes:
                        text = await processor.extract_text(file_bytes, filename)
                        return self.sanitize_text_for_postgres(text)
                except Exception as e:
                    logger.warning(f"Processor failed for {filename}, trying legacy: {e}")

        # Fall back to legacy methods
        return await self._extract_text_content_legacy(item)
```

### 3.4 Directory Structure

```
backend/app/services/document_processors/
├── __init__.py                 # Auto-register all processors
├── base.py                     # Base classes and interfaces
├── factory.py                  # Processor factory and registry
├── pdf_processor.py            # PDF handling (migrated from processing_service)
├── word_processor.py           # DOC, DOCX, RTF, ODT
├── spreadsheet_processor.py    # XLSX, XLS, CSV, TSV, ODS
├── presentation_processor.py   # PPTX, PPT, ODP
├── markup_processor.py         # Markdown, RST, HTML
├── data_processor.py           # JSON, XML, YAML
├── image_processor.py          # Image OCR (migrated)
├── media_processor.py          # Audio/Video transcription
├── archive_processor.py        # ZIP, TAR, RAR
└── text_processor.py           # Plain text (fallback)
```

---

## 4. Implementation Plan

### Phase 1: Framework Foundation (Week 1)

**Tasks:**
1. Create base processor classes (`base.py`, `factory.py`)
2. Migrate existing PDF processor to new framework
3. Migrate existing DOCX processor
4. Migrate existing Image processor
5. Add processor auto-registration system
6. Update `processing_service.py` to use factory
7. Add comprehensive unit tests for framework

**Deliverables:**
- ✅ Framework functional with 3 migrated processors
- ✅ All existing formats still work
- ✅ 90%+ test coverage on framework code

### Phase 2: Tier 1 Formats - Business Documents (Week 2)

**Tasks:**
1. Implement `WordProcessor` (DOC, RTF, ODT)
2. Implement `SpreadsheetProcessor` (XLSX, XLS, CSV, TSV, ODS)
3. Implement `PresentationProcessor` (PPTX, PPT, ODP)
4. Add validation methods for each format
5. Update frontend to show new formats
6. Add integration tests with real documents

**Deliverables:**
- ✅ 13 new formats supported
- ✅ Frontend displays all supported formats
- ✅ Format validation working

### Phase 3: Tier 2 Formats - Developer/Technical (Week 3)

**Tasks:**
1. Implement `MarkupProcessor` (Markdown, RST, HTML)
2. Implement `DataProcessor` (JSON, XML, YAML)
3. Implement `RichTextProcessor` (EPUB, LaTeX)
4. Add metadata extraction
5. Add format-specific optimizations

**Deliverables:**
- ✅ 8 new technical formats supported
- ✅ Enhanced metadata extraction
- ✅ Developer documentation updated

### Phase 4: Tier 3 Formats - Media & Archives (Week 4)

**Tasks:**
1. Implement `MediaProcessor` (Audio/Video with Whisper API)
2. Implement `ArchiveProcessor` (ZIP, TAR, RAR)
3. Add async processing for large media files
4. Implement progress tracking for transcription
5. Add cost estimation for AI transcription

**Deliverables:**
- ✅ Media transcription working
- ✅ Archive extraction working
- ✅ Cost controls in place for AI features

### Phase 5: Optimization & Polish (Week 5)

**Tasks:**
1. Performance profiling and optimization
2. Add format-specific caching
3. Implement smart format detection (beyond extensions)
4. Add batch processing optimization
5. Frontend polish and UX improvements
6. Documentation and user guides

**Deliverables:**
- ✅ 50%+ faster processing for large documents
- ✅ Smart format detection
- ✅ Complete documentation

---

## 5. Library Selection

### 5.1 Required New Dependencies

Add to `requirements.txt`:

```python
# Spreadsheets
openpyxl==3.1.2              # Modern Excel (XLSX)
xlrd==2.0.1                  # Legacy Excel (XLS) - read only
odfpy==1.4.1                 # OpenDocument formats (ODS, ODT, ODP)

# Presentations
python-pptx==0.6.23          # PowerPoint (PPTX)

# Legacy Office formats
antiword==0.0.1              # Legacy Word (DOC) - requires system antiword
pypandoc==1.13               # Universal converter (DOC, RTF via pandoc)

# Markup & Data formats
markdown==3.5.2              # Markdown parsing
docutils==0.20.1             # reStructuredText
lxml==5.1.0                  # XML/HTML parsing (fast)
PyYAML==6.0.1                # YAML parsing
toml==0.10.2                 # TOML parsing

# Rich text
ebooklib==0.18               # EPUB processing
pylatex==1.4.2               # LaTeX parsing

# Archives
py7zr==0.21.0                # 7z and additional archive support
rarfile==4.1                 # RAR archives (requires system unrar)

# Media transcription (optional - high cost)
openai-whisper==20231117     # Audio/video transcription
ffmpeg-python==0.2.0         # Media file handling
```

### 5.2 System Dependencies

Required system packages (add to deployment):

```bash
# Ubuntu/Debian
apt-get install -y \
    antiword \
    pandoc \
    tesseract-ocr \
    ffmpeg \
    unrar

# macOS
brew install antiword pandoc tesseract ffmpeg unrar
```

### 5.3 Optional vs Required

**Always Install:**
- `openpyxl`, `python-pptx`, `odfpy` - Core business formats
- `markdown`, `PyYAML`, `lxml` - Common technical formats

**Optional (user can enable):**
- `openai-whisper` - Expensive, requires API costs
- `rarfile` - RAR is proprietary, limited use

### 5.4 Graceful Degradation

Each processor checks for library availability:

```python
def __init__(self):
    self.available = self._check_dependencies()

def _check_dependencies(self) -> bool:
    try:
        import openpyxl
        return True
    except ImportError:
        logger.warning("openpyxl not installed, XLSX support disabled")
        return False
```

---

## 6. Frontend Changes

### 6.1 Update File Upload Components

**File: `frontend/src/components/knowledge/FileUpload.tsx`**

**Current (line 305):**
```tsx
accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp3,.wav,.m4a"
```

**New:**
```tsx
accept=".pdf,.doc,.docx,.rtf,.odt,.xlsx,.xls,.csv,.tsv,.ods,.pptx,.ppt,.odp,.md,.markdown,.rst,.json,.xml,.yml,.yaml,.html,.htm,.txt,.epub,.tex,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.webp,.zip,.tar,.gz,.mp3,.wav,.m4a,.mp4,.mov"
```

**File: `frontend/src/components/knowledge/UploadDialog.tsx`**

Update line 388 similarly.

### 6.2 Add Supported Formats Display

Create new component to show supported formats:

**File: `frontend/src/components/knowledge/SupportedFormats.tsx`**

```tsx
import { FileText, Sheet, Presentation, Code, Image, Archive, Music, Video } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

export function SupportedFormats() {
  const formats = {
    "Documents": {
      icon: FileText,
      formats: ["PDF", "DOCX", "DOC", "RTF", "ODT", "TXT"],
      color: "text-blue-400"
    },
    "Spreadsheets": {
      icon: Sheet,
      formats: ["XLSX", "XLS", "CSV", "TSV", "ODS"],
      color: "text-green-400"
    },
    "Presentations": {
      icon: Presentation,
      formats: ["PPTX", "PPT", "ODP"],
      color: "text-orange-400"
    },
    "Technical": {
      icon: Code,
      formats: ["Markdown", "JSON", "XML", "YAML", "HTML"],
      color: "text-purple-400"
    },
    "Images": {
      icon: Image,
      formats: ["JPG", "PNG", "GIF", "BMP", "TIFF", "WebP"],
      color: "text-pink-400"
    },
    "Archives": {
      icon: Archive,
      formats: ["ZIP", "TAR", "GZ"],
      color: "text-yellow-400"
    },
    "Media": {
      icon: Music,
      formats: ["MP3", "WAV", "M4A", "MP4", "MOV"],
      color: "text-red-400"
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-xs text-gray-400 hover:text-gray-300 underline">
          View all supported formats (35+)
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 bg-slate-900 border-slate-700">
        <div className="space-y-3">
          <h4 className="font-semibold text-white">Supported File Formats</h4>
          <div className="grid gap-2">
            {Object.entries(formats).map(([category, { icon: Icon, formats: fmts, color }]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${color}`} />
                  <span className="text-sm font-medium text-gray-300">{category}</span>
                </div>
                <div className="flex flex-wrap gap-1 pl-6">
                  {fmts.map(fmt => (
                    <Badge key={fmt} variant="secondary" className="text-xs">
                      {fmt}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

### 6.3 Update Upload Zone Text

**Current (line 294-296 in FileUpload.tsx):**
```tsx
<p className="text-sm text-gray-300">
  Drag and drop files here, or click to select files
</p>
<p className="text-xs text-gray-400 mt-1">
  Supports images, PDFs, documents, and more
</p>
```

**New:**
```tsx
<p className="text-sm text-gray-300">
  Drag and drop files here, or click to select files
</p>
<div className="flex flex-col items-center gap-1 mt-2">
  <p className="text-xs text-gray-400">
    PDF • Office • Spreadsheets • Images • Code • Archives
  </p>
  <SupportedFormats />
</div>
```

### 6.4 API Endpoint for Format Info

**New endpoint:** `GET /api/v1/files/supported-formats`

```python
@router.get("/supported-formats")
async def get_supported_formats():
    """Get information about all supported file formats."""
    from app.services.document_processors.factory import DocumentProcessorFactory

    return DocumentProcessorFactory.get_format_display_info()
```

Frontend can fetch this dynamically to stay in sync with backend.

---

## 7. Performance Optimization

### 7.1 Format-Specific Optimizations

**PDF Processing:**
- ✅ Already optimized with PyMuPDF + fallback
- Add page limit for very large PDFs (500+ pages)
- Cache extracted text for re-processing

**Spreadsheet Processing:**
- Limit rows processed (first 10,000 rows for huge sheets)
- Smart column detection (ignore empty columns)
- Summary extraction for data tables

**Archive Processing:**
- Stream extraction (don't load entire archive in memory)
- Size limits per extracted file
- Recursive depth limit (prevent zip bombs)

**Media Processing:**
- Async queue for transcription jobs
- Cost estimation before processing
- Chunk-based processing for long media

### 7.2 Parallel Processing

```python
async def process_multiple_files(files: List[File]) -> List[ProcessingResult]:
    """Process multiple files in parallel."""
    import asyncio

    # Process up to 5 files concurrently
    semaphore = asyncio.Semaphore(5)

    async def process_with_limit(file):
        async with semaphore:
            return await process_single_file(file)

    results = await asyncio.gather(*[process_with_limit(f) for f in files])
    return results
```

### 7.3 Caching Strategy

**Cache extracted text:**
```python
# Add to processing_service.py
async def _get_cached_extraction(self, file_hash: str) -> Optional[str]:
    """Check if we've already extracted this file."""
    cache_key = f"extraction:{file_hash}"
    # Check Redis cache
    cached = await redis.get(cache_key)
    if cached:
        return cached.decode('utf-8')
    return None

async def _cache_extraction(self, file_hash: str, text: str):
    """Cache extracted text for 24 hours."""
    cache_key = f"extraction:{file_hash}"
    await redis.setex(cache_key, 86400, text.encode('utf-8'))
```

### 7.4 Smart Format Detection

Use magic bytes instead of relying only on extensions:

```python
def detect_format_by_magic_bytes(file_bytes: bytes) -> Optional[str]:
    """Detect format using file signature (magic bytes)."""
    signatures = {
        b'%PDF': 'pdf',
        b'PK\x03\x04': 'zip_based',  # ZIP, DOCX, XLSX, PPTX, ODT, etc.
        b'\xff\xd8\xff': 'jpeg',
        b'\x89PNG': 'png',
        b'GIF8': 'gif',
        b'RIFF': 'wav_or_avi',
    }

    for signature, format_type in signatures.items():
        if file_bytes.startswith(signature):
            return format_type
    return None
```

---

## 8. Testing Strategy

### 8.1 Test Document Library

Create test files for each format:

```
backend/tests/fixtures/documents/
├── sample.pdf
├── sample.docx
├── sample.doc
├── sample.rtf
├── sample.odt
├── sample.xlsx
├── sample.xls
├── sample.csv
├── sample.pptx
├── sample.md
├── sample.json
├── sample.xml
├── sample.zip
└── ...
```

### 8.2 Unit Tests

```python
# backend/tests/services/document_processors/test_spreadsheet_processor.py

import pytest
from app.services.document_processors.spreadsheet_processor import SpreadsheetProcessor

@pytest.fixture
def processor():
    return SpreadsheetProcessor()

@pytest.fixture
def sample_xlsx():
    with open('tests/fixtures/documents/sample.xlsx', 'rb') as f:
        return f.read()

async def test_extract_excel_text(processor, sample_xlsx):
    text = await processor.extract_text(sample_xlsx, 'test.xlsx')

    assert text is not None
    assert len(text) > 0
    assert 'Sheet:' in text
    assert '|' in text  # Cell separator

def test_validate_excel(processor, sample_xlsx):
    assert processor.validate(sample_xlsx) is True

def test_supported_extensions(processor):
    exts = processor.supported_extensions
    assert 'xlsx' in exts
    assert 'csv' in exts
```

### 8.3 Integration Tests

```python
# backend/tests/integration/test_document_processing.py

@pytest.mark.asyncio
async def test_upload_and_process_xlsx(client, auth_headers, test_folder):
    """Test full flow: upload XLSX -> process -> search."""

    # Upload
    with open('tests/fixtures/documents/sample.xlsx', 'rb') as f:
        response = await client.post(
            '/api/v1/files/upload',
            headers=auth_headers,
            data={
                'folder_id': str(test_folder.id),
                'title': 'Test Spreadsheet',
            },
            files={'file': ('test.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        )

    assert response.status_code == 200
    item_id = response.json()['item']['id']

    # Wait for background processing
    await asyncio.sleep(2)

    # Check processing status
    status_response = await client.get(
        f'/api/v1/files/status/{item_id}',
        headers=auth_headers
    )
    assert status_response.json()['processing_status'] == 'completed'

    # Search for content
    search_response = await client.post(
        '/api/v1/search',
        headers=auth_headers,
        json={'query': 'spreadsheet data', 'folder_id': str(test_folder.id)}
    )
    assert len(search_response.json()['results']) > 0
```

### 8.4 Performance Tests

```python
@pytest.mark.performance
async def test_large_file_processing_time(processor):
    """Ensure large files process within acceptable time."""
    import time

    # 50MB test file
    large_file = generate_large_test_xlsx(rows=100000)

    start = time.time()
    text = await processor.extract_text(large_file, 'large.xlsx')
    duration = time.time() - start

    assert duration < 30.0  # Must process in under 30 seconds
    assert len(text) > 0
```

### 8.5 Error Handling Tests

```python
async def test_corrupted_file_handling(processor):
    """Ensure corrupted files don't crash the system."""
    corrupted_bytes = b'\x00\xFF\x00\xFF' * 1000

    with pytest.raises(ProcessingError):
        await processor.extract_text(corrupted_bytes, 'corrupted.xlsx')

async def test_malicious_zip_bomb(archive_processor):
    """Ensure zip bombs are detected and rejected."""
    # 42KB file that expands to 4.5GB
    zip_bomb = load_zip_bomb_test_file()

    with pytest.raises(SecurityError, match="potential zip bomb"):
        await archive_processor.extract_text(zip_bomb, 'bomb.zip')
```

---

## 9. Rollout Plan

### 9.1 Development Phase (Weeks 1-5)

✅ Complete all implementation phases
✅ Pass all unit and integration tests
✅ Performance benchmarks met
✅ Documentation complete

### 9.2 Staging Deployment (Week 6)

📋 Deploy to staging environment
📋 Internal testing with real documents
📋 Load testing with 1000+ documents
📋 Security audit (especially for archives)
📋 Fix any issues found

### 9.3 Beta Release (Week 7)

📋 Enable for subset of users (10%)
📋 Collect feedback and usage metrics
📋 Monitor error rates and performance
📋 A/B test frontend format display

### 9.4 Production Rollout (Week 8)

📋 Gradual rollout to all users (25% -> 50% -> 100%)
📋 Monitor system resources and costs
📋 Update user documentation
📋 Announce new features

### 9.5 Post-Launch (Week 9+)

📋 Collect user feedback
📋 Add most-requested formats
📋 Optimize based on usage patterns
📋 Consider premium features (AI transcription)

---

## 10. Success Metrics

### 10.1 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Formats supported | 35+ | Count of registered processors |
| Processing success rate | >95% | (successful / total) * 100 |
| Average processing time | <30s per file | P95 latency |
| Large file support | Up to 5GB | Max tested file size |
| Test coverage | >85% | pytest-cov |
| Error rate | <2% | Failed uploads / total uploads |

### 10.2 User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Upload success rate | >98% | Completed uploads / attempted |
| Format confusion | <5% | "Unsupported format" errors |
| Time to first chunk | <10s | Upload -> first searchable chunk |
| User satisfaction | >4.0/5.0 | Post-feature survey |

### 10.3 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Format usage diversity | >15 formats | Unique formats uploaded |
| New format adoption | >50% users | Users trying new formats |
| Support tickets | <5/week | Format-related support tickets |
| Enterprise adoption | +20% | Enterprise plan conversions |

---

## Appendix A: File Format Reference

### Format Support Matrix

| Format | Extension | Library | Priority | Complexity | Notes |
|--------|-----------|---------|----------|----------|-------|
| PDF | .pdf | PyMuPDF | ✅ P1 | High | Already implemented |
| DOCX | .docx | python-docx | ✅ P1 | Medium | Already implemented |
| DOC | .doc | pypandoc | 🆕 P1 | Medium | Requires pandoc system dependency |
| RTF | .rtf | striprtf | 🆕 P1 | Low | Simple text format |
| ODT | .odt | odfpy | 🆕 P1 | Medium | OpenDocument text |
| XLSX | .xlsx | openpyxl | 🆕 P1 | Medium | Modern Excel |
| XLS | .xls | xlrd | 🆕 P1 | Medium | Legacy Excel |
| CSV | .csv | Built-in | 🆕 P1 | Low | Native Python support |
| TSV | .tsv | Built-in | 🆕 P1 | Low | Tab-separated values |
| ODS | .ods | odfpy | 🆕 P1 | Medium | OpenDocument spreadsheet |
| PPTX | .pptx | python-pptx | 🆕 P1 | Medium | PowerPoint |
| PPT | .ppt | pypandoc | 🆕 P1 | High | Legacy PowerPoint |
| ODP | .odp | odfpy | 🆕 P1 | Medium | OpenDocument presentation |
| Markdown | .md | markdown | 🆕 P2 | Low | Developer favorite |
| RST | .rst | docutils | 🆕 P2 | Low | Python docs standard |
| JSON | .json | Built-in | 🆕 P2 | Low | Native support |
| XML | .xml | lxml | 🆕 P2 | Medium | Fast XML parsing |
| YAML | .yml/.yaml | PyYAML | 🆕 P2 | Low | Config files |
| HTML | .html | BeautifulSoup | ✅ P2 | Low | Already implemented |
| EPUB | .epub | ebooklib | 🆕 P2 | Medium | eBook format |
| LaTeX | .tex | pylatex | 🆕 P2 | High | Academic documents |
| ZIP | .zip | zipfile | 🆕 P3 | Medium | Built-in, security concerns |
| TAR/GZ | .tar/.tgz | tarfile | 🆕 P3 | Medium | Built-in |
| RAR | .rar | rarfile | 🆕 P3 | Medium | Requires system unrar |
| Images | .jpg/.png/etc | PIL + pytesseract | ✅ P1 | High | Already implemented with OCR |
| Audio | .mp3/.wav | openai-whisper | 🆕 P3 | Very High | High cost, optional |
| Video | .mp4/.mov | ffmpeg + whisper | 🆕 P3 | Very High | High cost, optional |

---

## Appendix B: Cost Estimates

### Development Costs

- **Developer time:** 5 weeks @ 40 hrs/week = 200 hours
- **Testing:** 1 week @ 40 hrs = 40 hours
- **Code review & polish:** 1 week @ 20 hrs = 20 hours
- **Total:** ~260 hours

### Infrastructure Costs

**New dependencies size:**
- Additional Python packages: ~150MB
- System dependencies: ~50MB
- **Total storage increase:** ~200MB

**Processing costs (monthly estimates):**
- Spreadsheet processing: Negligible (CPU-only)
- Document conversion: <$10/month (CPU)
- Media transcription: $0.006/minute (Whisper API)
  - 1000 hours audio = ~$360/month
  - Make this opt-in/premium feature

### Cost Optimization

1. **Cache aggressively** - Avoid re-processing
2. **Limit media transcription** - Require premium tier or pay-per-use
3. **Batch processing** - Process during off-peak hours
4. **Smart sampling** - For huge spreadsheets, process first N rows

---

## Appendix C: Security Considerations

### 1. Archive Bomb Prevention

```python
MAX_ARCHIVE_SIZE = 5 * 1024 * 1024 * 1024  # 5GB uncompressed
MAX_COMPRESSION_RATIO = 100  # Reject if ratio > 100:1
MAX_FILES_IN_ARCHIVE = 10000

def validate_archive_safety(archive_bytes: bytes) -> bool:
    """Prevent zip bombs and resource exhaustion."""
    compressed_size = len(archive_bytes)

    # Quick check: peek at uncompressed size
    uncompressed_size = get_archive_uncompressed_size(archive_bytes)

    if uncompressed_size > MAX_ARCHIVE_SIZE:
        raise SecurityError("Archive too large when uncompressed")

    ratio = uncompressed_size / compressed_size
    if ratio > MAX_COMPRESSION_RATIO:
        raise SecurityError("Suspicious compression ratio - potential zip bomb")

    return True
```

### 2. File Type Validation

```python
def validate_file_type(file_bytes: bytes, claimed_extension: str) -> bool:
    """Ensure file content matches claimed type."""
    detected_type = detect_format_by_magic_bytes(file_bytes)
    expected_type = extension_to_magic_type(claimed_extension)

    if detected_type != expected_type:
        raise SecurityError(f"File type mismatch: claimed {claimed_extension}, detected {detected_type}")

    return True
```

### 3. Malicious Content Detection

```python
BLOCKED_PATTERNS = [
    b'<script',  # JavaScript in documents
    b'<?php',    # PHP code
    b'exec(',    # Code execution
]

def scan_for_malicious_content(text: str) -> bool:
    """Basic scan for suspicious patterns."""
    for pattern in BLOCKED_PATTERNS:
        if pattern in text.lower().encode():
            logger.warning(f"Blocked malicious pattern: {pattern}")
            return False
    return True
```

### 4. Resource Limits

```python
# Per-format resource limits
LIMITS = {
    'spreadsheet': {
        'max_rows': 100000,
        'max_cells': 1000000,
        'timeout': 60,  # seconds
    },
    'pdf': {
        'max_pages': 5000,
        'timeout': 120,
    },
    'archive': {
        'max_files': 10000,
        'max_depth': 5,  # recursion depth
        'timeout': 300,
    }
}
```

---

## Conclusion

This implementation plan provides a comprehensive roadmap for expanding Synapse's document processing capabilities from 5 to 35+ formats. The plugin-based architecture ensures:

✅ **Extensibility** - Easy to add new formats
✅ **Maintainability** - Each processor is isolated
✅ **Performance** - Format-specific optimizations
✅ **User Experience** - Clear format communication
✅ **Security** - Robust validation and limits

**Estimated Timeline:** 8 weeks from start to full production rollout
**Estimated Effort:** 260 development hours
**Risk Level:** Medium (complexity in legacy formats and security)
**Business Impact:** High (enterprise adoption, user satisfaction)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-05
**Author:** Claude Code
**Status:** Ready for Review & Approval
