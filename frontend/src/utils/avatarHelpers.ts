import { resolveBackendBaseUrl } from '@/utils/backendUrl';

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Get cache-busted avatar URL by appending profile update timestamp
 * This ensures browsers fetch fresh avatars when profile changes on any device
 * Also converts relative backend URLs to absolute URLs for cross-origin loading
 */
export function getAvatarUrl(url?: string | null, profileUpdatedAt?: string | null): string | undefined {
  if (!url) return undefined;

  console.log('🖼️ Avatar URL Helper - Input:', url);

  // Don't modify data URLs (base64 images)
  if (url.startsWith('data:')) {
    console.log('🖼️ Avatar URL Helper - Data URL detected, returning as-is');
    return url;
  }

  // Convert relative backend URLs to absolute URLs
  // This is necessary when frontend and backend are on different domains
  const API_BASE_URL = resolveBackendBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  console.log('🖼️ Avatar URL Helper - Full URL:', fullUrl);

  // If we have a profile update timestamp, append it as a cache-busting query param
  if (profileUpdatedAt) {
    const timestamp = new Date(profileUpdatedAt).getTime();
    const separator = fullUrl.includes('?') ? '&' : '?';
    const finalUrl = `${fullUrl}${separator}v=${timestamp}`;
    console.log('🖼️ Avatar URL Helper - Cache-busted URL:', finalUrl);
    return finalUrl;
  }

  return fullUrl;
}
