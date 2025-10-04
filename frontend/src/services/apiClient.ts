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
}

export const apiClient = new ApiClient();
