/**
 * JWT Token Utilities
 * Handles token parsing, expiration checking, and validation
 */

// JWT token interface
export interface JWTPayload {
  exp: number; // Expiration time (Unix timestamp)
  iat: number; // Issued at time (Unix timestamp)
  sub: string; // Subject (usually user ID)
  [key: string]: unknown;
}

/**
 * Parse JWT token and return payload
 * @param token JWT token string
 * @returns Parsed payload or null if invalid
 */
export function parseJWT(token: string): JWTPayload | null {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[TOKEN_UTILS] Invalid JWT format');
      return null;
    }

    // Decode the payload (middle part)
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(decoded);

    // Validate required fields
    if (!parsed.exp || typeof parsed.exp !== 'number') {
      console.warn('[TOKEN_UTILS] JWT missing expiration claim');
      return null;
    }

    console.log('[TOKEN_UTILS] JWT parsed successfully', {
      exp: parsed.exp,
      userId: parsed.sub,
      timeToExpiry: parsed.exp - Math.floor(Date.now() / 1000)
    });

    return parsed as JWTPayload;
  } catch (error) {
    console.error('[TOKEN_UTILS] Failed to parse JWT:', error);
    return null;
  }
}

/**
 * Check if JWT token is expired
 * @param token JWT token string
 * @returns true if token is expired or invalid
 */
export function isTokenExpired(token: string): boolean {
  const payload = parseJWT(token);
  if (!payload) {
    return true; // Invalid token is considered expired
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const isExpired = payload.exp < currentTime;

  console.log('[TOKEN_UTILS] Token expiration check:', {
    currentTime,
    tokenExpiry: payload.exp,
    isExpired,
    timeToExpiry: payload.exp - currentTime
  });

  return isExpired;
}

/**
 * Get token expiration time in milliseconds
 * @param token JWT token string
 * @returns Expiration time in milliseconds or null if invalid
 */
export function getTokenExpirationTime(token: string): number | null {
  const payload = parseJWT(token);
  if (!payload) {
    return null;
  }

  return payload.exp * 1000; // Convert to milliseconds
}

/**
 * Check if token should be refreshed (within buffer time)
 * @param token JWT token string
 * @param bufferMinutes Buffer time in minutes before expiry (default: 5)
 * @returns true if token should be refreshed
 */
export function shouldRefreshToken(token: string, bufferMinutes: number = 5): boolean {
  const payload = parseJWT(token);
  if (!payload) {
    return true; // Invalid token should be refreshed
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const bufferSeconds = bufferMinutes * 60;
  const shouldRefresh = payload.exp < (currentTime + bufferSeconds);

  console.log('[TOKEN_UTILS] Token refresh check:', {
    currentTime,
    tokenExpiry: payload.exp,
    bufferTime: currentTime + bufferSeconds,
    shouldRefresh,
    timeToExpiry: payload.exp - currentTime,
    bufferMinutes
  });

  return shouldRefresh;
}

/**
 * Get remaining time until token expires (in seconds)
 * @param token JWT token string
 * @returns Remaining seconds or null if invalid
 */
export function getTokenRemainingTime(token: string): number | null {
  const payload = parseJWT(token);
  if (!payload) {
    return null;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - currentTime;

  console.log('[TOKEN_UTILS] Token remaining time:', {
    currentTime,
    tokenExpiry: payload.exp,
    remainingSeconds: remaining
  });

  return Math.max(0, remaining);
}

/**
 * Check if token is valid (not expired and properly formatted)
 * @param token JWT token string
 * @returns true if token is valid
 */
export function isTokenValid(token: string): boolean {
  const payload = parseJWT(token);
  if (!payload) {
    return false;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const isValid = payload.exp > currentTime;

  console.log('[TOKEN_UTILS] Token validation:', {
    currentTime,
    tokenExpiry: payload.exp,
    isValid,
    timeToExpiry: payload.exp - currentTime
  });

  return isValid;
}

/**
 * Get user ID from JWT token
 * @param token JWT token string
 * @returns User ID or null if invalid
 */
export function getUserIdFromToken(token: string): string | null {
  const payload = parseJWT(token);
  if (!payload) {
    return null;
  }

  return payload.sub || null;
}