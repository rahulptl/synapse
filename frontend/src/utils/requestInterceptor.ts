/**
 * Request Interceptor with Automatic Token Refresh
 * Handles API requests, token validation, and automatic token regeneration
 */

import { isTokenExpired, shouldRefreshToken, parseJWT } from './jwt';

// Request queue for retrying failed requests during token refresh
interface QueuedRequest {
  execute: () => Promise<Response>;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

export interface AuthData {
  accessToken: string;
  userId: string;
}

// Global state for the interceptor
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
let queuedRequests: QueuedRequest[] = [];
let refreshCallback: (() => Promise<boolean>) | null = null;

/**
 * Set the refresh token callback function
 * This should be called during app initialization
 */
export function setRefreshTokenCallback(callback: () => Promise<boolean>) {
  console.log('[REQUEST_INTERCEPTOR] Setting refresh token callback');
  refreshCallback = callback;
}

/**
 * Clear all queued requests (call this on logout)
 */
export function clearQueuedRequests() {
  console.log('[REQUEST_INTERCEPTOR] Clearing queued requests');
  queuedRequests.forEach(({ reject }) => {
    reject(new Error('User logged out'));
  });
  queuedRequests = [];
  isRefreshing = false;
  refreshPromise = null;
}

/**
 * Execute all queued requests
 */
function executeQueuedRequests() {
  console.log(`[REQUEST_INTERCEPTOR] Executing ${queuedRequests.length} queued requests`);
  const requests = queuedRequests.splice(0);
  requests.forEach(({ execute, resolve, reject }) => {
    execute()
      .then(resolve)
      .catch(reject);
  });
}

/**
 * Refresh the access token
 */
async function refreshAccessToken(): Promise<boolean> {
  if (!refreshCallback) {
    console.error('[REQUEST_INTERCEPTOR] No refresh callback set');
    return false;
  }

  try {
    console.log('[REQUEST_INTERCEPTOR] Starting token refresh');
    const success = await refreshCallback();

    if (success) {
      console.log('[REQUEST_INTERCEPTOR] Token refresh successful');
      executeQueuedRequests();
    } else {
      console.error('[REQUEST_INTERCEPTOR] Token refresh failed');
      clearQueuedRequests();
    }

    return success;
  } catch (error) {
    console.error('[REQUEST_INTERCEPTOR] Token refresh error:', error);
    clearQueuedRequests();
    return false;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

/**
 * Get current refresh promise or create new one
 */
function getRefreshPromise(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken();
  }
  return refreshPromise;
}

/**
 * Enhanced fetch with automatic token refresh
 * @param url Request URL
 * @param options Request options
 * @param getAuth Function to get current auth data
 * @returns Promise<Response>
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit,
  getAuth: () => AuthData | null
): Promise<Response> {
  const executeRequest = (): Promise<Response> => {
    const auth = getAuth();

    if (!auth) {
      console.error('[REQUEST_INTERCEPTOR] No auth data available');
      throw new Error('Authentication required');
    }

    // Check if token needs refresh before making request
    if (shouldRefreshToken(auth.accessToken)) {
      console.log('[REQUEST_INTERCEPTOR] Token needs refresh before request');

      if (!isRefreshing) {
        isRefreshing = true;
        console.log('[REQUEST_INTERCEPTOR] Starting token refresh');
        getRefreshPromise();
      }

      // Queue the request to be retried after refresh
      return new Promise<Response>((resolve, reject) => {
        queuedRequests.push({
          execute: () => executeRequest(),
          resolve,
          reject
        });
      });
    }

    // Proceed with the original request
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${auth.accessToken}`,
      'x-user-id': auth.userId,
    };

    console.log('[REQUEST_INTERCEPTOR] Making authenticated request:', {
      url,
      method: options.method || 'GET',
      hasAuth: !!auth.accessToken,
      tokenExpiry: parseJWT(auth.accessToken)?.exp
    });

    return fetch(url, {
      ...options,
      headers,
    });
  };

  try {
    const response = await executeRequest();

    console.log('[REQUEST_INTERCEPTOR] Request response:', {
      status: response.status,
      statusText: response.statusText,
      url
    });

    // Handle 401 Unauthorized errors
    if (response.status === 401) {
      console.log('[REQUEST_INTERCEPTOR] Received 401, attempting token refresh');

      const auth = getAuth();
      if (!auth) {
        console.error('[REQUEST_INTERCEPTOR] No auth data for 401 recovery');
        throw new Error('Authentication required');
      }

      // If token is expired, try to refresh and retry
      if (isTokenExpired(auth.accessToken)) {
        if (!isRefreshing) {
          isRefreshing = true;
          console.log('[REQUEST_INTERCEPTOR] Starting token refresh for 401 recovery');
          getRefreshPromise();
        }

        // Queue the request to be retried after refresh
        return new Promise<Response>((resolve, reject) => {
          queuedRequests.push({
            execute: () => executeRequest(),
            resolve,
            reject
          });
        });
      }
    }

    return response;
  } catch (error) {
    console.error('[REQUEST_INTERCEPTOR] Request error:', error);

    // If we get a network error and token refresh is in progress, queue the request
    if (error instanceof Error &&
        (error.message.includes('fetch') || error.message.includes('network')) &&
        isRefreshing) {

      console.log('[REQUEST_INTERCEPTOR] Network error during refresh, queueing request');
      return new Promise<Response>((resolve, reject) => {
        queuedRequests.push({
          execute: () => executeRequest(),
          resolve,
          reject
        });
      });
    }

    throw error;
  }
}

/**
 * Wrapper for API client methods
 * Provides automatic token refresh and retry logic
 */
export function withAuthInterceptor<T extends any[], R>(
  apiMethod: (...args: T) => Promise<R>,
  getAuth: () => AuthData | null
) {
  return async (...args: T): Promise<R> => {
    try {
      // First attempt
      return await apiMethod(...args);
    } catch (error) {
      console.log('[REQUEST_INTERCEPTOR] API method failed, checking for auth error:', error);

      // Check if it's an auth error
      if (error instanceof Error &&
          (error.message.includes('401') ||
           error.message.includes('Unauthorized') ||
           error.message.includes('Authentication'))) {

        const auth = getAuth();
        if (auth && isTokenExpired(auth.accessToken)) {
          console.log('[REQUEST_INTERCEPTOR] Auth error detected, refreshing token and retrying');

          if (!isRefreshing) {
            isRefreshing = true;
            getRefreshPromise();
          }

          // Wait for refresh and retry
          await getRefreshPromise();
          return await apiMethod(...args);
        }
      }

      throw error;
    }
  };
}

/**
 * Get interceptor status for debugging
 */
export function getInterceptorStatus() {
  return {
    isRefreshing,
    queuedRequestsCount: queuedRequests.length,
    hasRefreshCallback: !!refreshCallback
  };
}