(function(global) {
    // Dynamic API_BASE_URL - loaded from config.js
    let API_BASE_URL = 'http://localhost:8000/api/v1'; // Fallback default
    const DEFAULT_FOLDER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // Load API URL from config on initialization
    (async function initializeApiUrl() {
        try {
            if (typeof window !== 'undefined' && window.ZyphConfig) {
                API_BASE_URL = await window.ZyphConfig.getApiBaseUrl();
                console.log('[ZyphApi] Initialized with API URL:', API_BASE_URL);
            }
        } catch (error) {
            console.warn('[ZyphApi] Failed to load API URL from config, using fallback:', error);
        }
    })();

    class ZyphApiError extends Error {
        constructor(message, options = {}) {
            super(message);
            this.name = 'ZyphApiError';
            this.status = options.status || null;
            this.body = options.body || null;
            this.code = options.code || null;
        }
    }

    class ZyphApiClient {
        constructor() {
            this.cachedAuth = null;
            this.cachedFolders = null;
            this.lastFolderFetch = 0;
            this.folderCacheTtl = DEFAULT_FOLDER_CACHE_TTL;
            this.authLoadPromise = null;
            this.apiBaseUrl = null;
        }

        async getApiBaseUrl() {
            // Try to get from config first
            if (typeof window !== 'undefined' && window.ZyphConfig) {
                try {
                    this.apiBaseUrl = await window.ZyphConfig.getApiBaseUrl();
                    return this.apiBaseUrl;
                } catch (error) {
                    console.warn('[ZyphApi] Failed to load API URL from config:', error);
                }
            }
            // Fallback to module-level constant
            return API_BASE_URL;
        }

        async loadAuthFromStorage() {
            if (this.cachedAuth) {
                return this.cachedAuth;
            }

            if (this.authLoadPromise) {
                return this.authLoadPromise;
            }

            this.authLoadPromise = new Promise(async (resolve) => {
                try {
                    const result = await chrome.storage.local.get('zyphRemoteAuth');
                    this.cachedAuth = result.zyphRemoteAuth || null;
                    resolve(this.cachedAuth);
                } catch (error) {
                    console.error('[ZyphApi] Failed to load auth from storage:', error);
                    this.cachedAuth = null;
                    resolve(null);
                } finally {
                    this.authLoadPromise = null;
                }
            });

            return this.authLoadPromise;
        }

        async getAuth() {
            return this.cachedAuth || this.loadAuthFromStorage();
        }

        async setAuth(auth) {
            const authPayload = auth ? {
                apiKey: auth.apiKey,
                userId: auth.userId || null,
                user: auth.user || null,
                keyName: auth.keyName || null,
                validatedAt: auth.validatedAt || new Date().toISOString()
            } : null;

            await chrome.storage.local.set({ zyphRemoteAuth: authPayload });
            this.cachedAuth = authPayload;
            if (!authPayload) {
                this.clearFolderCache();
            }
            return authPayload;
        }

        async clearAuth() {
            await chrome.storage.local.remove('zyphRemoteAuth');
            this.cachedAuth = null;
            this.clearFolderCache();
        }

        clearFolderCache() {
            this.cachedFolders = null;
            this.lastFolderFetch = 0;
        }

        buildHeaders(includeContentType = false, overrideKey) {
            const headers = new Headers();
            const auth = this.cachedAuth;

            if (!auth && !overrideKey) {
                throw new ZyphApiError('Missing Zyph API credentials', { code: 'NO_AUTH' });
            }

            const apiKey = overrideKey?.apiKey || auth?.apiKey;
            const userId = overrideKey?.userId ?? auth?.userId;

            headers.set('x-api-key', apiKey);
            if (userId) {
                headers.set('x-user-id', userId);
            }
            if (includeContentType) {
                headers.set('Content-Type', 'application/json');
            }
            return headers;
        }

        async validateApiKey(apiKey, userId = null) {
            const headers = this.buildHeaders(false, { apiKey, userId });
            headers.set('Content-Type', 'application/json');
            const baseUrl = await this.getApiBaseUrl();

            try {
                                const response = await fetch(`${baseUrl}/auth/validate-api-key`, {
                    method: 'POST',
                    headers
                });

                if (!response.ok) {
                    const body = await this.safeJson(response);
                    throw new ZyphApiError('Failed to validate API key', {
                        status: response.status,
                        body,
                        code: response.status === 401 ? 'UNAUTHORIZED' : 'VALIDATION_FAILED'
                    });
                }

                const data = await response.json();

                if (!data.valid) {
                    throw new ZyphApiError('API key is not valid', { code: 'INVALID_KEY', body: data });
                }

                const authPayload = {
                    apiKey,
                    userId: data.user_id || userId || null,
                    user: data.user || null,
                    keyName: data.key_name || null,
                    validatedAt: new Date().toISOString()
                };

                await this.setAuth(authPayload);
                return authPayload;
            } catch (error) {
                if (error instanceof ZyphApiError) {
                    throw error;
                }
                console.error('[ZyphApi] Unexpected error validating API key:', error);
                throw new ZyphApiError(error.message || 'Unexpected validation error', { code: 'NETWORK_ERROR' });
            }
        }

        async ensureAuth() {
            const auth = await this.getAuth();
            if (!auth || !auth.apiKey) {
                throw new ZyphApiError('Please connect your Zyph.com account in settings', { code: 'NO_AUTH' });
            }
            return auth;
        }

        async authenticatedFetch(path, options = {}) {
            await this.ensureAuth();

            const isFormData = options.body instanceof FormData;
            const headers = this.buildHeaders(!isFormData && options.body !== undefined);
            if (options.headers) {
                for (const [key, value] of Object.entries(options.headers)) {
                    headers.set(key, value);
                }
            }

            const fetchOptions = {
                method: options.method || 'GET',
                headers,
                body: undefined
            };

            if (options.body !== undefined) {
                if (isFormData) {
                    fetchOptions.body = options.body;
                } else {
                    fetchOptions.body = JSON.stringify(options.body);
                }
            }

            const baseUrl = await this.getApiBaseUrl();

            try {
                const response = await fetch(`${baseUrl}${path}`, fetchOptions);
                if (response.status === 401 || response.status === 403) {
                    await this.clearAuth();
                    const body = await this.safeJson(response);
                    throw new ZyphApiError('Authentication failed with Zyph.com', {
                        status: response.status,
                        body,
                        code: 'AUTH_REJECTED'
                    });
                }

                if (!response.ok) {
                    const body = await this.safeJson(response);
                    throw new ZyphApiError('Request to Zyph.com failed', {
                        status: response.status,
                        body,
                        code: 'REQUEST_FAILED'
                    });
                }

                return this.safeJson(response);
            } catch (error) {
                if (error instanceof ZyphApiError) {
                    throw error;
                }
                console.error('[ZyphApi] Network error calling Zyph.com:', error);
                throw new ZyphApiError(error.message || 'Network error contacting Zyph.com', { code: 'NETWORK_ERROR' });
            }
        }

        async safeJson(response) {
            try {
                return await response.clone().json();
            } catch (error) {
                return null;
            }
        }

        async fetchFolders({ forceRefresh = false } = {}) {
            await this.ensureAuth();

            const now = Date.now();
            const shouldRefresh = forceRefresh || !this.cachedFolders || (now - this.lastFolderFetch) > this.folderCacheTtl;

            if (!shouldRefresh) {
                return this.cachedFolders;
            }

            const data = await this.authenticatedFetch('/folders', { method: 'GET' });
            const folders = Array.isArray(data?.folders) ? data.folders : [];
            this.cachedFolders = folders;
            this.lastFolderFetch = Date.now();

            await chrome.storage.local.set({ zyphRemoteFolders: {
                fetchedAt: new Date().toISOString(),
                folders
            }});

            return folders;
        }

        async ingestContent(payload) {
            await this.ensureAuth();
            if (!payload || !payload.title || !payload.content || !payload.folder_id) {
                throw new ZyphApiError('Missing required fields for ingest', { code: 'BAD_PAYLOAD' });
            }

                        const body = await this.authenticatedFetch('/content', {
                method: 'POST',
                body: payload
            });
            return body;
        }

        async uploadFile({ file, fileName, folderId, title, description = '' }) {
            await this.ensureAuth();

            if (!file) {
                throw new ZyphApiError('File is required for upload', { code: 'BAD_PAYLOAD' });
            }
            if (!folderId) {
                throw new ZyphApiError('folder_id is required for upload', { code: 'BAD_PAYLOAD' });
            }
            if (!title) {
                throw new ZyphApiError('title is required for upload', { code: 'BAD_PAYLOAD' });
            }

            const fileBlob = file instanceof Blob ? file : new Blob([file], { type: 'application/octet-stream' });
            const derivedName = (file instanceof File && file.name) ? file.name : null;
            const uploadName = fileName || derivedName || 'upload.bin';

            const formData = new FormData();
            formData.append('file', fileBlob, uploadName);
            formData.append('folder_id', folderId);
            formData.append('title', title);
            if (description) {
                formData.append('description', description);
            }

                        return this.authenticatedFetch('/files/upload', {
                method: 'POST',
                body: formData
            });
        }

        async queryContent(payload) {
            await this.ensureAuth();
            if (!payload || !payload.query) {
                throw new ZyphApiError('Query text is required', { code: 'BAD_PAYLOAD' });
            }

                        return this.authenticatedFetch('/search/text', {
                method: 'POST',
                body: payload
            });
        }

        async getContent(contentId) {
            if (!contentId) {
                throw new ZyphApiError('contentId is required', { code: 'BAD_PAYLOAD' });
            }

            return this.authenticatedFetch(`/content/${contentId}`, {
                method: 'GET'
            });
        }

        async getFolderContent(folderId) {
            if (!folderId) {
                throw new ZyphApiError('folderId is required', { code: 'BAD_PAYLOAD' });
            }

                        return this.authenticatedFetch(`/folders/${folderId}/content`, {
                method: 'GET'
            });
        }

        async getFullContent(contentId) {
            if (!contentId) {
                throw new ZyphApiError('contentId is required', { code: 'BAD_PAYLOAD' });
            }

            return this.authenticatedFetch(`/content/${contentId}`, {
                method: 'GET'
            });
        }

        async createFolder(folderData) {
            await this.ensureAuth();

            if (!folderData || !folderData.name) {
                throw new ZyphApiError('Folder name is required', { code: 'BAD_PAYLOAD' });
            }

            const payload = {
                name: folderData.name,
                description: folderData.description || '',
                parent_id: folderData.parent_id || null
            };

            const result = await this.authenticatedFetch('/folders', {
                method: 'POST',
                body: payload
            });

            // Clear folder cache to trigger refresh
            this.clearFolderCache();

            return result;
        }

        async updateFolder(folderId, updateData) {
            await this.ensureAuth();

            if (!folderId) {
                throw new ZyphApiError('folderId is required', { code: 'BAD_PAYLOAD' });
            }

            if (!updateData || (!updateData.name && !updateData.description && updateData.parent_id === undefined)) {
                throw new ZyphApiError('At least one field (name, description, or parent_id) must be provided', { code: 'BAD_PAYLOAD' });
            }

            const payload = {};
            if (updateData.name !== undefined) payload.name = updateData.name;
            if (updateData.description !== undefined) payload.description = updateData.description;
            if (updateData.parent_id !== undefined) payload.parent_id = updateData.parent_id;

            const result = await this.authenticatedFetch(`/folders/${folderId}`, {
                method: 'PUT',
                body: payload
            });

            // Clear folder cache to trigger refresh
            this.clearFolderCache();

            return result;
        }

        async deleteFolder(folderId) {
            await this.ensureAuth();

            if (!folderId) {
                throw new ZyphApiError('folderId is required', { code: 'BAD_PAYLOAD' });
            }

            const result = await this.authenticatedFetch(`/folders/${folderId}`, {
                method: 'DELETE'
            });

            // Clear folder cache to trigger refresh
            this.clearFolderCache();

            return result;
        }
    }

    global.Zyph = global.Zyph || {};
    global.Zyph.Api = new ZyphApiClient();
    global.Zyph.ZyphApiError = ZyphApiError;
})(typeof self !== 'undefined' ? self : this);
