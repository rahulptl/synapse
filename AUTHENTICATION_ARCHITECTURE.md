# Synapse - Authentication Architecture

## Overview

Your application uses a **dual authentication system** that supports both:
1. **Supabase JWT** (for web application)
2. **API Keys** (for browser extension)

This allows seamless integration between the web app and browser extension.

## Authentication Methods

### 1. Supabase JWT Authentication (Web App)

**How it works:**
- Users sign up/sign in via Supabase Auth (frontend)
- Supabase returns a JWT token
- Frontend stores JWT in localStorage (auto-managed by Supabase client)
- Backend validates JWT using Supabase JWT secret

**Frontend Implementation:**
```typescript
// frontend/src/hooks/useAuth.tsx
// Uses Supabase Auth SDK
const signIn = async (email, password) => {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
};

const signUp = async (email, password, fullName) => {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });
};
```

**Backend Validation:**
```python
# backend/app/core/security.py
async def validate_supabase_token(credentials: HTTPAuthorizationCredentials):
    # Decode JWT using Supabase JWT secret
    payload = jwt.decode(
        credentials.credentials,
        settings.SUPABASE_JWT_SECRET,
        algorithms=["HS256"],
        audience="authenticated"
    )

    user_id = payload.get("sub")
    email = payload.get("email")

    # Auto-create user profile if doesn't exist
    if not user_exists:
        create_profile(user_id, email)

    return {"user_id": user_id, "user": {...}}
```

**Headers sent by frontend:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. API Key Authentication (Browser Extension)

**How it works:**
- User creates API key via web app
- API key is stored in extension
- Extension sends API key with each request
- Backend validates API key against database

**Creating API Key (Web App):**
```python
# POST /api/v1/auth/api-keys
# Requires Supabase JWT authentication
async def create_api_key(
    api_key_data: ApiKeyCreate,
    auth_data: dict = Depends(validate_supabase_token)  # JWT required
):
    user_id = auth_data["user_id"]
    api_key = await api_key_service.create_api_key(
        db, user_id, name, expires_in_days
    )
    return api_key  # Returns the plain key (only shown once)
```

**Using API Key (Extension):**
```python
# backend/app/core/security.py
async def validate_api_key(api_key: str, requested_user_id: str):
    # Hash the API key
    legacy_hash = base64.encode(api_key)
    current_hash = base64.encode(sha256(api_key))

    # Find API key in database
    api_key_obj = db.query(ApiKey).filter(
        ApiKey.key_hash.in_([legacy_hash, current_hash])
    ).first()

    # Validate: active, not expired, matches user
    if not api_key_obj.is_active:
        raise HTTPException(401, "API key is not active")

    if api_key_obj.expires_at < now():
        raise HTTPException(401, "API key has expired")

    # Update last used timestamp
    api_key_obj.last_used_at = now()
    db.commit()

    return {"user_id": user_id, "user": {...}}
```

**Headers sent by extension:**
```
x-api-key: sk_abc123...
x-user-id: uuid-of-user
```

### 3. Dual Authentication (Smart Detection)

Most endpoints use `validate_dual_auth` which automatically detects which method to use:

```python
async def validate_dual_auth(
    x_api_key: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None)
):
    # Priority 1: API Key (for extension)
    if x_api_key:
        return await validate_api_key(x_api_key, x_user_id)

    # Priority 2: JWT (for web app)
    if authorization and authorization.startswith("Bearer "):
        return await validate_supabase_token(...)

    # No auth provided
    raise HTTPException(401, "Authentication required")
```

## Authentication Flow

### Web App Flow

```
1. User visits app
   ↓
2. Frontend: useAuth() checks Supabase session
   ↓
3. If no session → redirect to /auth
   ↓
4. User signs in/up via Supabase Auth
   ↓
5. Supabase returns JWT token
   ↓
6. Frontend stores JWT in localStorage
   ↓
7. Frontend includes JWT in API calls:
   Authorization: Bearer <jwt>
   ↓
8. Backend validates JWT
   ↓
9. Backend auto-creates user profile if new user
   ↓
10. User authenticated ✓
```

### Browser Extension Flow

```
1. User opens extension
   ↓
2. Extension checks for stored API key
   ↓
3. If no API key → prompt to create one in web app
   ↓
4. User creates API key in web app
   ↓
5. User copies API key to extension
   ↓
6. Extension stores API key
   ↓
7. Extension includes API key in requests:
   x-api-key: sk_abc123...
   x-user-id: user-uuid
   ↓
8. Backend validates API key
   ↓
9. User authenticated ✓
```

## User Profile Management

### Auto-Creation on First Login

When a user signs in with Supabase JWT for the first time, the backend automatically creates a profile:

```python
# backend/app/core/security.py (line 230-242)
if not user_obj:
    user_obj = Profile(
        user_id=user_id,  # From JWT
        email=email,      # From JWT
        full_name=payload.get("user_metadata", {}).get("full_name", ""),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    session.add(user_obj)
    await session.commit()
```

### Database Schema

**Profile Table:**
```sql
CREATE TABLE profiles (
    user_id UUID PRIMARY KEY,
    email VARCHAR NOT NULL,
    full_name VARCHAR,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

**API Key Table:**
```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES profiles(user_id),
    name VARCHAR NOT NULL,
    key_hash VARCHAR NOT NULL,  -- Hashed version of API key
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP
);
```

## API Endpoints

### Authentication Endpoints

#### 1. Validate API Key
```
POST /api/v1/auth/validate-api-key
Headers:
  x-api-key: <api-key>
  x-user-id: <user-id>

Response:
{
  "user_id": "uuid",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe"
  },
  "key_name": "My Extension Key",
  "valid": true
}
```

#### 2. Create API Key (Web App Only)
```
POST /api/v1/auth/api-keys
Headers:
  Authorization: Bearer <jwt>

Body:
{
  "name": "My Extension Key",
  "expires_in_days": 90
}

Response:
{
  "id": "uuid",
  "name": "My Extension Key",
  "key": "sk_abc123...",  // Only returned once!
  "expires_at": "2025-04-01T00:00:00Z",
  "created_at": "2025-01-01T00:00:00Z"
}
```

#### 3. List API Keys (Web App Only)
```
GET /api/v1/auth/api-keys
Headers:
  Authorization: Bearer <jwt>

Response:
[
  {
    "id": "uuid",
    "name": "My Extension Key",
    "key_preview": "sk_abc***",  // Masked
    "is_active": true,
    "expires_at": "2025-04-01T00:00:00Z",
    "last_used_at": "2025-01-15T10:30:00Z",
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

#### 4. Delete API Key (Web App Only)
```
DELETE /api/v1/auth/api-keys/{key_id}
Headers:
  Authorization: Bearer <jwt>

Response:
{
  "success": true,
  "message": "API key deleted successfully"
}
```

#### 5. Development Temp Key (Dev Only)
```
POST /api/v1/auth/dev/create-temp-api-key

Response:
{
  "id": "uuid",
  "name": "Development Temp Key",
  "key": "sk_dev123...",
  "expires_at": "2025-02-01T00:00:00Z"
}

Note: Only available when ENVIRONMENT=development
```

### Protected Endpoints (Dual Auth)

Most other endpoints use dual authentication:

```python
@router.get("/folders")
async def get_folders(
    auth_data: dict = Depends(validate_dual_auth)  # Accepts both JWT and API key
):
    user_id = auth_data["user_id"]
    # ... fetch folders for user
```

Supported endpoints with dual auth:
- `/api/v1/folders` (GET, POST, DELETE)
- `/api/v1/content` (GET, POST, DELETE)
- `/api/v1/files/upload` (POST)
- `/api/v1/search/text` (POST)
- `/api/v1/search/vector` (POST)
- `/api/v1/chat` (POST)

## Security Features

### API Key Security

1. **Hashing**: API keys are hashed before storage (SHA-256)
2. **One-time Display**: Plain key only shown once during creation
3. **Expiration**: Keys can expire after N days
4. **Revocation**: Keys can be deactivated without deletion
5. **Last Used Tracking**: Tracks when key was last used
6. **User Verification**: Optional user ID check for extra security

### JWT Security

1. **Secret Validation**: Uses Supabase JWT secret for validation
2. **Audience Check**: Validates `aud: "authenticated"`
3. **Expiration**: JWT has built-in expiration (managed by Supabase)
4. **Auto-Refresh**: Frontend auto-refreshes tokens (managed by Supabase)

### Development Mode

Special development mode when `ENVIRONMENT=development`:

```python
if settings.ENVIRONMENT == "development" and not settings.SUPABASE_JWT_SECRET:
    # Allow testing without JWT secret
    return {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "user": {
            "id": "00000000-0000-0000-0000-000000000001",
            "email": "dev@example.com",
            "full_name": "Development User"
        },
        "valid": True,
        "auth_method": "development_mode"
    }
```

## Configuration Required

### Backend (.env)

```bash
# Supabase Auth (for JWT validation)
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# For development without Supabase
ENVIRONMENT=development  # Enables dev mode
```

### Frontend (.env)

```bash
# Hardcoded in client.ts (should be moved to .env)
VITE_SUPABASE_URL=https://euabvloqnbuxffrwmljk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Current Supabase Setup

Based on the code, you're using:
- **Supabase URL**: `https://euabvloqnbuxffrwmljk.supabase.co`
- **Supabase Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Note:** These are hardcoded in `frontend/src/integrations/supabase/client.ts` - should be moved to environment variables.

## Migration to GCP Considerations

### Options for Authentication:

#### Option 1: Keep Supabase Auth (Recommended for now)
- ✅ Already implemented and working
- ✅ No changes needed
- ✅ Supabase Auth is independent of database/storage
- ✅ Just keep JWT secret in Secret Manager

```bash
# Add to Secret Manager
echo -n "YOUR_SUPABASE_JWT_SECRET" | gcloud secrets create supabase-jwt-secret --data-file=-

# Update Cloud Run deployment
--set-secrets "SUPABASE_JWT_SECRET=supabase-jwt-secret:latest"
```

#### Option 2: Migrate to Firebase Auth
- ❌ Requires rewriting auth logic
- ❌ Need to migrate users
- ✅ Better GCP integration
- ✅ Similar JWT-based flow

#### Option 3: Custom Auth with Google Identity Platform
- ❌ Most work to implement
- ✅ Full control
- ✅ Native GCP service

### Recommended Approach

**Keep Supabase Auth for now:**

1. **Store JWT secret in Secret Manager:**
```bash
# Get JWT secret from Supabase dashboard
# Settings → API → JWT Settings → JWT Secret

echo -n "YOUR_JWT_SECRET" | gcloud secrets create supabase-jwt-secret \
  --project=synapse \
  --data-file=-
```

2. **Update backend/.env.dev and .env.prod:**
```bash
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase
```

3. **Move frontend Supabase config to env:**
```typescript
// frontend/src/integrations/supabase/client.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
```

## Authentication Flow Diagram

```
┌─────────────┐                                    ┌──────────────┐
│  Web App    │                                    │   Extension  │
│  (React)    │                                    │  (Chrome)    │
└──────┬──────┘                                    └──────┬───────┘
       │                                                  │
       │ 1. Sign In/Up                                    │ 1. Get API Key
       ↓                                                  ↓
┌─────────────────┐                            ┌──────────────────┐
│ Supabase Auth   │                            │  Web App         │
│ (Returns JWT)   │                            │  (Create API Key)│
└────────┬────────┘                            └────────┬─────────┘
         │                                              │
         │ 2. JWT Token                                 │ 2. API Key
         ↓                                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                        Backend API                                │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              validate_dual_auth()                        │   │
│  │                                                          │   │
│  │  if x-api-key:                                          │   │
│  │      ├─→ validate_api_key() ─→ Check DB ─→ Return user │   │
│  │                                                          │   │
│  │  if Authorization Bearer:                               │   │
│  │      ├─→ validate_supabase_token() ─→ Check JWT ──→    │   │
│  │          Auto-create profile if needed ─→ Return user   │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────┐        ┌──────────────┐                       │
│  │   profiles   │        │   api_keys   │                       │
│  │              │        │              │                       │
│  │  user_id     │←───────│  user_id     │                       │
│  │  email       │        │  key_hash    │                       │
│  │  full_name   │        │  is_active   │                       │
│  │              │        │  expires_at  │                       │
│  └──────────────┘        └──────────────┘                       │
└───────────────────────────────────────────────────────────────────┘
```

## Summary

### Current State
- ✅ **Dual authentication working**
- ✅ **Supabase JWT for web app**
- ✅ **API Keys for extension**
- ✅ **Auto-profile creation**
- ✅ **Development mode for testing**

### For GCP Migration
- ✅ Keep Supabase Auth (no changes needed)
- ✅ Store `SUPABASE_JWT_SECRET` in Secret Manager
- ✅ Update frontend to use env vars instead of hardcoded values
- ✅ Everything else stays the same

### Security Best Practices
- ✅ API keys are hashed (SHA-256)
- ✅ JWT validation with secret
- ✅ Expiration support
- ✅ Last used tracking
- ✅ User verification

Your authentication is **solid and ready for production**! Just need to:
1. Get JWT secret from Supabase
2. Store it in GCP Secret Manager
3. Move frontend Supabase config to .env files
