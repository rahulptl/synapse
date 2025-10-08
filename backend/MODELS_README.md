# Document Processing Models - Lazy Loading

## Overview

Synapse uses AI-powered document processing with Docling and EasyOCR. To optimize CI/CD builds and reduce disk space usage, we use **lazy loading** for all AI models.

## How It Works

### Production Deployment (Cloud Run, etc.)

1. **Docker build**: Models are NOT downloaded (~2.5GB savings in GitHub Actions)
2. **First request**: Models are automatically downloaded on first document upload/processing
   - Takes ~2-3 minutes (one-time)
   - Progress logged to application logs
3. **Subsequent requests**: Models are cached in `/app/.cache/`
   - Fast response times
   - No re-download needed
4. **Instance lifecycle**: Cached models persist across warm starts

### Local Development

For local development, you have two options:

#### Option 1: Lazy Loading (Recommended for Quick Testing)
```bash
# Just run the app - models download on first use
docker-compose up
# First document processing will take ~2-3 minutes
```

#### Option 2: Pre-download Models (Recommended for Development)
```bash
# Pre-download models before starting
cd backend
python scripts/download_models.py --languages en

# Then run the app
docker-compose up
# First document processing will be fast
```

## Models Downloaded

### Docling Models (~2-3 GB)
- **Layout Model**: Document structure understanding (headers, paragraphs, etc.)
- **TableFormer Model**: Advanced table extraction and structure recognition
- **Picture Classifier**: Image detection and classification
- **Code Formula Model**: Mathematical formula and code block detection

Stored in: `$HOME/.cache/docling/models/` or `DOCLING_SERVE_ARTIFACTS_PATH`

### EasyOCR Models (~500 MB per language)
- **Detection Model**: Text region detection
- **Recognition Model**: Character recognition for specified languages
- Default: English only (`en`)

Stored in: `$HOME/.EasyOCR/` or `EASYOCR_MODULE_PATH`

## Configuration

### Environment Variables

```bash
# Custom model cache locations (optional)
DOCLING_SERVE_ARTIFACTS_PATH=/custom/path/to/docling/models
EASYOCR_MODULE_PATH=/custom/path/to/easyocr

# OCR language configuration
OCR_LANGUAGES=en  # or en,es,fr for multiple languages

# GPU acceleration (if available)
ENABLE_GPU_ACCELERATION=false
```

### Disabling Smart Chunking (Optional)

If you don't need Docling's advanced features, you can disable smart chunking:

```bash
# In your environment or .env file
ENABLE_SMART_CHUNKING=false
```

This will:
- Use legacy chunking (no Docling models needed)
- Reduce memory usage
- Speed up first-time startup
- Trade-off: Lower quality chunking for complex documents

## Monitoring Model Downloads

### Application Logs

During first-time model download, you'll see logs like:

```
INFO - Initializing Docling DocumentConverter...
INFO - Downloading Docling models (this may take several minutes)...
INFO - ✅ Docling models downloaded successfully
INFO - Initializing EasyOCR Reader for languages: ['en']
INFO - Downloading EasyOCR model for 'en'...
INFO - ✅ EasyOCR model 'en' downloaded successfully
INFO - ✅ All models preloaded successfully in 145.32s
```

### Health Check

Check model status via API:

```bash
curl https://your-app.run.app/health
```

Response includes model loading status:
```json
{
  "status": "healthy",
  "models": {
    "docling": {
      "available": true,
      "loaded": true
    },
    "easyocr": {
      "available": true,
      "loaded": true
    }
  }
}
```

## Troubleshooting

### Issue: First request times out

**Symptom**: 504 Gateway Timeout on first document upload after deployment

**Solution**: Increase Cloud Run timeout to 5+ minutes for first request
```bash
gcloud run services update synapse-backend-dev \
  --timeout 300 \  # 5 minutes
  --region asia-south1
```

After models are cached, reduce timeout back to normal (60s).

### Issue: Models not persisting between requests

**Symptom**: Every request downloads models again

**Cause**: Cloud Run instance is scaling to zero and losing cache

**Solutions**:
1. Set minimum instances to 1:
   ```bash
   gcloud run services update synapse-backend-dev \
     --min-instances 1 \
     --region asia-south1
   ```

2. Use Cloud Run persistent volumes (beta):
   ```bash
   # Mount persistent volume for model cache
   gcloud run services update synapse-backend-dev \
     --add-volume name=models-cache,type=cloud-storage,bucket=your-model-bucket \
     --add-volume-mount volume=models-cache,mount-path=/app/.cache \
     --region asia-south1
   ```

### Issue: Out of memory during model loading

**Symptom**: `MemoryError` or container killed during initialization

**Solution**: Increase Cloud Run memory allocation:
```bash
gcloud run services update synapse-backend-dev \
  --memory 1Gi \  # Increased from 512Mi
  --region asia-south1
```

### Issue: Need to force model re-download

**Symptom**: Models corrupted or need update

**Solution**: Clear cache directory:
```bash
# SSH into container or use Cloud Run console
rm -rf /app/.cache/docling/models/*
rm -rf /app/.cache/easyocr/*
# Restart instance
```

## Performance Characteristics

| Scenario | First Request | Subsequent Requests |
|----------|---------------|---------------------|
| Cold start (no models) | ~2-3 minutes | N/A |
| Warm start (cached models) | ~5-10 seconds | ~2-5 seconds |
| Simple text extraction | ~1-2 seconds | ~0.5-1 second |
| Complex PDF with tables | ~5-10 seconds | ~3-5 seconds |

## Cost Optimization

### GitHub Actions
- **Before lazy loading**: ~2.5GB download per build
- **After lazy loading**: 0 bytes (models not downloaded)
- **Savings**: 100% reduction in CI/CD disk usage

### Cloud Run
- **Storage**: Models persist in instance cache (~3GB)
- **Network**: One-time download per instance (~3GB)
- **Cost**: Minimal (one-time egress, no storage charges)

### Recommendations
1. Use **minimum 1 instance** in production to maintain warm cache
2. Pre-warm production instances after deployment
3. Monitor model download times in logs
4. Consider Cloud Storage buckets for shared model cache across instances

## Migration from Build-Time Downloads

If upgrading from previous version with build-time downloads:

1. **Update Dockerfile**: Already done ✅
2. **First deployment**: Expect 2-3 minute delay on first document processing
3. **Monitor logs**: Watch for successful model downloads
4. **Verify health**: Check `/health` endpoint confirms models loaded
5. **Adjust timeouts**: Temporarily increase Cloud Run timeout if needed

## FAQ

**Q: Can I pre-download models in Docker image?**
A: Yes, use `--build-arg DOWNLOAD_MODELS=true` during local builds. Not recommended for production CI/CD.

**Q: Will models download every time container restarts?**
A: No, only on first use per instance. Warm starts reuse cached models.

**Q: Can I use a shared model cache across instances?**
A: Yes, mount a GCS bucket to `/app/.cache` using Cloud Run volumes.

**Q: What if I don't need all models?**
A: You can disable specific features (OCR, table extraction) in `model_loader.py` to reduce memory usage.

**Q: How much disk space do models use?**
A: ~2-3GB for Docling + ~500MB per OCR language = ~2.5-3.5GB total

---

**Last Updated**: 2025-01-08
**Related Files**:
- `backend/Dockerfile`
- `backend/app/services/model_loader.py`
- `backend/scripts/download_models.py`
