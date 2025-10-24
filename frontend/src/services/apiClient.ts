/**
 * Centralized API client for backend communication
 * Handles all authenticated requests to the Cloud SQL backend
 */

export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthHeaders {
  'Authorization': string;
  'x-user-id': string;
}

class ApiClient {
  private baseUrl: string;
  private apiVersionPath: string;
  private defaultHeaders: Record<string, string>;

  constructor() {
    const rawBaseUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
    // Remove trailing slash and ensure we don't double-add /api
    const normalizedBaseUrl = rawBaseUrl.replace(/\/$/, '');

    // Always use /api/v1 prefix - backend expects this
    if (normalizedBaseUrl.endsWith('/api/v1')) {
      this.baseUrl = normalizedBaseUrl.replace('/api/v1', '');
      this.apiVersionPath = '/api/v1';
    } else if (normalizedBaseUrl.endsWith('/api')) {
      this.baseUrl = normalizedBaseUrl.replace('/api', '');
      this.apiVersionPath = '/api/v1';
    } else {
      this.baseUrl = normalizedBaseUrl;
      this.apiVersionPath = '/api/v1';
    }

    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private getAuthHeaders(userId: string, accessToken: string): AuthHeaders {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'x-user-id': userId,
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { auth?: { userId: string; accessToken: string } } = {}
  ): Promise<T> {
    const { auth, ...fetchOptions } = options;

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...fetchOptions.headers,
    };

    // Add authentication headers if provided
    if (auth) {
      Object.assign(headers, this.getAuthHeaders(auth.userId, auth.accessToken));
    }

    const response = await fetch(this.buildUrl(endpoint), {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Folder operations
  private buildUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${this.apiVersionPath}${normalizedPath}`;
  }

  async getFolders(auth: { userId: string; accessToken: string }) {
    return this.request('/folders', { auth });
  }

  async createFolder(
    folderData: { name: string; description?: string; parent_id?: string },
    auth: { userId: string; accessToken: string }
  ) {
    return this.request('/folders', {
      method: 'POST',
      body: JSON.stringify(folderData),
      auth,
    });
  }

  async deleteFolder(folderId: string, auth: { userId: string; accessToken: string }, force: boolean = false) {
    const url = force ? `/folders/${folderId}?force=true` : `/folders/${folderId}`;
    return this.request(url, {
      method: 'DELETE',
      auth,
    });
  }

  async renameFolder(
    folderId: string,
    newName: string,
    auth: { userId: string; accessToken: string }
  ) {
    return this.request(`/folders/${folderId}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ new_name: newName }),
      auth,
    });
  }

  async getFolderContent(folderId: string, auth: { userId: string; accessToken: string }) {
    return this.request(`/folders/${folderId}/content`, { auth });
  }

  // Content operations
  async createTextEntry(
    textData: {
      title: string;
      content: string;
      folder_id: string;
      description?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
    auth: { userId: string; accessToken: string }
  ) {
    return this.request('/content/text', {
      method: 'POST',
      body: JSON.stringify(textData),
      auth,
    });
  }

  async createContent(
    contentData: {
      title: string;
      content: string;
      content_type: string;
      folder_id: string;
      source_url?: string;
      metadata?: Record<string, unknown>;
    },
    auth: { userId: string; accessToken: string }
  ) {
    return this.request('/content', {
      method: 'POST',
      body: JSON.stringify(contentData),
      auth,
    });
  }

  async getContent(contentId: string, auth: { userId: string; accessToken: string }) {
    return this.request(`/content/${contentId}`, { auth });
  }

  async deleteContent(contentId: string, auth: { userId: string; accessToken: string }) {
    return this.request(`/content/${contentId}`, {
      method: 'DELETE',
      auth,
    });
  }

  async reprocessContent(contentId: string, auth: { userId: string; accessToken: string }) {
    return this.request(`/content/${contentId}/reprocess`, {
      method: 'POST',
      auth,
    });
  }

  async renameContent(
    contentId: string,
    newTitle: string,
    auth: { userId: string; accessToken: string }
  ) {
    return this.request(`/content/${contentId}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ new_title: newTitle }),
      auth,
    });
  }

  async moveContent(
    contentId: string,
    targetFolderId: string,
    auth: { userId: string; accessToken: string }
  ) {
    return this.request(`/content/${contentId}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ target_folder_id: targetFolderId }),
      auth,
    });
  }

  async searchContentTitles(
    query: string,
    folderIds: string[] | null,
    limit: number = 10,
    auth: { userId: string; accessToken: string }
  ) {
    const params = new URLSearchParams({ q: query, limit: limit.toString() });
    if (folderIds && folderIds.length > 0) {
      params.set('folder_ids', folderIds.join(','));
    }
    return this.request(`/content/search-titles?${params.toString()}`, { auth });
  }

  // Get unified suggestions for both folders and files
  async getUnifiedSuggestions(
    query: string,
    auth: { userId: string; accessToken: string },
    limit: number = 20
  ) {
    const params = new URLSearchParams({ q: query, limit: limit.toString() });
    return this.request(`/content/unified-suggestions?${params.toString()}`, { auth });
  }

  // File operations
  async uploadFile(
    formData: FormData,
    auth: { userId: string; accessToken: string }
  ) {
    const headers: Record<string, string> = {
      ...this.getAuthHeaders(auth.userId, auth.accessToken),
    };

    const response = await fetch(this.buildUrl('/files/upload'), {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || `Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  async downloadItemFile(
    itemId: string,
    auth: { userId: string; accessToken: string }
  ): Promise<{ blob: Blob; filename?: string; contentType?: string }> {
    const response = await fetch(this.buildUrl(`/files/download/${itemId}`), {
      method: 'GET',
      headers: this.getAuthHeaders(auth.userId, auth.accessToken),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(errorText || `Download failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type') || undefined;
    const contentDisposition = response.headers.get('Content-Disposition');
    const filename = this.extractFilenameFromDisposition(contentDisposition);
    const blob = await response.blob();

    return { blob, filename, contentType };
  }

  
  async uploadFileWithProgress(
    formData: FormData,
    auth: { userId: string; accessToken: string },
    onProgress: (progress: number) => void
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject(new Error('Failed to parse response'));
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(new Error(errorData.detail || errorData.message || `Upload failed: ${xhr.statusText}`));
          } catch (e) {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed: Network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // Set up and send request
      xhr.open('POST', this.buildUrl('/files/upload'));
      xhr.setRequestHeader('Authorization', `Bearer ${auth.accessToken}`);
      xhr.setRequestHeader('x-user-id', auth.userId);

      xhr.send(formData);
    });
  }

  
  
  // Search operations
  async searchContent(
    searchData: {
      query: string;
      search_type?: 'vector' | 'text';
      folder_id?: string;
      content_types?: string[];
      limit?: number;
      similarity_threshold?: number;
    },
    auth: { userId: string; accessToken: string }
  ) {
    const { search_type = 'text', ...params } = searchData;

    if (search_type === 'vector') {
      return this.request('/search/vector', {
        method: 'POST',
        body: JSON.stringify(params),
        auth,
      });
    } else {
      return this.request('/search/text', {
        method: 'POST',
        body: JSON.stringify(params),
        auth,
      });
    }
  }

  // Chat operations
  async chatWithRag(
    chatData: {
      message: string;
      conversation_id?: string;
      user_id: string;
    },
    auth: { userId: string; accessToken: string }
  ) {
    return this.request('/chat', {
      method: 'POST',
      body: JSON.stringify(chatData),
      auth,
    });
  }

  async getConversations(auth: { userId: string; accessToken: string }) {
    return this.request('/chat/conversations', { auth });
  }

  async createConversation(
    conversationData: { title: string },
    auth: { userId: string; accessToken: string }
  ) {
    return this.request('/chat/conversations', {
      method: 'POST',
      body: JSON.stringify(conversationData),
      auth,
    });
  }

  async getConversationMessages(
    conversationId: string,
    auth: { userId: string; accessToken: string }
  ) {
    return this.request(`/chat/conversations/${conversationId}/messages`, { auth });
  }

  async deleteConversation(
    conversationId: string,
    auth: { userId: string; accessToken: string }
  ) {
    return this.request(`/chat/conversations/${conversationId}`, {
      method: 'DELETE',
      auth,
    });
  }

  // API Key management operations (only for web app with Cloud SQL auth)
  async createApiKey(
    apiKeyData: { name: string; expires_in_days?: number },
    auth: { userId: string; accessToken: string }
  ) {
    return this.request('/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify(apiKeyData),
      auth,
    });
  }

  async getApiKeys(auth: { userId: string; accessToken: string }) {
    return this.request('/auth/api-keys', { auth });
  }

  async deleteApiKey(
    apiKeyId: string,
    auth: { userId: string; accessToken: string }
  ) {
    return this.request(`/auth/api-keys/${apiKeyId}`, {
      method: 'DELETE',
      auth,
    });
  }

  // Save chat message to knowledge base
  async saveMessageToKnowledgeBase(
    messageId: string,
    data: {
      folder_id: string;
      title?: string;
      add_context?: boolean;
    },
    auth: { userId: string; accessToken: string }
  ) {
    return this.request(`/chat/messages/${messageId}/save-to-knowledge-base?folder_id=${data.folder_id}&title=${encodeURIComponent(data.title || '')}&add_context=${data.add_context !== false}`, {
      method: 'POST',
      auth,
    });
  }

  // Export folder as zip
  async exportFolderAsZip(
    folderId: string,
    auth: { userId: string; accessToken: string }
  ): Promise<Blob> {
    const headers: Record<string, string> = {
      ...this.getAuthHeaders(auth.userId, auth.accessToken),
    };

    const response = await fetch(this.buildUrl(`/content/export/folder/${folderId}`), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || `Export failed: ${response.statusText}`);
    }

    return response.blob();
  }

  // Export item as zip
  async exportItemAsZip(
    itemId: string,
    auth: { userId: string; accessToken: string }
  ): Promise<Blob> {
    const headers: Record<string, string> = {
      ...this.getAuthHeaders(auth.userId, auth.accessToken),
    };

    const response = await fetch(this.buildUrl(`/content/export/item/${itemId}`), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || `Export failed: ${response.statusText}`);
    }

    return response.blob();
  }

  // Helper to download blob as file
  downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  private extractFilenameFromDisposition(disposition: string | null): string | undefined {
    if (!disposition) {
      return undefined;
    }

    const filenameStarMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (filenameStarMatch?.[1]) {
      try {
        return decodeURIComponent(filenameStarMatch[1]);
      } catch {
        return filenameStarMatch[1];
      }
    }

    const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
    if (filenameMatch?.[1]) {
      return filenameMatch[1];
    }

    return undefined;
  }

  // Get signed download URL for content stored in cloud storage
  async getContentDownloadUrl(
    contentId: string,
    auth: { userId: string; accessToken: string },
    expirationHours: number = 1
  ): Promise<{ download_url: string; expires_in_seconds: number; storage_path: string }> {
    return this.request(`/content/${contentId}/download-url?expiration_hours=${expirationHours}`, {
      auth,
    });
  }

  // Get user storage usage information
  async getUserStorageUsage(auth: { userId: string; accessToken: string }): Promise<{
    used_bytes: number;
    total_bytes: number;
    used_percentage: number;
    used_formatted: string;
    total_formatted: string;
    stats?: {
      total_items: number;
      content_bytes: number;
      file_bytes: number;
      content_formatted: string;
      file_formatted: string;
    };
  }> {
    try {
      return this.request('/content/user/storage-usage', { auth });
    } catch (error) {
      // If endpoint doesn't exist, this will be handled by the component
      throw error;
    }
  }

  // Profile operations
  async getProfile(auth: { userId: string; accessToken: string }) {
    console.log('📡 API Client: Fetching profile...', auth);
    try {
      const result = await this.request('/cloud-auth/profile', { auth });
      console.log('✅ API Client: Profile fetched successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ API Client: Profile fetch error:', error);
      throw error;
    }
  }

  async updateProfile(
    profileData: Record<string, unknown>,
    auth: { userId: string; accessToken: string }
  ) {
    console.log('🔄 API Client: Updating profile...', { profileData, auth });
    try {
      const result = await this.request('/cloud-auth/profile', {
        method: 'PUT',
        body: JSON.stringify(profileData),
        auth,
      });
      console.log('✅ API Client: Profile updated successfully:', result);
      return result;
    } catch (error) {
      console.error('❌ API Client: Profile update error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        profileData: profileData
      });
      throw error;
    }
  }

  async uploadAvatar(file: File, auth: { userId: string; accessToken: string }) {
    console.log('📤 API Client: Uploading avatar...', { file: file.name, size: file.size, type: file.type, auth });

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(this.buildUrl('/cloud-auth/profile/avatar'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        'x-user-id': auth.userId,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ API Client: Avatar upload failed:', error);
      throw new Error(error.detail || 'Failed to upload avatar');
    }

    const result = await response.json();
    console.log('✅ API Client: Avatar uploaded successfully:', result);
    return result;
  }

  async deleteAvatar(auth: { userId: string; accessToken: string }) {
    console.log('🗑️ API Client: Deleting avatar...', auth);

    const response = await fetch(this.buildUrl('/cloud-auth/profile/avatar'), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        'x-user-id': auth.userId,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ API Client: Avatar deletion failed:', error);
      throw new Error(error.detail || 'Failed to delete avatar');
    }

    const result = await response.json();
    console.log('✅ API Client: Avatar deleted successfully:', result);
    return result;
  }

}

export const apiClient = new ApiClient();
