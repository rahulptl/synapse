# Cloud Run File Size Limitation & Solution

## Problem
Getting **413 "Content Too Large"** errors when uploading files to Cloud Run.

### Root Cause
**Cloud Run has a hard 32MB HTTP request body size limit** that cannot be increased. This is an infrastructure constraint, not a configuration issue.

Our application was configured to accept 200MB files, but Cloud Run rejects any request larger than 32MB at the infrastructure level, before it even reaches our application code.

## Solution Implemented

### Phase 1: Updated to 32MB Limit (Completed ✅)

**Backend Changes:**
- Updated `file_service.py`: Max file size reduced from 200MB → 32MB
- Updated `Dockerfile`: Added uvicorn timeout and request limit configs
- Improved error messages to explain Cloud Run's 32MB limitation

**Frontend Changes:**
- Updated `UploadDialog.tsx`: Client-side validation now checks 32MB limit
- Error messages now inform users about Cloud Run's infrastructure constraint

**Commit:** `cbb8d32` - "fix: Update file upload limit to 32MB (Cloud Run maximum)"

### How to Deploy the Fix

#### Option 1: Manual GitHub Actions Trigger (Recommended)
1. Go to: https://github.com/rahulptl/synapse/actions
2. Click "Deploy to Development (GCP Cloud Run)"
3. Click "Run workflow" → Select `dev` branch
4. Click "Run workflow" to deploy

#### Option 2: Local Build & Deploy
```bash
# Build and push backend image
cd backend
docker build -t gcr.io/synapse-473918/synapse-backend:latest .
docker push gcr.io/synapse-473918/synapse-backend:latest

# Deploy to Cloud Run
gcloud run deploy synapse-backend-dev \
  --image gcr.io/synapse-473918/synapse-backend:latest \
  --region asia-south1 \
  --platform managed
```

## Phase 2: Direct GCS Upload for Large Files (Future)

For files larger than 32MB, we need to implement **signed URL uploads**:

### Architecture
```
┌─────────┐                           ┌─────────────┐
│ Frontend│─────(1) Request URL───────>│   Backend   │
└─────────┘                           └─────────────┘
     │                                        │
     │                                   (2) Generate
     │                                    Signed URL
     │                                        │
     │         ┌─────────────────────────────┘
     │         │  Signed URL
     │         v
     │    ┌─────────────┐
     └────>│ Cloud       │
(3) Upload │ Storage     │
 Direct    │ (GCS)       │
           └─────────────┘
                  │
                  │ (4) Notify completion
                  v
           ┌─────────────┐
           │   Backend   │───> Process file
           └─────────────┘
```

### Implementation Steps (Not Yet Done)

1. **Backend: Add Signed URL Endpoint**
```python
# app/api/v1/endpoints/files.py
@router.post("/upload/signed-url")
async def get_upload_signed_url(
    filename: str,
    content_type: str,
    user_id: UUID = Depends(get_current_user)
):
    # Generate signed URL for direct GCS upload
    storage_path = f"{user_id}/{folder_id}/{filename}"
    signed_url = await storage_service.generate_upload_url(
        storage_path,
        content_type,
        expiration=3600  # 1 hour
    )
    return {"upload_url": signed_url, "storage_path": storage_path}
```

2. **Frontend: Direct Upload Flow**
```typescript
// For large files (>32MB)
if (file.size > 32 * 1024 * 1024) {
  // 1. Get signed URL
  const { upload_url, storage_path } = await apiClient.getUploadSignedUrl(
    file.name,
    file.type,
    auth
  );

  // 2. Upload directly to GCS
  await fetch(upload_url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type }
  });

  // 3. Notify backend to process
  await apiClient.notifyUploadComplete(storage_path, auth);
}
```

3. **Storage Service: Signed URL Generation**
```python
# app/core/storage.py
async def generate_upload_url(
    self,
    storage_path: str,
    content_type: str,
    expiration: int = 3600
) -> str:
    blob = self.bucket.blob(storage_path)
    url = blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(seconds=expiration),
        method="PUT",
        content_type=content_type
    )
    return url
```

## Current Limitations

### ✅ Works (0-32MB)
- Direct upload via FastAPI endpoint
- Real-time progress tracking
- Immediate processing

### ❌ Not Supported (>32MB)
- Files larger than 32MB will be rejected with 413 error
- Users will see: "File too large. Cloud Run has a 32MB request size limit."

## Alternative Solutions

### Option 1: Use Cloud Storage Transfer Service
- Users upload to a public GCS bucket
- Backend polls for new files
- More complex UX

### Option 2: Switch to App Engine Flexible
- Supports larger request sizes (32MB+)
- Higher costs
- Longer cold start times

### Option 3: Use Cloud Functions (2nd Gen)
- 32MB limit for HTTP
- Can use Cloud Storage triggers for larger files

## Recommendation

**Implement Phase 2 (Signed URL uploads)** for files >32MB:
- Best user experience
- Leverages GCS's native upload capabilities
- Supports files up to 5TB (GCS limit)
- No infrastructure changes needed
- Industry standard pattern

## Testing

### Test with <32MB file:
```bash
# Should succeed
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_30mb.pdf" \
  -F "title=Test Document" \
  -F "folder_id=$FOLDER_ID" \
  https://synapse-backend-dev-7e75zz4oja-el.a.run.app/api/v1/files/upload
```

### Test with >32MB file:
```bash
# Will fail with 413
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_50mb.pdf" \
  -F "title=Large Document" \
  -F "folder_id=$FOLDER_ID" \
  https://synapse-backend-dev-7e75zz4oja-el.a.run.app/api/v1/files/upload
```

## Summary

- ✅ **Immediate fix**: Updated limits to 32MB (Cloud Run maximum)
- ✅ **Better errors**: Users now see clear messages about the limit
- 🔄 **Future enhancement**: Implement signed URL uploads for >32MB files
- 📚 **Documentation**: This file explains the limitation and solutions

---

**Updated**: 2025-10-05
**Status**: Phase 1 complete | Phase 2 pending
