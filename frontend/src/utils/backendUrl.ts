const DEFAULT_PORT = import.meta.env.VITE_BACKEND_API_PORT || '8000';

/**
 * Resolve the backend base URL for API calls.
 *
 * Priority:
 * 1. Explicit override passed in.
 * 2. Vite environment variable.
 * 3. Derived from the current window location (host IP support).
 * 4. Fallback to localhost for non-browser contexts.
 */
export function resolveBackendBaseUrl(override?: string): string {
  const candidate = override || import.meta.env.VITE_BACKEND_API_URL;
  if (candidate) {
    return candidate.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;

    // Use explicit port if provided via env, otherwise default to 8000.
    const port = import.meta.env.VITE_BACKEND_API_PORT || DEFAULT_PORT;

    // If the app is served from a standard port (80/443), keep backend port explicit.
    const needsPort = port !== '80' && port !== '443';
    const portSegment = needsPort ? `:${port}` : '';

    return `${protocol}//${hostname}${portSegment}`;
  }

  return `http://127.0.0.1:${DEFAULT_PORT}`;
}

/**
 * Resolve the WebSocket endpoint based on the resolved HTTP backend URL.
 */
export function resolveBackendWebSocketUrl(baseUrl?: string): string {
  const httpUrl = resolveBackendBaseUrl(baseUrl);
  if (httpUrl.startsWith('https://')) {
    return `wss://${httpUrl.slice('https://'.length)}`;
  }
  if (httpUrl.startsWith('http://')) {
    return `ws://${httpUrl.slice('http://'.length)}`;
  }
  // Fallback – assume HTTP if scheme already removed.
  return `ws://${httpUrl.replace(/^\/\//, '')}`;
}
