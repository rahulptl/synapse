# Zyph Extension - Environment Configuration Guide

This guide explains how to configure the Zyph Chrome Extension to work with different backend environments (local, dev, prod).

## Quick Start

### Method 1: Edit Config File (Recommended for Development)

1. Open `common/config.js`
2. Find this line (around line 26):
   ```javascript
   const DEFAULT_ENVIRONMENT = 'local';  // Options: 'local', 'dev', 'prod'
   ```
3. Change to your desired environment:
   - `'local'` - For local development (http://localhost:8000)
   - `'dev'` - For Cloud Run development (https://synapse-backend-dev-*.run.app)
   - `'prod'` - For production (https://synapse-backend-prod-*.run.app)

4. Save the file
5. Reload the extension in `chrome://extensions`

### Method 2: Runtime Switching (Coming Soon)

A UI toggle will be added to the popup to switch environments dynamically without reloading.

## Environment Configurations

### Local Development
```javascript
{
    name: 'Local Development',
    apiUrl: 'http://localhost:8000/api/v1',
    description: 'Running backend locally'
}
```

**When to use:**
- Developing backend changes locally
- Testing new features before deploying
- Debugging with local database

**Prerequisites:**
- Backend running on `http://localhost:8000`
- Database accessible locally (Cloud SQL via proxy)

### Development (Cloud)
```javascript
{
    name: 'Development (Cloud)',
    apiUrl: 'https://synapse-backend-dev-7e75zz4oja-el.a.run.app/api/v1',
    description: 'Cloud Run development environment'
}
```

**When to use:**
- Testing deployed dev backend
- Sharing work with team
- Testing with real Cloud SQL database

**Prerequisites:**
- Valid API key for dev environment
- Extension must have API key configured in popup

### Production
```javascript
{
    name: 'Production',
    apiUrl: 'https://synapse-backend-prod-XXXXXXXXXX-el.a.run.app/api/v1',
    description: 'Production Cloud Run environment'
}
```

**When to use:**
- Real usage
- Production data

**Prerequisites:**
- Valid production API key
- ⚠️ **Be careful** - this uses real data!

## Updating Backend URLs

When you redeploy the backend and the Cloud Run URL changes:

1. Get the new URL:
   ```bash
   # For dev:
   gcloud run services describe synapse-backend-dev \
     --region=asia-south1 \
     --format='value(status.url)'

   # For prod:
   gcloud run services describe synapse-backend-prod \
     --region=asia-south1 \
     --format='value(status.url)'
   ```

2. Update `common/config.js`:
   ```javascript
   dev: {
       name: 'Development (Cloud)',
       apiUrl: 'https://NEW-URL-HERE/api/v1',  // ← Update this
       description: 'Cloud Run development environment'
   }
   ```

3. Reload extension

## API Key Setup

### Local Development
1. Open popup
2. Click "Configure API Key"
3. Enter your local API key (generated from http://localhost:8000)
4. Extension will validate against local backend

### Cloud Environments (Dev/Prod)
1. Open web app at the Cloud Run frontend URL
2. Log in
3. Go to Settings → API Keys
4. Create new API key
5. Copy the key
6. In extension popup: "Configure API Key"
7. Paste and save

## Troubleshooting

### Extension not connecting to backend

**Check:**
1. Environment in `config.js` matches your intent
2. Backend URL is correct (check for typos)
3. `manifest.json` has host permissions:
   ```json
   "host_permissions": [
       "http://localhost:8000/*",
       "https://*.run.app/*"
   ]
   ```
4. Reload extension after config changes

### Mixed Content errors

If you see "Mixed Content" errors:
- Ensure Cloud Run URLs use `https://` not `http://`
- Check browser console for exact error

### API Key validation failing

1. Check which environment you're in (`config.js`)
2. Verify API key is for that environment
3. API keys are environment-specific (dev keys won't work for prod)
4. Try regenerating the API key in the web app

## Development Workflow

### Typical Flow

**Phase 1: Local Development**
```javascript
// config.js
const DEFAULT_ENVIRONMENT = 'local';
```
- Develop features locally
- Test with local backend
- Quick iteration

**Phase 2: Deploy to Dev & Test**
```bash
# Deploy backend
gcloud builds submit --config=backend/cloudbuild.yaml

# Update config.js with dev URL
# Reload extension
```
```javascript
// config.js
const DEFAULT_ENVIRONMENT = 'dev';
```
- Test with real Cloud SQL
- Share with team
- QA testing

**Phase 3: Production Release**
```bash
# Deploy to prod
gcloud builds submit --config=backend/cloudbuild.yaml \
  --substitutions=_ENV=prod,_ENVIRONMENT=production

# Update config.js
```
```javascript
// config.js
const DEFAULT_ENVIRONMENT = 'prod';
```

### Running Multiple Environments Simultaneously

You can't run different environments in the same browser profile, but you can:

1. **Use Chrome Profiles:**
   - Profile 1: Load extension with `local` config
   - Profile 2: Load extension with `dev` config
   - Profile 3: Load extension with `prod` config

2. **Use Different Browsers:**
   - Chrome: Local environment
   - Edge: Dev environment
   - Firefox: Prod environment

## File Structure

```
zyph-extension/
├── common/
│   ├── config.js          ← Environment configuration (edit this!)
│   └── zyph-api.js        ← API client (uses config.js)
├── manifest.json          ← Permissions (includes host_permissions)
├── popup/
│   └── popup.html         ← Includes config.js script
└── sidepanel/
    └── sidepanel.html     ← Includes config.js script
```

## Advanced: Programmatic Environment Switching

You can switch environments programmatically using:

```javascript
// In browser console or extension code
await window.ZyphConfig.setEnvironment('dev');

// Get current environment
const config = await window.ZyphConfig.getEnvironmentConfig();
console.log('Current environment:', config.name);

// Get all environments
const envs = window.ZyphConfig.getAllEnvironments();
console.log('Available:', Object.keys(envs));
```

This will be exposed in the popup UI in a future update.

## Need Help?

- Check backend is running: `curl <API_URL>/health`
- View extension console: Right-click extension → "Inspect popup"
- Check background logs: `chrome://extensions` → "Service worker" inspector
- Backend logs: `gcloud run services logs read synapse-backend-dev --region=asia-south1`
