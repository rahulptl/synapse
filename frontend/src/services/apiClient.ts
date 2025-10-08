/**
 * Centralized API client for backend communication
 * Handles all authenticated requests to the Cloud SQL backend
 */

export interface ApiResponse<T = any> {
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

  async deleteFolder(folderId: string, auth: { userId: string; accessToken: string }) {
    return this.request(`/folders/${folderId}`, {
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
  async createContent(
    contentData: {
      title: string;
      content: string;
      content_type: string;
      folder_id: string;
      source_url?: string;
      metadata?: any;
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

  async uploadFileWithProgress(
    formData: FormData,
    auth: { userId: string; accessToken: string },
    onProgress: (progress: number) => void
  ): Promise<any> {
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

  // Large file upload with signed URLs (>32MB)
  async getSignedUploadUrl(
    data: {
      filename: string;
      content_type: string;
      folder_id: string;
      title: string;
      description?: string;
      file_size: number;
    },
    auth: { userId: string; accessToken: string }
  ): Promise<{ upload_url: string; storage_path: string; expires_in: number }> {
    return this.request('/files/upload/signed-url', {
      method: 'POST',
      body: JSON.stringify(data),
      auth,
    });
  }

  async uploadToSignedUrl(
    signedUrl: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            onProgress(percentComplete);
          }
        });
      }

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`GCS upload failed: ${xhr.statusText}`));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('GCS upload failed: Network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('GCS upload cancelled'));
      });

      // Upload to GCS with PUT method
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }

  async notifyUploadComplete(
    data: {
      storage_path: string;
      folder_id: string;
      title: string;
      description?: string;
      file_size: number;
      content_type: string;
    },
    auth: { userId: string; accessToken: string }
  ) {
    return this.request('/files/upload/complete', {
      method: 'POST',
      body: JSON.stringify(data),
      auth,
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
}

export const apiClient = new ApiClient();
