# Testing Large File Upload

## Quick Test

### Prerequisites
1. Backend deployed and running
2. User authenticated with access token
3. Valid folder ID

### Test with Auto-Generated File

```bash
# Test 50MB file (uses signed URL)
python3 scripts/test_large_file_upload.py \
  --backend-url "https://synapse-backend-dev-7e75zz4oja-el.a.run.app" \
  --access-token "YOUR_ACCESS_TOKEN" \
  --user-id "YOUR_USER_ID" \
  --folder-id "YOUR_FOLDER_ID" \
  --create-file 50 \
  --title "Large File Test"

# Test 20MB file (uses standard upload)
python3 scripts/test_large_file_upload.py \
  --backend-url "https://synapse-backend-dev-7e75zz4oja-el.a.run.app" \
  --access-token "YOUR_ACCESS_TOKEN" \
  --user-id "YOUR_USER_ID" \
  --folder-id "YOUR_FOLDER_ID" \
  --create-file 20 \
  --title "Standard Upload Test"
```

### Test with Existing File

```bash
python3 scripts/test_large_file_upload.py \
  --backend-url "https://synapse-backend-dev-7e75zz4oja-el.a.run.app" \
  --access-token "YOUR_ACCESS_TOKEN" \
  --user-id "YOUR_USER_ID" \
  --folder-id "YOUR_FOLDER_ID" \
  --file-path "/path/to/your/large_file.pdf" \
  --title "My Large Document"
```

## Manual Testing via UI

### 1. Small File Test (≤32MB)
1. Login to the app
2. Navigate to a folder
3. Click "Upload" button
4. Select a file ≤32MB
5. Fill in title and description
6. Click "Upload"

**Expected Behavior:**
- ✅ Upload progress shows (real-time for >10MB)
- ✅ File uploads through Cloud Run
- ✅ Item appears in folder immediately
- ✅ Processing starts in background

### 2. Large File Test (>32MB)
1. Login to the app
2. Navigate to a folder
3. Click "Upload" button
4. Select a file >32MB (e.g., 50MB PDF)
5. You should see: "Large file detected - will upload directly to cloud storage"
6. Fill in title and description
7. Click "Upload"

**Expected Behavior:**
- ✅ Toast: "Large file detected - will upload directly to cloud storage (may take longer)"
- ✅ Upload progress shows (direct to GCS)
- ✅ No 413 error
- ✅ Item appears in folder immediately after upload
- ✅ Processing starts in background

### 3. Very Large File Test (>5GB)
1. Select a file >5GB
2. Should see error: "File too large, exceeds 5GB limit"
3. Upload button should not activate

## Manual Testing via cURL

### Get Access Token First
```bash
# Login to get access token
curl -X POST https://synapse-backend-dev-XXX.run.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "yourpassword"
  }'

# Save the access_token from response
export ACCESS_TOKEN="eyJ..."
export USER_ID="user-uuid"
export FOLDER_ID="folder-uuid"
```

### Test Signed URL Flow

```bash
# Step 1: Request signed URL
SIGNED_URL_RESPONSE=$(curl -X POST \
  https://synapse-backend-dev-XXX.run.app/api/v1/files/upload/signed-url \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-user-id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test_large.pdf",
    "content_type": "application/pdf",
    "folder_id": "'$FOLDER_ID'",
    "title": "Large File Test",
    "file_size": 50000000
  }')

echo "Signed URL Response: $SIGNED_URL_RESPONSE"

# Extract upload_url and storage_path
UPLOAD_URL=$(echo $SIGNED_URL_RESPONSE | jq -r '.upload_url')
STORAGE_PATH=$(echo $SIGNED_URL_RESPONSE | jq -r '.storage_path')

echo "Upload URL: $UPLOAD_URL"
echo "Storage Path: $STORAGE_PATH"

# Step 2: Upload to GCS
curl -X PUT \
  -H "Content-Type: application/pdf" \
  --data-binary @/path/to/large_file.pdf \
  "$UPLOAD_URL"

# Step 3: Notify backend
curl -X POST \
  https://synapse-backend-dev-XXX.run.app/api/v1/files/upload/complete \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-user-id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "storage_path": "'$STORAGE_PATH'",
    "folder_id": "'$FOLDER_ID'",
    "title": "Large File Test",
    "file_size": 50000000,
    "content_type": "application/pdf"
  }'
```

## Browser DevTools Testing

### 1. Monitor Network Activity

**For Small Files (≤32MB):**
```
1. Open DevTools → Network tab
2. Upload a small file
3. Look for: POST /api/v1/files/upload
4. Should see: 200 OK
5. Check request payload: multipart/form-data
```

**For Large Files (>32MB):**
```
1. Open DevTools → Network tab
2. Upload a large file
3. Should see THREE requests:

   a) POST /api/v1/files/upload/signed-url
      Status: 200
      Response: { upload_url, storage_path, expires_in }

   b) PUT https://storage.googleapis.com/...
      Status: 200
      Request: Binary file data
      (Direct to GCS - notice different domain!)

   c) POST /api/v1/files/upload/complete
      Status: 200
      Response: { success: true, item: {...} }
```

### 2. Monitor Console Logs

Look for:
```
✓ Large file detected: test_file.pdf (50.5MB)
✓ Requesting signed URL...
✓ Uploading to GCS...
✓ Upload progress: 50%
✓ Upload complete, notifying backend...
✓ Knowledge item created: item-uuid
```

## Performance Benchmarks

### Expected Upload Speeds

| File Size | Method | Expected Speed | Expected Time |
|-----------|--------|---------------|---------------|
| 10MB | Standard | 10-20 MB/s | 0.5-1s |
| 30MB | Standard | 10-20 MB/s | 1.5-3s |
| 50MB | Signed URL | 20-50 MB/s | 1-2.5s |
| 100MB | Signed URL | 20-50 MB/s | 2-5s |
| 500MB | Signed URL | 20-50 MB/s | 10-25s |

*Speeds depend on network connection and GCS region*

### Progress Tracking

- **Small files (<10MB)**: Simulated progress (200ms intervals)
- **Medium files (10-32MB)**: Real XMLHttpRequest progress
- **Large files (>32MB)**: Real XMLHttpRequest progress to GCS

## Troubleshooting

### Issue: "Failed to get signed URL"

**Check:**
```bash
# 1. Verify authentication
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-user-id: $USER_ID" \
  https://synapse-backend-dev-XXX.run.app/api/v1/folders

# 2. Check backend logs
gcloud logging read "resource.type=cloud_run_revision AND \
  textPayload=~'signed URL'" --limit 10

# 3. Verify service account permissions
gcloud projects get-iam-policy synapse-473918 \
  --flatten="bindings[].members" \
  --filter="bindings.members:synapse-backend@synapse-473918.iam.gserviceaccount.com"
```

### Issue: "GCS upload failed: 403"

**Check:**
- Signed URL may have expired (1 hour limit)
- Request a new signed URL
- Verify Content-Type header matches

### Issue: "Upload stuck at 0%"

**Check:**
```javascript
// In browser console
// Should see progress events
xhr.upload.onprogress = (e) => {
  console.log(`Progress: ${e.loaded}/${e.total}`);
};
```

### Issue: 413 Error Still Occurs

**Possible causes:**
1. File size check not working correctly
2. File size exactly 32MB (edge case)
3. Frontend code not deployed

**Fix:**
```bash
# Rebuild and deploy frontend
cd frontend
docker build -t gcr.io/synapse-473918/synapse-frontend:latest .
docker push gcr.io/synapse-473918/synapse-frontend:latest
gcloud run deploy synapse-frontend-dev \
  --image gcr.io/synapse-473918/synapse-frontend:latest \
  --region asia-south1
```

## Test Results Format

### Successful Test Output

```
============================================================
Testing Large File Upload (Signed URL Flow)
============================================================

File: test_file.pdf
Size: 50.00MB
Folder ID: abc-123-def
Title: Large File Test

[Step 1] Requesting signed URL from backend...
✓ Received signed URL (expires in 3600s)
  Storage path: user-123/folder-456/1234567890-abc12345-test_file.pdf

[Step 2] Uploading to Google Cloud Storage...
✓ Upload complete!
  Time: 2.34s
  Speed: 21.37 MB/s

[Step 3] Notifying backend of upload completion...
✓ Knowledge item created!
  Item ID: item-uuid-here
  Processing status: queued

============================================================
✅ Large file upload test PASSED
============================================================
```

## Automated Testing

### Run Test Suite
```bash
# Install dependencies
pip install requests

# Run comprehensive test
./scripts/test_large_file_upload.py \
  --backend-url "https://synapse-backend-dev-XXX.run.app" \
  --access-token "$ACCESS_TOKEN" \
  --user-id "$USER_ID" \
  --folder-id "$FOLDER_ID" \
  --create-file 50 \
  --title "Automated Test"

# Test multiple sizes
for size in 5 15 35 75 150; do
  echo "Testing ${size}MB file..."
  ./scripts/test_large_file_upload.py \
    --backend-url "https://synapse-backend-dev-XXX.run.app" \
    --access-token "$ACCESS_TOKEN" \
    --user-id "$USER_ID" \
    --folder-id "$FOLDER_ID" \
    --create-file $size \
    --title "Test ${size}MB"
done
```

## Success Criteria

✅ **Small Files (≤32MB)**
- [ ] Uploads through Cloud Run
- [ ] Progress tracking works
- [ ] Item appears immediately
- [ ] Processing starts

✅ **Large Files (>32MB)**
- [ ] No 413 error
- [ ] Three-step flow works (signed URL → GCS → notify)
- [ ] Progress tracking works
- [ ] Item appears immediately
- [ ] Processing starts

✅ **Very Large Files (>5GB)**
- [ ] Rejected with clear error message
- [ ] No upload attempted

---

**Last Updated**: 2025-10-05
**Status**: Ready for testing
