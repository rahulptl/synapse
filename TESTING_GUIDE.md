# Testing Guide - File Upload Improvements

## Quick Manual Tests

### Test 1: File Size Validation (Frontend)
1. Open the knowledge base page
2. Click "Add Content" → "Upload Files"
3. Try to select a file >200MB
4. **Expected**: Toast error shows: "File too large. Your file is X.XMB, but maximum size is 200MB"

### Test 2: Upload Dialog UI
1. Select 20+ files at once
2. **Expected**:
   - Dialog height stays within 90vh
   - File list is scrollable
   - "X files selected" header appears
   - "Clear all" button available
   - Scroll indicator shows: "↕ Scroll to see all files"
3. Select a file with very long filename (100+ chars)
4. **Expected**:
   - Filename truncates with ellipsis
   - Hover shows full filename in tooltip

### Test 3: Real Upload Progress
1. Upload a file >10MB
2. **Expected**:
   - Progress bar shows real upload percentage (via XHR)
   - Progress increases smoothly from 0-100%

### Test 4: Mobile Compact Cards
1. Open on mobile device or resize browser to <768px
2. **Expected**:
   - Cards show only: icon, title, status icon, timestamp
   - Tap to expand → shows: badge, preview, metadata
   - Swipe hint shows once, then disappears after swipe

## Automated Test Script

### Setup
```bash
# 1. Get your auth credentials
export ACCESS_TOKEN="your-access-token-here"
export USER_ID="your-user-id-here"
export FOLDER_ID="your-folder-id-here"

# 2. Optional: Set API URL (defaults to localhost:8000)
export API_URL="http://localhost:8000"
# OR for deployed version:
export API_URL="https://your-backend-url.com"
```

### Run Tests
```bash
python3 scripts/test_file_uploads.py
```

### Expected Output
```
==============================================================
File Upload Size Limit Tests
==============================================================

API URL: http://localhost:8000
User ID: abc12345...
Folder ID: def67890...

Step 1: Creating test files
Creating 10MB test file: test_10mb.dat
✓ Created: /tmp/test_10mb.dat (10.0MB)
...

Step 2: Testing uploads

Test: Small file - well under limit
Testing upload: test_10mb.dat (10.0MB)
Expected: SUCCESS
✓ SUCCESS: Upload completed
  Item ID: 12345678-...
  Status: queued

...

Test: Oversized file - exceeds 200MB limit
Testing upload: test_250mb.dat (250.0MB)
Expected: FAILURE
✓ EXPECTED FAILURE: File too large. Your file is 250.0MB, but maximum size is 200MB

==============================================================
Test Summary
==============================================================

✓ PASS: Small file - well under limit
✓ PASS: Medium file - under 200MB limit
✓ PASS: Large file - under 200MB limit
✓ PASS: Very large file - under 200MB limit
✓ PASS: Max size file - exactly at 200MB limit
✓ PASS: Oversized file - exceeds 200MB limit

Results: 6/6 tests passed
All tests passed!
```

## How to Get Auth Credentials

### Method 1: From Browser DevTools
1. Open your app in browser
2. Open DevTools (F12) → Network tab
3. Make any API request
4. Find the request → Headers tab
5. Copy:
   - `Authorization: Bearer <token>` → ACCESS_TOKEN
   - `x-user-id: <id>` → USER_ID

### Method 2: From Application State
1. Open browser console
2. Run: `localStorage.getItem('auth_token')`
3. Run: `localStorage.getItem('user_id')`

### Method 3: Create Test User
```bash
# Use your authentication system to create a test user
# Then extract the access token from the response
```

## Troubleshooting

### "Connection refused" error
- Check API is running: `curl http://localhost:8000/health`
- Verify API_URL is correct

### "Unauthorized" error
- Token may be expired - get fresh token
- Check token format: should be `Bearer <token>`

### "Folder not found" error
- Create a folder first via UI or API
- Get folder ID from response

### Upload hangs/times out
- Check backend logs for processing errors
- Increase timeout in test script if needed
- Verify backend can handle large files (Cloud Run timeout, etc.)

## Performance Benchmarks

### Expected Upload Times (on localhost)
- 10MB: ~1-2 seconds
- 50MB: ~3-5 seconds
- 100MB: ~6-10 seconds
- 200MB: ~12-20 seconds

### Expected Upload Times (on Cloud Run)
- 10MB: ~2-4 seconds
- 50MB: ~5-10 seconds
- 100MB: ~10-20 seconds
- 200MB: ~20-40 seconds

*Times vary based on network speed and server load*

## Success Criteria

✅ All 6 automated tests pass
✅ Frontend validation prevents >200MB uploads before upload attempt
✅ Backend rejects >200MB uploads with clear error message
✅ Upload dialog UI remains stable with 50+ files
✅ Real progress tracking works for files >10MB
✅ Mobile cards are 50% smaller when collapsed
✅ No UI distortion or layout breaking

## Next Steps After Testing

If all tests pass:
1. Commit changes
2. Deploy to staging
3. Run tests against staging
4. Deploy to production
5. Monitor error rates and upload metrics
