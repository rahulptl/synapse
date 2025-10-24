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
 */
export function getAvatarUrl(url?: string | null, profileUpdatedAt?: string | null): string | undefined {
  if (!url) return undefined;

  // Don't add cache-busting params to data URLs (base64 images)
  if (url.startsWith('data:')) {
    return url;
  }

  // If we have a profile update timestamp, append it as a cache-busting query param
  if (profileUpdatedAt) {
    const timestamp = new Date(profileUpdatedAt).getTime();
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${timestamp}`;
  }

  return url;
}