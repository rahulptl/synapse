# Cloud SQL Authentication Migration Guide

## Overview

This guide walks you through migrating from Supabase Auth to a custom Cloud SQL-based authentication system.

## What Changed

### Before (Supabase Auth)
- User authentication managed by Supabase Auth service
- JWT tokens issued by Supabase
- User data stored in Supabase `auth.users` table
- Profile data in `profiles` table

### After (Cloud SQL Auth)
- Custom authentication using bcrypt + JWT
- JWT tokens issued by our backend (FastAPI)
- User data stored in Cloud SQL `users` table
- Direct user management and control

## Authentication Methods Supported

The system now supports **triple authentication** for backward compatibility:

1. **API Keys** (Browser Extension) - Priority 1
   - Header: `x-api-key`
   - Used by: Browser extension

2. **Cloud SQL JWT** (New Web App) - Priority 2
   - Header: `Authorization: Bearer <token>`
   - Issued by: `/api/v1/cloud-auth/*` endpoints
   - Used by: New frontend implementation

3. **Supabase JWT** (Legacy Web App) - Priority 3
   - Header: `Authorization: Bearer <token>`
   - Issued by: Supabase Auth
   - Used by: Existing frontend (transitional)

All existing endpoints now use `validate_any_auth` dependency which tries authentication methods in order.

## New Database Tables

### `users` Table
```sql
id UUID PRIMARY KEY
email VARCHAR(255) UNIQUE NOT NULL
password_hash VARCHAR(255) NOT NULL
full_name VARCHAR(255)
is_active BOOLEAN DEFAULT TRUE
is_verified BOOLEAN DEFAULT FALSE
verification_token VARCHAR(255)
reset_token VARCHAR(255)
reset_token_expires TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
last_login TIMESTAMP
```

### `refresh_tokens` Table
```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL
token_hash VARCHAR(255) UNIQUE NOT NULL
expires_at TIMESTAMP NOT NULL
is_revoked BOOLEAN DEFAULT FALSE
created_at TIMESTAMP
user_agent TEXT
ip_address VARCHAR(45)
```

## New Authentication Endpoints

All endpoints are under `/api/v1/cloud-auth`:

### User Registration
```bash
POST /api/v1/cloud-auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123",
  "full_name": "John Doe"
}

Response:
{
  "access_token": "eyJ...",
  "refresh_token": "token...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "is_active": true,
    "is_verified": false,
    "created_at": "2025-01-XX",
    "last_login": null
  }
}
```

### User Login
```bash
POST /api/v1/cloud-auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123"
}

Response: (same as signup)
```

### Refresh Token
```bash
POST /api/v1/cloud-auth/refresh
Content-Type: application/json

{
  "refresh_token": "token..."
}

Response: (returns new access_token and refresh_token)
```

### Logout
```bash
POST /api/v1/cloud-auth/logout
Content-Type: application/json

{
  "refresh_token": "token..."
}

Response: {"message": "Logged out successfully"}
```

### Logout All Devices
```bash
POST /api/v1/cloud-auth/logout-all
Authorization: Bearer <access_token>

Response: {"message": "Logged out from N devices"}
```

### Email Verification
```bash
POST /api/v1/cloud-auth/verify-email
Content-Type: application/json

{
  "token": "verification_token_from_email"
}

Response: {"message": "Email verified successfully"}
```

### Password Reset Request
```bash
POST /api/v1/cloud-auth/password-reset/request
Content-Type: application/json

{
  "email": "user@example.com"
}

Response: {"message": "If the email exists, a password reset link has been sent"}
```

### Password Reset Confirm
```bash
POST /api/v1/cloud-auth/password-reset/confirm
Content-Type: application/json

{
  "token": "reset_token_from_email",
  "new_password": "NewSecurePass123"
}

Response: {"message": "Password reset successfully"}
```

### Change Password
```bash
POST /api/v1/cloud-auth/password/change
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "current_password": "SecurePass123",
  "new_password": "NewSecurePass456"
}

Response: {"message": "Password changed successfully. Please login again."}
```

### Get Current User
```bash
GET /api/v1/cloud-auth/me
Authorization: Bearer <access_token>

Response: (UserResponse object)
```

## Password Requirements

All passwords must meet these requirements:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit

## Token Lifetimes

- **Access Token**: 30 minutes
- **Refresh Token**: 7 days
- **Email Verification Token**: No expiration (one-time use)
- **Password Reset Token**: 1 hour

## Migration Steps

### Step 1: Apply Database Migration

```bash
# Connect to your Cloud SQL database
psql "host=localhost port=5432 dbname=local user=local_user"

# Run migration
\i backend/migrations/001_add_cloud_sql_auth_tables.sql
```

Apply to all environments (local, dev, prod).

### Step 2: Update Environment Variables

Add to your `.env` files:

```bash
# JWT Secret (generate a strong random key)
SECRET_KEY=your-256-bit-secret-key-here

# Environment
ENVIRONMENT=local  # or development, production
```

Generate a secure secret key:
```bash
openssl rand -hex 32
```

### Step 3: Update Frontend Authentication

#### Old Supabase Auth Code:
```typescript
// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})

// Get user
const { data: { user } } = await supabase.auth.getUser()
```

#### New Cloud SQL Auth Code:
```typescript
// Login
const response = await fetch('/api/v1/cloud-auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})
const { access_token, refresh_token, user } = await response.json()

// Store tokens
localStorage.setItem('access_token', access_token)
localStorage.setItem('refresh_token', refresh_token)

// Get user
const response = await fetch('/api/v1/cloud-auth/me', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  }
})
const user = await response.json()

// Refresh token when expired
const response = await fetch('/api/v1/cloud-auth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    refresh_token: localStorage.getItem('refresh_token')
  })
})
```

### Step 4: Update API Calls

All API calls should now include the access token:

```typescript
const response = await fetch('/api/v1/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  },
  body: JSON.stringify(chatRequest)
})
```

### Step 5: Implement Token Refresh Logic

```typescript
// Interceptor for automatic token refresh
async function apiCall(url, options = {}) {
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${localStorage.getItem('access_token')}`
    }
  })

  // If 401, try to refresh token
  if (response.status === 401) {
    const refreshResponse = await fetch('/api/v1/cloud-auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: localStorage.getItem('refresh_token')
      })
    })

    if (refreshResponse.ok) {
      const { access_token, refresh_token } = await refreshResponse.json()
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('refresh_token', refresh_token)

      // Retry original request
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${access_token}`
        }
      })
    } else {
      // Refresh failed, redirect to login
      window.location.href = '/login'
    }
  }

  return response
}
```

## Migration Timeline

### Phase 1: Backend Setup (Completed)
- ✅ Create authentication models
- ✅ Implement authentication service
- ✅ Create authentication endpoints
- ✅ Update security dependencies
- ✅ Create database migrations

### Phase 2: Database Migration
- [ ] Apply migrations to local database
- [ ] Test authentication endpoints locally
- [ ] Apply migrations to dev database
- [ ] Test on dev environment

### Phase 3: Frontend Migration
- [ ] Create authentication service/hooks
- [ ] Update login/signup pages
- [ ] Implement token refresh logic
- [ ] Update API call interceptors
- [ ] Test complete auth flow

### Phase 4: Production Migration
- [ ] Apply migrations to prod database
- [ ] Deploy backend with new auth endpoints
- [ ] Deploy frontend with new auth logic
- [ ] Monitor error rates
- [ ] Verify all users can authenticate

### Phase 5: Cleanup
- [ ] Remove Supabase Auth dependencies
- [ ] Remove `validate_supabase_token` (keep API key auth)
- [ ] Update documentation
- [ ] Remove Supabase environment variables

## Testing Checklist

### Backend Testing
- [ ] User signup with valid data
- [ ] User signup with invalid password (should fail)
- [ ] User signup with duplicate email (should fail)
- [ ] User login with correct credentials
- [ ] User login with wrong password (should fail)
- [ ] Access protected endpoint with valid token
- [ ] Access protected endpoint with expired token (should fail)
- [ ] Refresh access token with valid refresh token
- [ ] Refresh access token with revoked refresh token (should fail)
- [ ] Logout (revoke refresh token)
- [ ] Logout from all devices
- [ ] Password reset flow
- [ ] Email verification flow
- [ ] Password change with correct current password
- [ ] Password change with wrong current password (should fail)

### Frontend Testing
- [ ] User can sign up
- [ ] User can log in
- [ ] User can access protected pages
- [ ] Token automatically refreshes on expiry
- [ ] User can log out
- [ ] User is redirected to login when refresh token expires
- [ ] User can reset password
- [ ] User can change password

### API Key Testing (Extension)
- [ ] API key authentication still works
- [ ] Extension can make authenticated requests
- [ ] API key management endpoints work with new auth

## Rollback Plan

If issues occur, you can rollback:

```bash
# Rollback database changes
psql "host=localhost port=5432 dbname=local user=local_user" -f backend/migrations/001_rollback_auth_tables.sql

# Redeploy previous backend version
# Redeploy previous frontend version
```

## Security Considerations

1. **Secret Key**: Use a strong, randomly generated secret key for JWT signing
2. **HTTPS Only**: Always use HTTPS in production
3. **Token Storage**: Store tokens securely (httpOnly cookies or secure localStorage)
4. **Rate Limiting**: Implement rate limiting on auth endpoints
5. **Password Policy**: Enforce strong password requirements
6. **Email Verification**: Implement email verification before full account access
7. **Account Lockout**: Consider implementing account lockout after failed login attempts

## Email Service Integration

The current implementation logs password reset tokens instead of sending emails. To add email functionality:

1. Choose an email service (SendGrid, AWS SES, etc.)
2. Update `create_password_reset_token` to send emails
3. Update `create_user` to send verification emails
4. Add email templates

## Support and Troubleshooting

### Common Issues

**Issue: "Invalid or expired token"**
- Solution: Token may have expired. Try refreshing the token or logging in again.

**Issue: "Password must contain at least one uppercase letter"**
- Solution: Ensure password meets all requirements (8+ chars, uppercase, lowercase, digit)

**Issue: "User with this email already exists"**
- Solution: Use a different email or try logging in instead of signing up.

**Issue: Cannot connect to database**
- Solution: Check DATABASE_URL and CLOUD_SQL_CONNECTION_NAME in your .env file

### Contact

For issues or questions about the migration, refer to the project documentation or contact the development team.
