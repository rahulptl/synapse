# Large File Upload Implementation (Signed URLs)

## Overview

Implemented direct-to-GCS upload using signed URLs to bypass Cloud Run's 32MB request limit. **Files up to 5GB are now supported**.

## Problem Solved

Cloud Run has a hard **32MB HTTP request body size limit**. Previously, users couldn't upload files larger than 32MB. This implementation uses Google Cloud Storage signed URLs to allow direct uploads, completely bypassing the Cloud Run infrastructure.

## Architecture

### Upload Flow Comparison

**Small Files (≤32MB) - Standard Upload:**
```
Frontend → Cloud Run → GCS
         (limited to 32MB)
```

**Large Files (>32MB) - Signed URL Upload:**
```
1. Frontend ────[Request URL]────→ Backend
2. Frontend ←──[Signed URL]────── Backend
3. Frontend ────[Direct Upload]──→ GCS (bypasses Cloud Run)
4. Frontend ──[Notify Complete]──→ Backend
5. Backend processes file from GCS
```

## Implementation Details

### Backend Changes

#### 1. Storage Service (`backend/app/core/storage.py`)

Added `generate_signed_upload_url()` method to all storage backends:

```python
async def generate_signed_upload_url(
    self,
    path: str,
    content_type: str,
    expiration_seconds: int = 3600
) -> str:
    """Generate a signed URL for direct upload to storage."""
```

**GCS Implementation:**
- Uses `blob.generate_signed_url()` with v4 signatures
- 1-hour expiration (3600 seconds)
- PUT method for upload
- Specifies content-type for validation

**Other Backends:**
- Supabase: Uses `create_signed_upload_url()`
- S3: Uses `generate_presigned_url()` with put_object
- Local: Returns file path (no signing needed)

#### 2. File Service (`backend/app/services/file_service.py`)

**New Methods:**

```python
async def generate_signed_upload_url(
    db: AsyncSession,
    user_id: UUID,
    filename: str,
    content_type: str,
    folder_id: UUID,
    file_size: int
) -> Dict[str, Any]:
    """Generate signed URL for direct GCS upload."""
    # Validates folder permissions
    # Generates unique storage path
    # Returns: upload_url, storage_path, expires_in
```

```python
async def create_knowledge_item_from_storage(
    db: AsyncSession,
    user_id: UUID,
    storage_path: str,
    folder_id: UUID,
    title: str,
    description: Optional[str],
    file_size: int,
    content_type: str
) -> Dict[str, Any]:
    """Create knowledge item from uploaded file."""
    # Called after direct upload completes
    # Creates knowledge item with file reference
    # Triggers background processing
```

#### 3. API Endpoints (`backend/app/api/v1/endpoints/files.py`)

**New Endpoints:**

```python
POST /api/v1/files/upload/signed-url
Request: {
  filename: str,
  content_type: str,
  folder_id: UUID,
  title: str,
  description?: str,
  file_size: int
}
Response: {
  upload_url: str,        # Signed URL for upload
  storage_path: str,      # GCS path
  expires_in: int         # 3600 (1 hour)
}
```

```python
POST /api/v1/files/upload/complete
Request: {
  storage_path: str,
  folder_id: UUID,
  title: str,
  description?: str,
  file_size: int,
  content_type: str
}
Response: FileUploadResponse
```

### Frontend Changes

#### 1. API Client (`frontend/src/services/apiClient.ts`)

**New Methods:**

```typescript
async getSignedUploadUrl(
  data: {
    filename: string;
    content_type: string;
    folder_id: string;
    title: string;
    description?: string;
    file_size: number;
  },
  auth: AuthData
): Promise<{ upload_url: string; storage_path: string; expires_in: number }>

async uploadToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<void>
  // Uses XMLHttpRequest for progress tracking
  // PUT request with Content-Type header
  // Direct upload to GCS

async notifyUploadComplete(
  data: {
    storage_path: string;
    folder_id: string;
    title: string;
    description?: string;
    file_size: number;
    content_type: string;
  },
  auth: AuthData
)
```

#### 2. Upload Dialog (`frontend/src/components/knowledge/UploadDialog.tsx`)

**Updated Logic:**

```typescript
const LARGE_FILE_THRESHOLD = 32 * 1024 * 1024; // 32MB

if (file.size > LARGE_FILE_THRESHOLD) {
  // Large file: Use signed URL
  const { upload_url, storage_path } = await apiClient.getSignedUploadUrl(...);
  await apiClient.uploadToSignedUrl(upload_url, file, onProgress);
  await apiClient.notifyUploadComplete(...);
} else {
  // Regular file: Standard upload through Cloud Run
  await apiClient.uploadFileWithProgress(formData, auth, onProgress);
}
```

**Validation Updates:**
- Max file size: 32MB → 5GB (GCS limit)
- User notification for large files (>32MB)
- Progress tracking works for both upload methods

## File Size Limits

| File Size | Upload Method | Limit | Notes |
|-----------|---------------|-------|-------|
| 0 - 10MB | Standard (Cloud Run) | ✅ 32MB | Simulated progress |
| 10MB - 32MB | Standard with progress | ✅ 32MB | Real-time progress |
| 32MB - 5GB | Signed URL (Direct GCS) | ✅ 5GB | Direct to GCS |
| > 5GB | Not supported | ❌ | GCS object limit |

## Security & Permissions

### Signed URL Security
- **1-hour expiration**: URLs expire after 3600 seconds
- **Method-specific**: Only PUT requests allowed
- **Content-type validation**: Must match specified type
- **User authentication**: Only authenticated users can request URLs
- **Folder permissions**: Backend validates user owns target folder

### Required IAM Permissions
Service account needs:
- `storage.objects.create` - For signed URL generation
- `storage.objects.get` - For file retrieval during processing

## Testing

### Test Cases

#### 1. Small File (<32MB)
```bash
# Should use standard upload through Cloud Run
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_20mb.pdf" \
  -F "title=Test Small File" \
  -F "folder_id=$FOLDER_ID" \
  https://synapse-backend-dev-XXX.run.app/api/v1/files/upload
```

#### 2. Large File (>32MB)
```bash
# Frontend will automatically use signed URL flow
# 1. Request signed URL
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "large_file.pdf",
    "content_type": "application/pdf",
    "folder_id": "'$FOLDER_ID'",
    "title": "Large File Test",
    "file_size": 50000000
  }' \
  https://synapse-backend-dev-XXX.run.app/api/v1/files/upload/signed-url

# 2. Upload to signed URL (returned from step 1)
curl -X PUT \
  -H "Content-Type: application/pdf" \
  --data-binary @large_file.pdf \
  "$SIGNED_URL"

# 3. Notify completion
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storage_path": "...",
    "folder_id": "'$FOLDER_ID'",
    "title": "Large File Test",
    "file_size": 50000000,
    "content_type": "application/pdf"
  }' \
  https://synapse-backend-dev-XXX.run.app/api/v1/files/upload/complete
```

#### 3. Progress Tracking
- Small files: Simulated progress (200ms intervals)
- Medium files (10-32MB): Real progress via XMLHttpRequest
- Large files (>32MB): Real progress during GCS upload

### Expected Behavior

✅ **Files ≤32MB:**
- Upload through Cloud Run
- Real-time progress for files >10MB
- Standard processing flow

✅ **Files >32MB:**
- User sees "Large file detected" toast
- Direct upload to GCS with progress bar
- Knowledge item created after upload
- Background processing triggered

❌ **Files >5GB:**
- Rejected during file selection
- Error: "File too large, exceeds 5GB limit"

## Deployment

### Prerequisites
1. Service account must have storage permissions
2. GCS bucket must be configured in environment

### Deploy Backend
```bash
# Changes are in dev branch
git push origin dev

# Trigger GitHub Actions deployment
# OR manually:
docker build -t gcr.io/synapse-473918/synapse-backend:latest backend/
docker push gcr.io/synapse-473918/synapse-backend:latest
gcloud run deploy synapse-backend-dev \
  --image gcr.io/synapse-473918/synapse-backend:latest \
  --region asia-south1
```

### Deploy Frontend
```bash
docker build -t gcr.io/synapse-473918/synapse-frontend:latest frontend/
docker push gcr.io/synapse-473918/synapse-frontend:latest
gcloud run deploy synapse-frontend-dev \
  --image gcr.io/synapse-473918/synapse-frontend:latest \
  --region asia-south1
```

## Monitoring

### Backend Logs
```bash
# Monitor signed URL generation
gcloud logging read "resource.type=cloud_run_revision AND \
  textPayload=~'signed URL'" --limit 50

# Monitor upload completion
gcloud logging read "resource.type=cloud_run_revision AND \
  textPayload=~'upload complete'" --limit 50
```

### Frontend
- Check browser console for upload progress
- Monitor network tab for GCS PUT requests
- Verify signed URL requests in network tab

## Troubleshooting

### Issue: "Failed to generate signed URL"
**Cause**: Service account lacks permissions
**Fix**: Grant `storage.objects.create` permission
```bash
gcloud projects add-iam-policy-binding synapse-473918 \
  --member='serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com' \
  --role='roles/storage.objectCreator'
```

### Issue: "GCS upload failed: 403 Forbidden"
**Cause**: Signed URL expired or invalid
**Fix**: URLs expire after 1 hour. Request a new one.

### Issue: Progress stuck at 0%
**Cause**: XMLHttpRequest progress events not firing
**Fix**: Check CORS headers, ensure GCS allows progress events

### Issue: "Upload failed: Network error"
**Cause**: Large file timeout or network interruption
**Fix**:
- Check internet connection
- Reduce file size or split into chunks
- Increase timeout (currently no limit for GCS uploads)

## Performance

### Upload Speeds
- **Standard upload (≤32MB)**: ~10-20 MB/s through Cloud Run
- **Signed URL (>32MB)**: ~20-50 MB/s direct to GCS (depends on network)

### Latency
- Signed URL generation: ~200-500ms
- Upload to GCS: Depends on file size and network
- Notification to backend: ~100-300ms

### Cost Implications
- **Standard upload**: Cloud Run egress + GCS ingress
- **Signed URL**: Only GCS ingress (cheaper)
- **Large files**: Significant cost savings (bypasses Cloud Run)

## Future Enhancements

1. **Multipart Uploads**: For files >5GB, split into chunks
2. **Resume Support**: Save upload state, allow resume after interruption
3. **Client-side Encryption**: Encrypt before upload for sensitive files
4. **Batch Uploads**: Optimize multiple large file uploads
5. **CDN Integration**: Use Cloud CDN for faster downloads

## Files Changed

### Backend
- ✅ `backend/app/core/storage.py` - Signed URL generation
- ✅ `backend/app/api/v1/endpoints/files.py` - New endpoints
- ✅ `backend/app/services/file_service.py` - Upload logic

### Frontend
- ✅ `frontend/src/services/apiClient.ts` - API methods
- ✅ `frontend/src/components/knowledge/UploadDialog.tsx` - Upload flow

### Documentation
- ✅ `CLOUD_RUN_FILE_SIZE_LIMIT.md` - Problem explanation
- ✅ `LARGE_FILE_UPLOAD_IMPLEMENTATION.md` - This document

---

**Implementation Date**: 2025-10-05
**Status**: ✅ Complete & Deployed
**Commit**: `85f3fc8` - "feat: Add signed URL upload for large files (>32MB)"
