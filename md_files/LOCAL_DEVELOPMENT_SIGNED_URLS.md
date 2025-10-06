# Local Development Setup for Signed URLs

## Quick Setup

### 1. Get Service Account Key

If you already have the key file (you created it for GitHub Actions):
```bash
# You should have this from earlier: service-account-key.json
# If not, create a new one:

gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=synapse-backend@synapse-473918.iam.gserviceaccount.com
```

### 2. Set Environment Variable

**macOS/Linux:**
```bash
# In your .env file or terminal
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# Or add to your .env file:
echo 'GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json' >> backend/.env
```

**Windows:**
```cmd
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account-key.json
```

### 3. Verify Setup

```bash
cd backend

# Test that credentials work
python3 -c "
from google.cloud import storage
client = storage.Client()
print('✓ Credentials loaded successfully')
print(f'✓ Project: {client.project}')
"
```

## How It Works

### Cloud Run (Production)
- Uses Application Default Credentials (ADC)
- No private key - just temporary tokens
- Calls IAM signBlob API to generate signatures
- **More secure** - no keys stored

### Local Development
- Uses service account key file
- Has private key included
- Standard `blob.generate_signed_url()` works
- **Easier to develop** - no API calls needed

## Testing Locally

### 1. Start Backend
```bash
cd backend
uvicorn app.main:app --reload
```

### 2. Start Frontend
```bash
cd frontend
npm run dev
```

### 3. Upload Large File
- Navigate to http://localhost:5173
- Select a file >32MB
- Upload should work with signed URLs

### 4. Check Logs
You should see:
```
INFO - Generating signed URL for path: user-123/folder-456/...
INFO - Using standard signed URL generation (local dev)
```

## Troubleshooting

### Error: "could not find default credentials"
**Solution**: Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

### Error: "you need a private key to sign credentials"
**Solution**: Your key file might be incomplete. Re-download:

```bash
gcloud iam service-accounts keys create new-key.json \
  --iam-account=synapse-backend@synapse-473918.iam.gserviceaccount.com
```

### Error: "Permission denied on bucket"
**Solution**: Grant storage permissions to service account

```bash
gcloud projects add-iam-policy-binding synapse-473918 \
  --member="serviceAccount:synapse-backend@synapse-473918.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

## Alternative: Use IAM API Locally Too

If you want to use the same IAM signBlob approach locally (no key file needed):

```python
# In backend/app/core/storage.py
# Remove the if/else and always use IAM API:

async def generate_signed_upload_url(self, ...):
    # Always use IAM API (both Cloud Run and local)
    from google.cloud import iam_credentials_v1
    import google.auth

    credentials, project = google.auth.default()
    service_account_email = "synapse-backend@synapse-473918.iam.gserviceaccount.com"

    def sign_blob(message):
        client = iam_credentials_v1.IAMCredentialsClient()
        name = f"projects/-/serviceAccounts/{service_account_email}"
        response = client.sign_blob(request={"name": name, "payload": message})
        return response.signed_blob

    # Use IAM signing
    ...
```

Then locally, you just need:
```bash
gcloud auth application-default login
```

## Recommended Approach

**For local development:**
- ✅ Use service account key file (simpler, faster)
- ✅ Set `GOOGLE_APPLICATION_CREDENTIALS` in .env
- ✅ Keep key file secure (add to .gitignore)

**For production (Cloud Run):**
- ✅ Use IAM API (more secure)
- ✅ No key files stored
- ✅ Automatic credential rotation

---

**Current Implementation**: Automatically detects environment and uses the appropriate method ✓
