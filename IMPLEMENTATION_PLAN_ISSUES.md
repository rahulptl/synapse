# Implementation Plan for Issues.txt

**Date:** October 5, 2025
**Project:** Synapse Knowledge Base
**Status:** Ready for Implementation

---

## Executive Summary

This document provides a detailed implementation plan for addressing 5 critical issues in the Synapse knowledge base system:

1. **Processing Status Display** - Items showing "not processable" despite successful processing
2. **File Size Limits** - 35MB+ files failing to upload
3. **Multi-Format Document Support** - Need for PPT, DOC, XLSX support
4. **Mobile UI Congestion** - Overcrowded mobile knowledge base view
5. **Desktop Upload Dialog** - Dialog stretching with large files

---

## Table of Contents

- [Current State Analysis](#current-state-analysis)
- [Issue 1: Processing Status Display](#issue-1-processing-status-display)
- [Issue 2: File Size Limits](#issue-2-file-size-limits)
- [Issue 3: Multi-Format Document Support](#issue-3-multi-format-document-support)
- [Issue 4: Mobile UI Improvements](#issue-4-mobile-ui-improvements)
- [Issue 5: Desktop Upload Dialog Fix](#issue-5-desktop-upload-dialog-fix)
- [Implementation Timeline](#implementation-timeline)
- [Testing Strategy](#testing-strategy)
- [Rollback Plan](#rollback-plan)

---

## Current State Analysis

### Database Schema (KnowledgeItem Model)
**File:** `backend/app/models/database.py:89-119`

```python
class KnowledgeItem(Base):
    id: UUID
    user_id: UUID
    folder_id: UUID
    title: str
    content: str
    content_type: str  # 'text', 'pdf', 'document', 'image', etc.
    source_url: Optional[str]
    processing_status: str  # 'pending', 'processing', 'completed', 'failed', 'partial'
    is_chunked: bool
    total_chunks: int
    item_metadata: dict
    created_at: datetime
    updated_at: datetime

    # Relationship
    vectors: List[Vector]  # One-to-many with Vector table
```

### Key Findings

1. ✅ **Processing status tracking exists** - `processing_status` field is already in database
2. ✅ **Chunk tracking exists** - `is_chunked` and `total_chunks` fields available
3. ✅ **Vector relationship exists** - Can check if embeddings are created
4. ⚠️ **Frontend display logic incomplete** - Status shows "not processable" incorrectly
5. ⚠️ **No status polling** - Frontend doesn't refresh status after upload
6. ⚠️ **Limited document format support** - Only PDF and DOCX currently supported
7. ⚠️ **Hardcoded file size limit** - 50MB limit in `file_service.py:70`

---

## Issue 1: Processing Status Display

### Problem Statement
Knowledge items show "not processable" in the UI even after successful backend processing and chunk creation. Users cannot determine if their uploaded content is searchable.

### Root Cause Analysis

**File:** `frontend/src/components/knowledge/ItemList.tsx:68-89`

```typescript
const getProcessingStatusText = (item: KnowledgeItem) => {
  // Check if item has been chunked/processed
  if (item.is_chunked && item.total_chunks && item.total_chunks > 0) {
    return `Searchable (${item.total_chunks} chunks)`;
  }

  switch (item.processing_status) {
    case 'processing': return 'Processing for search...';
    case 'completed': return item.total_chunks > 0 ? 'Searchable' : 'Processing incomplete';
    case 'failed': return 'Processing failed';
    case 'pending': return 'Pending processing';
    default: return 'Not yet searchable';  // ⚠️ This is the issue
  }
};
```

**Issues identified:**
1. No real-time status updates after upload
2. Frontend doesn't fetch fresh status from `/api/v1/files/status/{item_id}` endpoint
3. Initial folder content fetch may return stale data
4. Background processing completes but UI never refreshes

### Solution Design

#### 1.1 Add Status Polling Hook
**New File:** `frontend/src/hooks/useProcessingStatus.tsx`

```typescript
import { useState, useEffect } from 'react';
import { apiClient } from '@/services/apiClient';

export function useProcessingStatus(itemId: string, auth: any, initialStatus?: string) {
  const [status, setStatus] = useState(initialStatus || 'pending');
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    // Don't poll if already completed or failed
    if (status === 'completed' || status === 'failed') {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    const pollInterval = setInterval(async () => {
      try {
        const result = await apiClient.getProcessingStatus(itemId, auth);
        setStatus(result.processing_status);

        // Stop polling when done
        if (result.processing_status === 'completed' ||
            result.processing_status === 'failed') {
          setIsPolling(false);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [itemId, status, auth]);

  return { status, isPolling };
}
```

#### 1.2 Enhance Backend Status Endpoint
**File:** `backend/app/api/v1/endpoints/files.py:172-193`

**Current:** Returns basic status
**Enhancement:** Include chunk count and vector count

```python
@router.get("/status/{item_id}")
async def get_processing_status(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """Get detailed processing status for a knowledge item."""
    user_id = UUID(auth_data["user_id"])

    try:
        # Get item with vectors
        from sqlalchemy.orm import selectinload
        from sqlalchemy import select, func
        from app.models.database import KnowledgeItem, Vector

        stmt = select(KnowledgeItem).where(
            KnowledgeItem.id == item_id,
            KnowledgeItem.user_id == user_id
        ).options(selectinload(KnowledgeItem.vectors))

        result = await db.execute(stmt)
        item = result.scalar_one_or_none()

        if not item:
            raise ValueError("Knowledge item not found")

        # Count vectors with embeddings
        vector_count = len(item.vectors) if item.vectors else 0
        vectors_with_embeddings = sum(
            1 for v in item.vectors
            if v.embedding and len(v.embedding) > 0 and v.embedding != [0.0] * 1536
        ) if item.vectors else 0

        return {
            "knowledge_item_id": str(item.id),
            "processing_status": item.processing_status,
            "is_chunked": item.is_chunked,
            "total_chunks": item.total_chunks,
            "vector_count": vector_count,
            "vectors_with_embeddings": vectors_with_embeddings,
            "is_searchable": (
                item.processing_status == "completed" and
                item.is_chunked and
                vectors_with_embeddings > 0
            ),
            "content_type": item.content_type,
            "title": item.title,
            "created_at": item.created_at.isoformat(),
            "updated_at": item.updated_at.isoformat()
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to get status")
```

#### 1.3 Update Frontend API Client
**File:** `frontend/src/services/apiClient.ts`

```typescript
async getProcessingStatus(itemId: string, auth: { userId: string; accessToken: string }) {
  return this.request(`/files/status/${itemId}`, { auth });
}
```

#### 1.4 Update ItemList Component
**File:** `frontend/src/components/knowledge/ItemList.tsx:68-89`

**Changes:**
1. Use actual `is_searchable` flag from backend
2. Show real-time status updates
3. Display vector count vs chunk count for debugging

```typescript
const getProcessingStatusText = (item: KnowledgeItem) => {
  // Use the is_searchable flag if available from enhanced status
  if (item.is_searchable === true) {
    return `Searchable (${item.total_chunks} chunks)`;
  }

  // Fallback to checking chunks (backward compatible)
  if (item.is_chunked && item.total_chunks && item.total_chunks > 0) {
    // Check if vectors exist
    if (item.vector_count && item.vectors_with_embeddings) {
      if (item.vectors_with_embeddings === item.total_chunks) {
        return `Searchable (${item.total_chunks} chunks)`;
      } else {
        return `Processing embeddings (${item.vectors_with_embeddings}/${item.total_chunks})`;
      }
    }
    return `Searchable (${item.total_chunks} chunks)`;
  }

  // Check explicit status
  switch (item.processing_status) {
    case 'processing':
      return 'Processing for search...';
    case 'completed':
      return item.total_chunks > 0 ? 'Searchable' : 'Processing incomplete';
    case 'failed':
      return 'Processing failed - Click to retry';
    case 'pending':
      return 'Queued for processing...';
    default:
      return 'Processing...';  // More optimistic default
  }
};
```

#### 1.5 Add Auto-Refresh on Upload Complete
**File:** `frontend/src/components/knowledge/UploadDialog.tsx:154-166`

**Changes:**
1. Start polling status after successful upload
2. Refresh folder content when processing completes

```typescript
if (successCount > 0) {
  toast({
    title: "Uploaded",
    description: `${successCount} file(s) uploaded. Processing started...`,
  });

  // Start polling for processing status
  // This will trigger useProcessingStatus hook in parent
  onUploadComplete(); // Immediate refresh

  // Schedule another refresh after likely processing time
  setTimeout(() => {
    onUploadComplete();
  }, 10000); // Refresh again after 10 seconds

  setTimeout(() => {
    resetForm();
    setOpen(false);
  }, 1500);
}
```

### Implementation Steps

1. **Backend Enhancement** (1-2 hours)
   - [ ] Update `/files/status/{item_id}` endpoint with vector counting
   - [ ] Add `is_searchable` computed field
   - [ ] Test endpoint with various processing states

2. **Frontend Hook** (1 hour)
   - [ ] Create `useProcessingStatus` hook
   - [ ] Test polling behavior
   - [ ] Add cleanup on unmount

3. **Component Updates** (2 hours)
   - [ ] Update ItemList to use new status logic
   - [ ] Update MobileItemCard with same logic
   - [ ] Add loading indicators for polling state

4. **Testing** (2 hours)
   - [ ] Test with pending items
   - [ ] Test with processing items
   - [ ] Test with completed items
   - [ ] Test with failed items
   - [ ] Verify polling stops correctly

### Success Criteria

- ✅ Newly uploaded items show "Queued for processing..." initially
- ✅ Status updates to "Processing for search..." during processing
- ✅ Status updates to "Searchable (X chunks)" when complete
- ✅ No polling for already-completed items
- ✅ Failed items show "Processing failed - Click to retry"
- ✅ Mobile and desktop views show consistent status

---

## Issue 2: File Size Limits

### Problem Statement
Files larger than 35MB are not uploading. User reports the upload field is available but files fail to upload.

### Root Cause Analysis

**File:** `backend/app/services/file_service.py:70-72`

```python
# Check file size (use same limit as edge function)
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB limit
if file_size > MAX_FILE_SIZE:
    raise ValueError(f"File too large. Maximum size: 50MB")
```

**Additional limits to check:**
1. ⚠️ Nginx/reverse proxy limits (if using Cloud Run or nginx)
2. ⚠️ Frontend file input validation
3. ⚠️ Cloud Storage upload limits (should be ~5GB for GCS)
4. ⚠️ FastAPI request body size limit

### Investigation Required

#### 2.1 Check Nginx/Cloud Run Limits

**For Cloud Run:**
```bash
# Check current request size limit
gcloud run services describe synapse-backend --region=asia-south1 --format="value(spec.template.spec.containerConcurrency)"
```

**For local nginx:** Check `nginx.conf`:
```nginx
http {
    client_max_body_size 100M;  # Increase from default 1M
}
```

#### 2.2 Check FastAPI Limits

**File:** `backend/app/main.py`

Look for `max_request_size` or `client_max_size` configuration.

### Solution Design

#### 2.1 Remove/Increase Backend Limit
**File:** `backend/app/services/file_service.py:70-72`

```python
# Increase file size limit to 200MB (reasonable for most documents)
# Cloud Storage supports up to 5TB, so storage is not a concern
MAX_FILE_SIZE = 200 * 1024 * 1024  # 200MB limit

if file_size > MAX_FILE_SIZE:
    raise ValueError(
        f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB. "
        f"Your file is {file_size // (1024*1024)}MB."
    )

logger.info(f"Uploading file: {file.filename} ({file_size // (1024*1024)}MB)")
```

#### 2.2 Update Cloud Run Configuration
**File:** `backend/cloudbuild.yaml`

```yaml
# Ensure Cloud Run can handle large uploads
options:
  machineType: 'N1_HIGHCPU_8'

substitutions:
  _SERVICE_NAME: synapse-backend
  _REGION: asia-south1

# Add Cloud Run service settings
serviceConfiguration:
  timeoutSeconds: 300  # 5 minute timeout for large uploads
  maxRequestSize: 200M  # Allow 200MB requests
```

**OR update via gcloud:**
```bash
gcloud run services update synapse-backend \
  --region=asia-south1 \
  --timeout=300 \
  --max-instances=10
```

#### 2.3 Add Frontend Validation
**File:** `frontend/src/components/knowledge/UploadDialog.tsx:58-68`

```typescript
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

const handleFileSelect = (selectedFiles: FileList | null) => {
  if (!selectedFiles) return;
  const newFiles = Array.from(selectedFiles);

  // Validate file sizes
  const oversizedFiles = newFiles.filter(f => f.size > MAX_FILE_SIZE);
  if (oversizedFiles.length > 0) {
    toast({
      title: "File too large",
      description: `${oversizedFiles.length} file(s) exceed 200MB limit. Maximum size is 200MB per file.`,
      variant: "destructive",
    });
    return;
  }

  setFiles(prev => [...prev, ...newFiles]);

  if (!title && newFiles.length > 0) {
    const fileName = newFiles[0].name;
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    setTitle(nameWithoutExt);
  }
};
```

#### 2.4 Add Progress Tracking for Large Files
**File:** `frontend/src/components/knowledge/UploadDialog.tsx:134-136`

For files >10MB, show actual upload progress instead of simulated progress:

```typescript
// Real progress tracking for large files
if (file.size > 10 * 1024 * 1024) {
  await apiClient.uploadFileWithProgress(formData, auth, (progress) => {
    setUploadProgress(prev =>
      prev.map((p, idx) => idx === i ? { ...p, progress } : p)
    );
  });
} else {
  // Simulated progress for small files
  const progressInterval = setInterval(() => {
    setUploadProgress(prev =>
      prev.map((p, idx) =>
        idx === i && p.progress < 90 ? { ...p, progress: p.progress + 10 } : p
      )
    );
  }, 200);

  await apiClient.uploadFile(formData, auth);
  clearInterval(progressInterval);
}
```

#### 2.5 Add Upload Progress API Method
**File:** `frontend/src/services/apiClient.ts`

```typescript
async uploadFileWithProgress(
  formData: FormData,
  auth: { userId: string; accessToken: string },
  onProgress: (progress: number) => void
) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));

    xhr.open('POST', this.buildUrl('/files/upload'));
    xhr.setRequestHeader('Authorization', `Bearer ${auth.accessToken}`);
    xhr.setRequestHeader('x-user-id', auth.userId);

    xhr.send(formData);
  });
}
```

### Implementation Steps

1. **Increase Backend Limit** (30 minutes)
   - [ ] Update `file_service.py` to 200MB limit
   - [ ] Add better error messages with actual file sizes
   - [ ] Test with 100MB+ files locally

2. **Configure Cloud Run** (30 minutes)
   - [ ] Update timeout to 300 seconds
   - [ ] Test deployment
   - [ ] Verify logs show no timeout errors

3. **Frontend Validation** (1 hour)
   - [ ] Add file size validation in UploadDialog
   - [ ] Show clear error messages
   - [ ] Add real progress tracking for large files

4. **Testing** (2 hours)
   - [ ] Test with 50MB file
   - [ ] Test with 100MB file
   - [ ] Test with 200MB file
   - [ ] Test with 250MB file (should fail with clear error)
   - [ ] Verify upload progress shows accurately

### Success Criteria

- ✅ Files up to 200MB upload successfully
- ✅ Files >200MB show clear error message before upload
- ✅ Large file uploads show real progress percentage
- ✅ Upload completes within timeout limit
- ✅ No silent failures - all errors are logged and shown to user

---

## Issue 3: Multi-Format Document Support

### Problem Statement
System needs to support multiple document types (DOC, PPT, XLSX, etc.) while keeping Docker image size small and maintaining text extraction quality.

### Current State

**File:** `backend/app/services/processing_service.py:30-74`

**Currently Supported:**
- ✅ PDF (via PyMuPDF + pdfplumber + OCR fallback)
- ✅ DOCX (via python-docx)
- ✅ Images (via pytesseract OCR)
- ✅ HTML (via BeautifulSoup)
- ⚠️ DOC (limited support - recommends DOCX)
- ❌ PPT/PPTX
- ❌ XLS/XLSX
- ❌ ODP/ODS
- ❌ RTF
- ❌ EPUB

**Docker Image Size Concern:**
Current image is likely ~1-2GB. Adding full `unstructured` library would add ~500MB-1GB.

### Solution Design Options

#### Option A: Lightweight Approach (Recommended)
Use specific libraries for each format. **Image size: +100-200MB**

**Pros:**
- Smaller image size
- Better control over extraction quality
- Faster processing
- More maintainable

**Cons:**
- More code to maintain
- Need to handle each format separately

#### Option B: Unstructured.io (Comprehensive)
Use `unstructured` library for all formats. **Image size: +500MB-1GB**

**Pros:**
- Unified API for all formats
- Better table extraction
- OCR integration
- Well-tested library

**Cons:**
- Large Docker image
- Slower processing
- More dependencies

#### Option C: Hybrid Approach (Balanced)
Use lightweight libraries with unstructured fallback.

**Pros:**
- Best of both worlds
- Optimize for common formats
- Fallback for complex documents

**Cons:**
- Most complex implementation

### Recommended Solution: Option A (Lightweight)

#### 3.1 Add PowerPoint Support
**Library:** `python-pptx` (~5MB)

```python
# In processing_service.py

try:
    from pptx import Presentation
except ImportError:
    Presentation = None
    logger.warning("python-pptx unavailable; PPTX extraction disabled")
```

**Method:**
```python
async def _extract_pptx_text(self, item: KnowledgeItem) -> str:
    """Extract text from PowerPoint files."""
    from app.core.storage import storage_service

    if not Presentation:
        return "[PPTX extraction unavailable - python-pptx not installed]"

    try:
        pptx_bytes = await self._get_file_bytes(item, storage_service)
        if not pptx_bytes:
            return item.content

        prs = Presentation(io.BytesIO(pptx_bytes))
        text_parts = []

        for slide_num, slide in enumerate(prs.slides):
            slide_text = []

            # Extract text from shapes
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text.strip():
                    slide_text.append(shape.text)

            if slide_text:
                text_parts.append(f"--- Slide {slide_num + 1} ---\n" + "\n".join(slide_text))

        return "\n\n".join(text_parts)

    except Exception as e:
        logger.error(f"PPTX extraction failed for {item.id}: {e}")
        return f"[PPTX EXTRACTION ERROR: {str(e)}]"
```

#### 3.2 Add Excel Support
**Library:** `openpyxl` (~10MB)

```python
try:
    import openpyxl
except ImportError:
    openpyxl = None
    logger.warning("openpyxl unavailable; XLSX extraction disabled")
```

**Method:**
```python
async def _extract_xlsx_text(self, item: KnowledgeItem) -> str:
    """Extract text from Excel files."""
    from app.core.storage import storage_service

    if not openpyxl:
        return "[XLSX extraction unavailable - openpyxl not installed]"

    try:
        xlsx_bytes = await self._get_file_bytes(item, storage_service)
        if not xlsx_bytes:
            return item.content

        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
        text_parts = []

        for sheet_name in wb.sheetnames:
            sheet = wb[sheet_name]
            sheet_text = [f"--- Sheet: {sheet_name} ---"]

            for row in sheet.iter_rows(values_only=True):
                # Filter out empty cells and format row
                row_values = [str(cell) for cell in row if cell is not None]
                if row_values:
                    sheet_text.append(" | ".join(row_values))

            if len(sheet_text) > 1:  # Has content beyond header
                text_parts.append("\n".join(sheet_text))

        return "\n\n".join(text_parts)

    except Exception as e:
        logger.error(f"XLSX extraction failed for {item.id}: {e}")
        return f"[XLSX EXTRACTION ERROR: {str(e)}]"
```

#### 3.3 Add RTF Support
**Library:** `striprtf` (~1MB)

```python
try:
    from striprtf.striprtf import rtf_to_text
except ImportError:
    rtf_to_text = None
    logger.warning("striprtf unavailable; RTF extraction disabled")
```

**Method:**
```python
async def _extract_rtf_text(self, item: KnowledgeItem) -> str:
    """Extract text from RTF files."""
    from app.core.storage import storage_service

    if not rtf_to_text:
        return "[RTF extraction unavailable - striprtf not installed]"

    try:
        rtf_bytes = await self._get_file_bytes(item, storage_service)
        if not rtf_bytes:
            return item.content

        rtf_string = rtf_bytes.decode('utf-8', errors='ignore')
        text = rtf_to_text(rtf_string)

        return text

    except Exception as e:
        logger.error(f"RTF extraction failed for {item.id}: {e}")
        return f"[RTF EXTRACTION ERROR: {str(e)}]"
```

#### 3.4 Add CSV Support (Enhanced)
**Library:** Built-in `csv` module

```python
async def _extract_csv_text(self, item: KnowledgeItem) -> str:
    """Extract text from CSV files."""
    import csv
    from app.core.storage import storage_service

    try:
        csv_bytes = await self._get_file_bytes(item, storage_service)
        if not csv_bytes:
            return item.content

        csv_string = csv_bytes.decode('utf-8', errors='ignore')
        reader = csv.reader(io.StringIO(csv_string))

        rows = []
        for row_num, row in enumerate(reader):
            if row:  # Skip empty rows
                rows.append(" | ".join(row))
                if row_num >= 1000:  # Limit to first 1000 rows
                    rows.append("... (truncated)")
                    break

        return "\n".join(rows)

    except Exception as e:
        logger.error(f"CSV extraction failed for {item.id}: {e}")
        return f"[CSV EXTRACTION ERROR: {str(e)}]"
```

#### 3.5 Update Content Type Detection
**File:** `backend/app/services/file_service.py:292-324`

```python
def _get_content_type_from_file(self, filename: str, mime_type: str) -> str:
    """Get content type from filename and MIME type."""
    ext = filename.split('.')[-1].lower() if '.' in filename else ''

    # Image formats
    if mime_type.startswith('image/'):
        return 'image'

    # Document formats
    if mime_type == 'application/pdf' or ext == 'pdf':
        return 'pdf'
    if ext in ['doc', 'docx', 'odt', 'rtf']:
        return 'document'
    if ext in ['ppt', 'pptx', 'odp']:
        return 'presentation'
    if ext in ['xls', 'xlsx', 'ods', 'csv']:
        return 'spreadsheet'

    # Text formats
    if mime_type.startswith('text/') or ext in ['txt', 'md', 'rst']:
        return 'text'

    # Media formats
    if mime_type.startswith('audio/') or ext in ['mp3', 'wav', 'm4a', 'ogg']:
        return 'audio'
    if mime_type.startswith('video/') or ext in ['mp4', 'avi', 'mov', 'mkv']:
        return 'video'

    return 'file'
```

#### 3.6 Update Processing Service Router
**File:** `backend/app/services/processing_service.py:194-221`

```python
async def _extract_text_content(self, item: KnowledgeItem) -> Optional[str]:
    """Extract text content from different file types."""

    # Text content
    if item.content_type == ContentType.TEXT:
        return item.content

    # PDF
    elif item.content_type == ContentType.PDF:
        return await self._extract_pdf_text(item)

    # Images
    elif item.content_type == ContentType.IMAGE:
        return await self._extract_image_text(item)

    # Word documents
    elif item.content_type in [ContentType.DOC, ContentType.DOCX, 'document']:
        if item.metadata and item.metadata.get('original_filename', '').endswith('.rtf'):
            return await self._extract_rtf_text(item)
        return await self._extract_doc_text(item)

    # PowerPoint
    elif item.content_type == 'presentation':
        return await self._extract_pptx_text(item)

    # Excel/CSV
    elif item.content_type == 'spreadsheet':
        ext = item.metadata.get('original_filename', '').split('.')[-1].lower()
        if ext == 'csv':
            return await self._extract_csv_text(item)
        return await self._extract_xlsx_text(item)

    # HTML
    elif item.content_type == ContentType.HTML:
        return self._extract_html_text(item.content)

    # Default
    else:
        return item.content
```

#### 3.7 Update Requirements
**File:** `backend/requirements.txt`

```txt
# Existing dependencies
PyMuPDF==1.23.8
pdfplumber==0.10.3
pytesseract==0.3.10
Pillow==10.1.0
python-docx==1.1.0
beautifulsoup4==4.12.2

# New dependencies for multi-format support
python-pptx==0.6.23       # PowerPoint support (~5MB)
openpyxl==3.1.2          # Excel support (~10MB)
striprtf==0.0.26         # RTF support (~1MB)

# Total added size: ~15-20MB
```

#### 3.8 Docker Optimization
**File:** `backend/Dockerfile`

Use multi-stage build to minimize image size:

```dockerfile
# Stage 1: Build dependencies
FROM python:3.12-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.12-slim

WORKDIR /app

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local

# Copy application
COPY ./app ./app

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### Implementation Steps

1. **Add Dependencies** (1 hour)
   - [ ] Update `requirements.txt` with new libraries
   - [ ] Test local installation
   - [ ] Verify no conflicts

2. **Implement Extractors** (4 hours)
   - [ ] Add PPTX extractor
   - [ ] Add XLSX extractor
   - [ ] Add RTF extractor
   - [ ] Add enhanced CSV extractor
   - [ ] Update content type router

3. **Docker Optimization** (2 hours)
   - [ ] Update Dockerfile with multi-stage build
   - [ ] Build and test locally
   - [ ] Measure image size (target: <1.5GB)

4. **Testing** (4 hours)
   - [ ] Test PPTX with text slides
   - [ ] Test PPTX with images
   - [ ] Test XLSX with multiple sheets
   - [ ] Test XLSX with formulas
   - [ ] Test RTF documents
   - [ ] Test CSV files
   - [ ] Test mixed format uploads
   - [ ] Verify extraction quality

5. **Frontend Updates** (1 hour)
   - [ ] Update file input accept types in UploadDialog
   - [ ] Add icons for new file types in ItemList
   - [ ] Test drag-and-drop with new formats

### Success Criteria

- ✅ PPTX files extract text from all slides
- ✅ XLSX files extract data from all sheets
- ✅ RTF files extract formatted text
- ✅ CSV files handle large datasets (1000+ rows)
- ✅ Docker image size <1.5GB (currently likely ~1GB, target +500MB max)
- ✅ Extraction quality matches or exceeds PDF quality
- ✅ All formats show processing status correctly
- ✅ Error messages are clear when extraction fails

---

## Issue 4: Mobile UI Improvements

### Problem Statement
Mobile knowledge base view is congested with too much information. Users want simplified view with expandable details.

### Current State

**File:** `frontend/src/components/knowledge/mobile/MobileItemCard.tsx`

**Current display per item:**
- Icon (2.5rem padding)
- Title (can be 2 lines)
- Content type badge
- Processing status icon + text
- Content preview (120 chars or 500 when expanded)
- Show more/less button
- Date
- Source URL
- Swipe hint text

**Issues:**
- Too much information at once
- Vertical space consumption
- Hard to scan quickly
- Swipe hint shown on every item

### Solution Design

#### 4.1 Create Compact Card View
**File:** `frontend/src/components/knowledge/mobile/MobileItemCard.tsx`

**Changes:**
1. Reduce to essential info in collapsed state
2. Show full details only when tapped
3. Remove swipe hint after first interaction
4. Better use of spacing

```typescript
/**
 * Simplified mobile card - shows only essentials
 */
export function MobileItemCard({
  item,
  isSelected,
  onSelect,
  onDelete,
  onReprocess,
}: MobileItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(true);

  // Simplified date format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getStatusIcon = () => {
    switch (item.processing_status) {
      case 'processing':
        return <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-400" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-400" />;
      default:
        return null;
    }
  };

  return (
    <SwipeableItem
      onDelete={onDelete}
      onReprocess={onReprocess}
      onSwipe={() => setShowSwipeHint(false)}
    >
      <Card
        className={`transition-all duration-200 border-0 ${
          isSelected
            ? 'bg-gradient-to-r from-blue-500/25 to-purple-500/25 ring-1 ring-blue-400/50'
            : 'bg-white/8 active:bg-white/12'
        }`}
        onClick={() => {
          onSelect();
          setIsExpanded(!isExpanded);
        }}
      >
        <CardContent className="p-3">
          {/* Compact Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Smaller icon */}
              <div className={`p-1.5 rounded ${
                isSelected ? 'bg-blue-400/30' : 'bg-white/10'
              }`}>
                {getContentTypeIcon(item.content_type)}
              </div>

              {/* Title - single line */}
              <h4 className="font-medium text-sm text-white truncate flex-1">
                {item.title}
              </h4>

              {/* Status indicator */}
              {getStatusIcon()}
            </div>

            {/* Timestamp */}
            <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
              {formatDate(item.created_at)}
            </span>
          </div>

          {/* Expandable Content */}
          {isExpanded && (
            <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
              {/* Content Type Badge */}
              <div className="flex items-center gap-2">
                <Badge className={`text-xs px-2 py-0.5 ${getContentTypeColor(item.content_type)}`}>
                  {item.content_type}
                </Badge>
                {item.processing_status && (
                  <span className="text-xs text-gray-400">
                    {getProcessingStatusText(item)}
                  </span>
                )}
              </div>

              {/* Content Preview */}
              <p className="text-sm text-gray-300 leading-relaxed">
                {item.content && !item.content.startsWith('[FILE:')
                  ? item.content.substring(0, 200) + '...'
                  : 'File content - tap to view'}
              </p>

              {/* Metadata */}
              {item.source_url && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate">{new URL(item.source_url).hostname}</span>
                </div>
              )}

              {/* Item ID for reference */}
              <div className="text-xs text-gray-500 font-mono">
                ID: {item.id.substring(0, 8)}...
              </div>
            </div>
          )}

          {/* Swipe Hint - only show once */}
          {showSwipeHint && !isExpanded && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <p className="text-xs text-gray-500 text-center">
                ← Swipe for actions • Tap for details →
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </SwipeableItem>
  );
}
```

#### 4.2 Update SwipeableItem Component
**File:** `frontend/src/components/knowledge/mobile/SwipeableItem.tsx`

Add `onSwipe` callback to hide hints:

```typescript
interface SwipeableItemProps {
  children: React.ReactNode;
  onDelete: () => void;
  onReprocess?: () => void;
  onSwipe?: () => void;  // New callback
}

export function SwipeableItem({ children, onDelete, onReprocess, onSwipe }: SwipeableItemProps) {
  // ... existing code ...

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);

    // Notify parent that user started swiping
    if (onSwipe) {
      onSwipe();
    }
  };

  // ... rest of component ...
}
```

#### 4.3 Add Item Detail Modal
**New File:** `frontend/src/components/knowledge/mobile/MobileItemDetailModal.tsx`

For viewing full item details:

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, ExternalLink, RefreshCw, Trash2, Copy } from 'lucide-react';

interface MobileItemDetailModalProps {
  item: KnowledgeItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onReprocess?: () => void;
}

export function MobileItemDetailModal({
  item,
  open,
  onOpenChange,
  onDelete,
  onReprocess,
}: MobileItemDetailModalProps) {
  if (!item) return null;

  const copyItemId = () => {
    navigator.clipboard.writeText(item.id);
    toast({ description: "Item ID copied" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] bg-slate-900 border-slate-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-lg pr-8">
            {item.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status and Type */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getContentTypeColor(item.content_type)}>
              {item.content_type}
            </Badge>
            <Badge variant="outline" className="text-gray-400">
              {getProcessingStatusText(item)}
            </Badge>
          </div>

          {/* Content Preview */}
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">
              {item.content && !item.content.startsWith('[FILE:')
                ? item.content
                : 'File stored in cloud storage - use download to view'}
            </p>
          </div>

          {/* Metadata */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Created:</span>
              <span className="text-gray-200">
                {new Date(item.created_at).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Updated:</span>
              <span className="text-gray-200">
                {new Date(item.updated_at).toLocaleString()}
              </span>
            </div>
            {item.total_chunks > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Chunks:</span>
                <span className="text-gray-200">{item.total_chunks}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Item ID:</span>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono text-gray-200">
                  {item.id.substring(0, 8)}...
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyItemId}
                  className="h-6 w-6 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {item.source_url && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => window.open(item.source_url, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open
              </Button>
            )}
            {onReprocess && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onReprocess}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reprocess
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

#### 4.4 Update Mobile Knowledge Page
**File:** `frontend/src/pages/MobileKnowledgePage.tsx`

Use the new modal for item details:

```typescript
export default function MobileKnowledgePage() {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // ... existing code ...

  const handleItemSelect = (itemId: string) => {
    setSelectedItemId(itemId);
    setDetailModalOpen(true);
  };

  const selectedItem = items.find(item => item.id === selectedItemId);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* ... existing header ... */}

      {/* Item List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.map((item) => (
          <MobileItemCard
            key={item.id}
            item={item}
            isSelected={item.id === selectedItemId}
            onSelect={() => handleItemSelect(item.id)}
            onDelete={() => handleDeleteItem(item.id)}
            onReprocess={() => handleReprocessItem(item.id)}
          />
        ))}
      </div>

      {/* Detail Modal */}
      <MobileItemDetailModal
        item={selectedItem || null}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onDelete={() => {
          if (selectedItemId) {
            handleDeleteItem(selectedItemId);
            setDetailModalOpen(false);
          }
        }}
        onReprocess={() => {
          if (selectedItemId) {
            handleReprocessItem(selectedItemId);
            setDetailModalOpen(false);
          }
        }}
      />
    </div>
  );
}
```

### Implementation Steps

1. **Update MobileItemCard** (2 hours)
   - [ ] Implement compact view
   - [ ] Add expand/collapse logic
   - [ ] Update swipe hint behavior
   - [ ] Test on various screen sizes

2. **Create Detail Modal** (2 hours)
   - [ ] Build MobileItemDetailModal component
   - [ ] Add all item metadata display
   - [ ] Add action buttons
   - [ ] Test modal interactions

3. **Update Mobile Page** (1 hour)
   - [ ] Integrate detail modal
   - [ ] Update item selection logic
   - [ ] Test navigation flow

4. **Polish & Testing** (2 hours)
   - [ ] Test on iPhone (Safari)
   - [ ] Test on Android (Chrome)
   - [ ] Test swipe gestures
   - [ ] Test tap interactions
   - [ ] Verify accessibility

### Success Criteria

- ✅ Compact cards show only: icon, title, status, timestamp
- ✅ Tapping card expands to show: type badge, preview, metadata
- ✅ Swipe hint disappears after first swipe
- ✅ Full details available in modal
- ✅ Easier to scan list of items
- ✅ 50% reduction in vertical space per item (collapsed state)

---

## Issue 5: Desktop Upload Dialog Fix

### Problem Statement
When uploading large files, the upload dialog stretches and disturbs the UI layout.

### Root Cause Analysis

**File:** `frontend/src/components/knowledge/UploadDialog.tsx:255-259`

```typescript
<Dialog open={open} onOpenChange={(isOpen) => {
  setOpen(isOpen);
  if (!isOpen) resetForm();
}}>
  <DialogContent className="sm:max-w-[600px] bg-slate-900 border-slate-700">
```

**Issues:**
1. No max-height constraint
2. File list can grow indefinitely
3. Long filenames cause horizontal stretching
4. No scrolling for large file lists

### Solution Design

#### 5.1 Constrain Dialog Dimensions
**File:** `frontend/src/components/knowledge/UploadDialog.tsx:255-259`

```typescript
<DialogContent className="sm:max-w-[600px] max-h-[90vh] bg-slate-900 border-slate-700 flex flex-col">
  <DialogHeader className="flex-shrink-0">
    <DialogTitle className="text-white text-xl">Add Content to Folder</DialogTitle>
    <DialogDescription className="text-gray-400">
      Upload files or create a text note
    </DialogDescription>
  </DialogHeader>

  <div className="flex-1 overflow-y-auto min-h-0">
    {/* Scrollable content */}
    <Tabs defaultValue="upload" className="w-full">
      {/* ... tabs content ... */}
    </Tabs>
  </div>
</DialogContent>
```

#### 5.2 Add Scrollable File List
**File:** `frontend/src/components/knowledge/UploadDialog.tsx:310-357`

```typescript
{/* Selected Files - Scrollable */}
{files.length > 0 && (
  <div className="space-y-2">
    {/* File count header */}
    <div className="flex items-center justify-between px-1">
      <span className="text-sm text-gray-400">
        {files.length} file{files.length > 1 ? 's' : ''} selected
      </span>
      {!uploading && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFiles([])}
          className="h-7 text-xs text-gray-400 hover:text-red-400"
        >
          Clear all
        </Button>
      )}
    </div>

    {/* Scrollable file list with max height */}
    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
      {files.map((file, index) => {
        const progress = uploadProgress[index];
        return (
          <div
            key={index}
            className="p-3 bg-slate-800 rounded-lg space-y-2 border border-slate-700"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex-shrink-0">
                {getFileIcon(file)}
              </div>

              {/* Truncated filename with tooltip */}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate text-gray-200" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(file.size)}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {progress?.status === 'uploading' && (
                  <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                )}
                {progress?.status === 'success' && (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                )}
                {progress?.status === 'error' && (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                {!uploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="h-6 w-6 p-0 hover:bg-red-500/20 text-gray-400 hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {progress && progress.status === 'uploading' && (
              <Progress value={progress.progress} className="h-1.5" />
            )}

            {/* Error message */}
            {progress?.error && (
              <p className="text-xs text-red-400">{progress.error}</p>
            )}
          </div>
        );
      })}
    </div>

    {/* Scroll indicator */}
    {files.length > 4 && (
      <div className="text-xs text-center text-gray-500">
        ↕ Scroll to see all files
      </div>
    )}
  </div>
)}
```

#### 5.3 Add Filename Truncation Utility
**New File:** `frontend/src/utils/fileUtils.ts`

```typescript
/**
 * Truncate filename to fit in UI while preserving extension
 */
export function truncateFilename(filename: string, maxLength: number = 40): string {
  if (filename.length <= maxLength) return filename;

  const ext = filename.split('.').pop() || '';
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;

  const availableLength = maxLength - ext.length - 4; // 4 for "..." and "."
  if (availableLength <= 0) return filename.substring(0, maxLength) + '...';

  const truncated = nameWithoutExt.substring(0, availableLength);
  return `${truncated}...${ext}`;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
```

#### 5.4 Update Dialog Component Styles
**File:** `frontend/src/components/ui/dialog.tsx`

Ensure dialog respects max-height:

```typescript
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        "max-h-[90vh] overflow-hidden flex flex-col",  // Add constraints
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
```

### Implementation Steps

1. **Update Dialog Constraints** (1 hour)
   - [ ] Add max-height to DialogContent
   - [ ] Make content scrollable
   - [ ] Test with many files (20+)

2. **Improve File List** (2 hours)
   - [ ] Add scrollable container with max-height
   - [ ] Add "Clear all" button
   - [ ] Add scroll indicator
   - [ ] Truncate long filenames

3. **Add Utility Functions** (30 minutes)
   - [ ] Create fileUtils.ts
   - [ ] Add truncateFilename function
   - [ ] Move formatFileSize to utils

4. **Testing** (1 hour)
   - [ ] Test with 1 file
   - [ ] Test with 10 files
   - [ ] Test with 50 files
   - [ ] Test with very long filenames (100+ chars)
   - [ ] Test on different screen sizes
   - [ ] Verify dialog stays centered and sized correctly

### Success Criteria

- ✅ Dialog never exceeds 90vh height
- ✅ File list scrolls independently when >4 files
- ✅ Long filenames are truncated with extension preserved
- ✅ Dialog stays centered regardless of content
- ✅ "Clear all" button available for bulk removal
- ✅ Scroll indicator shown when list is scrollable
- ✅ No horizontal overflow

---

## Implementation Timeline

### Phase 1: Quick Wins (Week 1)
**Estimated: 8-12 hours**

1. **File Size Limits** (3 hours)
   - Update backend limit to 200MB
   - Add frontend validation
   - Update Cloud Run configuration

2. **Upload Dialog Fix** (3 hours)
   - Add max-height constraints
   - Implement scrollable file list
   - Add filename truncation

3. **Mobile UI - Part 1** (3 hours)
   - Update MobileItemCard to compact view
   - Add expand/collapse functionality

### Phase 2: Core Functionality (Week 2)
**Estimated: 16-20 hours**

1. **Processing Status Display** (6 hours)
   - Enhance backend status endpoint
   - Create useProcessingStatus hook
   - Update ItemList components
   - Add status polling

2. **Multi-Format Support - Part 1** (6 hours)
   - Add PPTX support
   - Add XLSX support
   - Update requirements.txt
   - Test basic extraction

3. **Mobile UI - Part 2** (4 hours)
   - Create MobileItemDetailModal
   - Integrate with MobileKnowledgePage
   - Polish interactions

### Phase 3: Polish & Testing (Week 3)
**Estimated: 12-16 hours**

1. **Multi-Format Support - Part 2** (4 hours)
   - Add RTF support
   - Add enhanced CSV support
   - Docker optimization
   - Testing all formats

2. **End-to-End Testing** (4 hours)
   - Test complete upload → process → display flow
   - Test on mobile devices
   - Test with various file sizes and formats
   - Performance testing

3. **Documentation & Deployment** (4 hours)
   - Update user documentation
   - Create deployment checklist
   - Deploy to staging
   - Deploy to production

---

## Testing Strategy

### Unit Tests

```bash
# Backend tests
pytest backend/app/tests/test_processing_service.py -v
pytest backend/app/tests/test_file_service.py -v

# Frontend tests
npm test -- --coverage
```

### Integration Tests

1. **Upload Flow**
   ```
   Upload file → Check status endpoint → Verify processing → Check chunks → Verify searchable
   ```

2. **Multi-Format Support**
   ```
   For each format (PDF, DOCX, PPTX, XLSX, RTF, CSV):
   - Upload sample file
   - Verify text extraction
   - Check chunk count
   - Test search functionality
   ```

3. **Status Polling**
   ```
   Upload large file → Monitor status changes → Verify UI updates → Check final state
   ```

### Manual Testing Checklist

#### Desktop
- [ ] Upload 1MB file - verify instant processing
- [ ] Upload 50MB file - verify progress bar
- [ ] Upload 100MB file - verify no timeout
- [ ] Upload 20 files at once - verify dialog doesn't overflow
- [ ] Upload file with 200-char filename - verify truncation
- [ ] Test each supported format (PDF, DOCX, PPTX, XLSX, CSV, RTF)
- [ ] Verify status updates in real-time
- [ ] Test reprocess functionality

#### Mobile
- [ ] Upload file from mobile browser
- [ ] Verify compact card view
- [ ] Test tap to expand
- [ ] Test swipe gestures
- [ ] Verify swipe hint disappears
- [ ] Open detail modal
- [ ] Test all actions in modal
- [ ] Verify responsiveness on different screen sizes

### Performance Testing

1. **Upload Performance**
   - 10MB file should upload in <10 seconds
   - 100MB file should upload in <60 seconds
   - No memory leaks during large uploads

2. **Processing Performance**
   - 10-page PDF should process in <5 seconds
   - 100-page PDF should process in <30 seconds
   - Status polling should not impact UI performance

3. **UI Performance**
   - List with 100 items should scroll smoothly (60fps)
   - Mobile gestures should be responsive (<100ms)
   - Dialog should open/close smoothly

---

## Rollback Plan

### If Issues Arise

1. **File Size Limit Issues**
   ```bash
   # Revert backend limit
   git revert <commit-hash>

   # Redeploy
   gcloud builds submit --config=backend/cloudbuild.yaml
   ```

2. **Multi-Format Support Issues**
   ```bash
   # Disable specific format extractors
   # Set feature flag in config
   export ENABLE_PPTX_EXTRACTION=false
   export ENABLE_XLSX_EXTRACTION=false
   ```

3. **Status Polling Issues**
   ```typescript
   // Disable polling in frontend
   const ENABLE_STATUS_POLLING = false;

   if (ENABLE_STATUS_POLLING) {
     // polling code
   }
   ```

### Monitoring

1. **Error Rates**
   ```bash
   # Check Cloud Run logs
   gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit 100
   ```

2. **Performance Metrics**
   - Monitor upload success rate (target: >99%)
   - Monitor processing completion rate (target: >95%)
   - Monitor average processing time
   - Monitor API error rates

3. **User Feedback**
   - Monitor support tickets
   - Track user-reported issues
   - Review analytics for drop-off points

---

## Success Metrics

### Key Performance Indicators

1. **Processing Status Display**
   - ✅ 100% of items show correct status within 3 seconds
   - ✅ 0 false "not processable" messages

2. **File Size Limits**
   - ✅ 100MB files upload successfully
   - ✅ 200MB files upload successfully
   - ✅ Upload success rate >99%

3. **Multi-Format Support**
   - ✅ PPTX extraction success rate >95%
   - ✅ XLSX extraction success rate >95%
   - ✅ Text extraction quality >90% (manual review sample)
   - ✅ Docker image size <1.5GB

4. **Mobile UI**
   - ✅ 50% reduction in vertical space (collapsed cards)
   - ✅ Tap to expand works 100% of time
   - ✅ Swipe gestures work on iOS and Android

5. **Upload Dialog**
   - ✅ No UI distortion with 50 files
   - ✅ Filenames truncate correctly
   - ✅ Dialog stays within 90vh

---

## Dependencies

### Python Packages (Backend)
```txt
# New dependencies
python-pptx==0.6.23
openpyxl==3.1.2
striprtf==0.0.26
```

### System Changes
- Cloud Run timeout: 120s → 300s
- File size limit: 50MB → 200MB

### Database Changes
- None required (all fields already exist)

---

## Risks & Mitigation

### Risk 1: Large Files Timeout
**Probability:** Medium
**Impact:** High
**Mitigation:**
- Increase Cloud Run timeout to 300s
- Implement chunked upload for >100MB files
- Add retry logic with exponential backoff

### Risk 2: Docker Image Too Large
**Probability:** Low
**Impact:** Medium
**Mitigation:**
- Use multi-stage builds
- Remove unnecessary dependencies
- Optimize layer caching
- Target: <1.5GB final image

### Risk 3: Status Polling Impact Performance
**Probability:** Low
**Impact:** Low
**Mitigation:**
- Poll only for non-completed items
- Use 3-second interval (not too aggressive)
- Stop polling after 5 minutes
- Implement backoff if errors occur

### Risk 4: Text Extraction Quality Issues
**Probability:** Medium
**Impact:** Medium
**Mitigation:**
- Manual testing with sample files
- Fallback to original content if extraction fails
- Allow users to reprocess with different settings
- Log extraction quality metrics

---

## Notes

### Testing Files Needed
Prepare sample files for testing:
- ✅ 1MB PDF
- ✅ 10MB PDF
- ✅ 50MB PDF
- ✅ 100MB PDF
- ✅ 10-slide PPTX with text
- ✅ PPTX with images
- ✅ Multi-sheet XLSX
- ✅ Large XLSX (1000+ rows)
- ✅ RTF document
- ✅ CSV file (1000+ rows)
- ✅ File with 200-char filename

### Environment Variables
No new environment variables needed. All existing config sufficient.

### API Endpoints Modified
- ✅ `GET /api/v1/files/status/{item_id}` - Enhanced with vector counting
- ✅ `POST /api/v1/files/upload` - Increased size limit

### API Endpoints Added
- None (using existing endpoints)

---

**End of Implementation Plan**

---

## Appendix: Code Snippets

### A. Enhanced Processing Status Response Schema

```python
# backend/app/models/schemas.py

class ProcessingStatusResponse(BaseSchema):
    """Enhanced processing status response."""
    knowledge_item_id: UUID
    processing_status: ProcessingStatus
    is_chunked: bool
    total_chunks: int
    vector_count: int
    vectors_with_embeddings: int
    is_searchable: bool
    content_type: str
    title: str
    created_at: datetime
    updated_at: datetime
    processing_progress: Optional[float] = None  # 0.0 to 1.0
    estimated_completion: Optional[int] = None  # seconds
    error_message: Optional[str] = None
```

### B. Frontend Type Definitions

```typescript
// frontend/src/types/knowledge.ts

export interface KnowledgeItem {
  id: string;
  user_id: string;
  folder_id: string;
  title: string;
  content: string;
  content_type: string;
  source_url?: string;
  metadata?: any;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  is_chunked: boolean;
  total_chunks: number;
  vector_count?: number;
  vectors_with_embeddings?: number;
  is_searchable?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProcessingStatusResponse {
  knowledge_item_id: string;
  processing_status: string;
  is_chunked: boolean;
  total_chunks: number;
  vector_count: number;
  vectors_with_embeddings: number;
  is_searchable: boolean;
  content_type: string;
  title: string;
  created_at: string;
  updated_at: string;
  processing_progress?: number;
  estimated_completion?: number;
  error_message?: string;
}
```

---

**Document Version:** 1.0
**Last Updated:** October 5, 2025
**Author:** Claude Code
**Status:** Ready for Implementation
