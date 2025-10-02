// Create global namespace
window.Zyph = window.Zyph || {};

window.Zyph.FolderManager = class FolderManager {
    constructor() {
        this.folders = [];
        this.selectedFolder = null;
        this.remoteFolders = [];
        this.remoteFolderMap = {};
        this.remoteStatus = { state: 'idle' };
        this.remoteFetchInFlight = null;
        this.folderMetadata = {};
        this.metadataLoaded = false;
        this.cachedRemoteOptions = [];
    }

    async loadFolders({ forceRefresh = false } = {}) {
        await this.loadMetadata();
        await this.ensureRemoteFolders({ forceRefresh });
        this.folders = this.buildLocalFolderList(this.remoteFolders);
        await this.persistMetadata();
        return this.folders;
    }

    async loadMetadata() {
        if (this.metadataLoaded) {
            return;
        }
        try {
            const result = await chrome.storage.local.get('zyphFolderMeta');
            this.folderMetadata = result.zyphFolderMeta || {};
        } catch (error) {
            console.warn('[FolderManager] Failed to load folder metadata:', error);
            this.folderMetadata = {};
        } finally {
            this.metadataLoaded = true;
        }
    }

    async persistMetadata() {
        try {
            await chrome.storage.local.set({ zyphFolderMeta: this.folderMetadata });
        } catch (error) {
            console.error('[FolderManager] Failed to persist folder metadata:', error);
        }
    }

    getOrCreateMetadata(folderId) {
        if (!folderId) {
            return {
                icon: 'folder',
                expanded: true,
                context: {
                    summary: null,
                    lastUpdated: null,
                    isGenerating: false
                }
            };
        }

        if (!this.folderMetadata[folderId]) {
            this.folderMetadata[folderId] = {
                icon: 'folder',
                expanded: true,
                context: {
                    summary: null,
                    lastUpdated: null,
                    isGenerating: false
                }
            };
        } else {
            const meta = this.folderMetadata[folderId];
            if (!meta.context) {
                meta.context = {
                    summary: null,
                    lastUpdated: null,
                    isGenerating: false
                };
            }
            if (typeof meta.expanded === 'undefined') {
                meta.expanded = true;
            }
            if (!meta.icon) {
                meta.icon = 'folder';
            }
        }

        return this.folderMetadata[folderId];
    }

    buildLocalFolderList(nodes, parentId = null) {
        if (!Array.isArray(nodes) || nodes.length === 0) {
            return [];
        }

        const list = [];

        nodes.forEach(node => {
            const meta = this.getOrCreateMetadata(node.id);
            const folder = {
                id: node.id,
                name: node.name,
                icon: meta.icon || 'folder',
                parentId,
                children: [],
                expanded: meta.expanded !== false,
                context: { ...meta.context },
                remote: {
                    id: node.id,
                    name: node.name,
                    path: node.path || this.buildRemotePath(node, parentId),
                    description: node.description || null,
                    depth: typeof node.depth === 'number' ? node.depth : null
                }
            };

            if (Array.isArray(node.children) && node.children.length > 0) {
                const childFolders = this.buildLocalFolderList(node.children, node.id);
                folder.children = childFolders.map(child => child.id);
                list.push(folder, ...childFolders);
            } else {
                list.push(folder);
            }
        });
        return list;
    }

    buildRemotePath(node, parentId) {
        if (node.path) {
            return node.path;
        }
        if (!parentId) {
            return node.name;
        }
        const parentMeta = this.remoteFolderMap[parentId];
        if (parentMeta?.path) {
            return `${parentMeta.path}/${node.name}`;
        }
        return node.name;
    }

    async ensureRemoteFolders({ forceRefresh = false } = {}) {
        if (!window?.Zyph?.Api) {
            this.remoteStatus = { state: 'unavailable', reason: 'API module missing' };
            return [];
        }

        if (!forceRefresh && this.remoteStatus.state === 'ready' && this.remoteFolders.length > 0) {
            return this.remoteFolders;
        }

        if (this.remoteFetchInFlight) {
            return this.remoteFetchInFlight;
        }

        this.remoteFetchInFlight = this.refreshRemoteFolders({ forceRefresh })
            .finally(() => {
                this.remoteFetchInFlight = null;
            });

        return this.remoteFetchInFlight;
    }

    async refreshRemoteFolders({ forceRefresh = false } = {}) {
        this.remoteStatus = { state: 'loading' };
        this.notifyRemoteFoldersUpdated();

        // Show loading state in UI if available
        if (window?.Zyph?.UIManager?.showFolderLoadingState) {
            window.Zyph.UIManager.showFolderLoadingState();
        }

        try {
            const folders = await window.Zyph.Api.fetchFolders({ forceRefresh });
            this.remoteFolders = Array.isArray(folders) ? folders : [];
            this.remoteFolderMap = {};

            const flatOptions = this.flattenRemoteFolders(this.remoteFolders);
            this.cachedRemoteOptions = flatOptions;
            flatOptions.forEach(option => {
                this.remoteFolderMap[option.id] = option;
            });

            this.remoteStatus = {
                state: 'ready',
                count: flatOptions.length,
                fetchedAt: new Date().toISOString()
            };

            try {
                await chrome.storage.local.set({
                    zyphRemoteFolders: {
                        fetchedAt: new Date().toISOString(),
                        folders: this.remoteFolders,
                        flat: flatOptions
                    }
                });
            } catch (storageError) {
                console.warn('[FolderManager] Failed to cache remote folders:', storageError);
            }

            this.notifyRemoteFoldersUpdated();
            return this.remoteFolders;
        } catch (error) {
            this.remoteFolders = [];
            this.remoteFolderMap = {};
            this.cachedRemoteOptions = [];
            this.remoteStatus = {
                state: 'error',
                message: error?.message || 'Failed to load Zyph.com folders',
                code: error?.code || null
            };
            console.error('[FolderManager] Unable to refresh remote folders:', error);
            this.notifyRemoteFoldersUpdated();
            throw error;
        }
    }

    flattenRemoteFolders(folders, prefix = '', depth = 0, parentId = null) {
        if (!Array.isArray(folders)) {
            return [];
        }

        const options = [];
        folders.forEach(folder => {
            const path = folder.path || `${prefix}${folder.name}`;
            options.push({
                id: folder.id,
                name: folder.name,
                path,
                depth: folder.depth ?? depth,
                description: folder.description || null,
                parentId
            });

            if (Array.isArray(folder.children) && folder.children.length > 0) {
                const childPrefix = folder.path ? '' : `${path}/`;
                const nextDepth = typeof folder.depth === 'number' ? folder.depth + 1 : depth + 1;
                options.push(...this.flattenRemoteFolders(folder.children, childPrefix, nextDepth, folder.id));
            }
        });
        return options;
    }

    getRemoteStatus() {
        return this.remoteStatus;
    }

    getRemoteFolderOptions() {
        return this.cachedRemoteOptions;
    }

    getRemoteFolderMeta(remoteFolderId) {
        if (!remoteFolderId) {
            return null;
        }
        return this.remoteFolderMap[remoteFolderId] || null;
    }

    findFolderById(folderId) {
        return this.folders.find(folder => folder.id === folderId);
    }

    getRootFolders() {
        return this.folders.filter(folder => !folder.parentId);
    }

    getChildFolders(parentId) {
        return this.folders.filter(folder => folder.parentId === parentId);
    }

    getFolderHierarchy() {
        const buildHierarchy = (folders, parentId = null) => {
            return folders
                .filter(folder => folder.parentId === parentId)
                .map(folder => ({
                    ...folder,
                    children: buildHierarchy(folders, folder.id)
                }));
        };

        return buildHierarchy(this.folders);
    }

    toggleFolder(folderId) {
        const folder = this.findFolderById(folderId);
        if (!folder) {
            return false;
        }
        const meta = this.getOrCreateMetadata(folderId);
        folder.expanded = !folder.expanded;
        meta.expanded = folder.expanded;
        this.persistMetadata();
        return folder.expanded;
    }

    selectFolder(folder) {
        this.selectedFolder = folder;
        return folder;
    }

    async loadFolderContent(folderId) {
        try {
            // First, try to load content from API (primary source)
            let folderContent = [];

            if (window?.Zyph?.Api) {
                try {
                    console.log(`[FolderManager] Loading content from API for folder ${folderId}`);
                    console.log(`[FolderManager] API client available:`, !!window.Zyph.Api);
                    console.log(`[FolderManager] Calling getFolderContent with folderId:`, folderId);
                    const remoteData = await window.Zyph.Api.getFolderContent(folderId);
                    console.log(`[FolderManager] API response received:`, remoteData);
                    const remoteContent = remoteData?.items || remoteData?.content || [];
                    console.log(`[FolderManager] Extracted content:`, remoteContent);
                    console.log(`[FolderManager] Content is array:`, Array.isArray(remoteContent));
                    console.log(`[FolderManager] Content length:`, remoteContent?.length);

                    if (Array.isArray(remoteContent) && remoteContent.length > 0) {
                        // Transform API content to match expected format
                        folderContent = remoteContent.map(item => ({
                            id: item.id || Zyph.Utils.generateId(),
                            type: this.mapRemoteContentType(item.content_type),
                            folderId: folderId,
                            title: item.title || 'Untitled',
                            content: item.content || '',
                            url: item.source_url || null,
                            favicon: item.source_url ? Zyph.Utils.getDefaultFavicon(item.source_url) : '',
                            domain: item.source_url ? Zyph.Utils.getDomainFromUrl(item.source_url) : null,
                            timestamp: item.created_at || new Date().toISOString(),
                            metadata: {
                                remoteSync: {
                                    state: 'synced',
                                    remoteContentId: item.id,
                                    syncedAt: new Date().toISOString()
                                },
                                syncedFromRemote: true,
                                isFileContent: this.isFileContent(item),
                                needsPull: false,
                                originalContentType: item.content_type
                            }
                        }));

                        console.log(`[FolderManager] Loaded ${folderContent.length} items from API for folder ${folderId}`);
                        return folderContent;
                    }
                } catch (apiError) {
                    console.error(`[FolderManager] API call failed for folder ${folderId}:`, apiError);
                    console.error(`[FolderManager] API error details:`, {
                        message: apiError.message,
                        code: apiError.code,
                        status: apiError.status,
                        body: apiError.body
                    });
                    // Fall through to local storage fallback
                }
            }

            // Fallback to local storage if API fails or returns no content
            console.log(`[FolderManager] Falling back to local storage for folder ${folderId}`);
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            folderContent = allContent
                .filter(item => item.folderId === folderId)
                .filter(item => {
                    // Only show items that are successfully synced to zyph.com
                    const remoteSync = item.metadata?.remoteSync;
                    return remoteSync?.state === 'synced' && remoteSync?.remoteContentId;
                })
                .map(item => ({ ...item }));

            await this.hydrateSessionPayloads(folderContent);

            // Try to sync with remote to add any missing items from API
            await this.syncFolderContentWithRemote(folderId, folderContent);

            // Reload from local storage after sync
            const updatedResult = await chrome.storage.local.get('zyphContent');
            const updatedAllContent = updatedResult.zyphContent || [];
            const updatedFolderContent = updatedAllContent
                .filter(item => item.folderId === folderId)
                .filter(item => {
                    const remoteSync = item.metadata?.remoteSync;
                    return remoteSync?.state === 'synced' && remoteSync?.remoteContentId;
                })
                .map(item => ({ ...item }));

            await this.hydrateSessionPayloads(updatedFolderContent);

            console.log(`[FolderManager] Loading content for folder ${folderId}: ${updatedFolderContent.length} items found`);
            console.log(`[FolderManager] Total content in storage: ${updatedAllContent.length} items`);
            return updatedFolderContent;
        } catch (error) {
            console.error('Error loading folder content:', error);
            return [];
        }
    }

    async syncFolderContentWithRemote(folderId, localContent) {
        try {
            if (!window?.Zyph?.Api) {
                console.log('[FolderManager] API unavailable, skipping remote sync');
                return;
            }

            console.log('[FolderManager] Starting sync with remote for folder:', folderId);

            // Get remote content for this folder
            const remoteData = await window.Zyph.Api.getFolderContent(folderId);
            const remoteContent = remoteData?.items || remoteData?.content || [];

            if (!Array.isArray(remoteContent)) {
                console.log('[FolderManager] No remote content data, skipping sync');
                return;
            }

            // Create map of remote content IDs that exist on zyph.com
            const remoteContentIds = new Set();
            const remoteContentMap = new Map();
            remoteContent.forEach(item => {
                if (item.id) {
                    remoteContentIds.add(item.id);
                    remoteContentMap.set(item.id, item);
                }
            });

            // Create map of local content by remote content ID
            const localContentByRemoteId = new Map();
            localContent.forEach(localItem => {
                const remoteSync = localItem.metadata?.remoteSync;
                if (remoteSync?.state === 'synced' && remoteSync.remoteContentId) {
                    localContentByRemoteId.set(remoteSync.remoteContentId, localItem);
                }
            });

            // Find local items that have remoteSync data but no longer exist remotely
            const itemsToDelete = [];
            localContent.forEach(localItem => {
                const remoteSync = localItem.metadata?.remoteSync;
                if (remoteSync?.state === 'synced' && remoteSync.remoteContentId) {
                    // This item was previously synced to remote
                    if (!remoteContentIds.has(remoteSync.remoteContentId)) {
                        // But it no longer exists on zyph.com, so delete it locally
                        itemsToDelete.push(localItem.id);
                    }
                }
            });

            // Find remote items that don't exist locally and add them
            const itemsToAdd = [];
            for (const remoteItem of remoteContent) {
                if (!localContentByRemoteId.has(remoteItem.id)) {
                    const isFileContent = this.isFileContent(remoteItem);
                    let content = remoteItem.title || 'Untitled';
                    let needsPull = false;

                    if (isFileContent) {
                        // For files, show option to pull
                        content = `${remoteItem.title || 'File'}\n\n[File from zyph.com - Click to download]`;
                        needsPull = true;
                    } else {
                        // For text content, auto-pull the full content
                        try {
                            const fullContent = await window.Zyph.Api.getFullContent(remoteItem.id);
                            if (fullContent && fullContent.content) {
                                content = fullContent.content;
                            } else {
                                content = `${remoteItem.title || 'Untitled'}\n\n[Content could not be loaded from zyph.com]`;
                                needsPull = true;
                            }
                        } catch (error) {
                            console.warn('[FolderManager] Failed to fetch full content for item:', remoteItem.id, error);
                            content = `${remoteItem.title || 'Untitled'}\n\n[Content not available - click to retry]`;
                            needsPull = true;
                        }
                    }

                    // This remote item doesn't exist locally, add it
                    const localItem = {
                        id: Zyph.Utils.generateId(),
                        type: this.mapRemoteContentType(remoteItem.content_type),
                        folderId: folderId,
                        title: remoteItem.title || 'Untitled',
                        content: content,
                        url: remoteItem.source_url || null,
                        favicon: remoteItem.source_url ? Zyph.Utils.getDefaultFavicon(remoteItem.source_url) : '',
                        domain: remoteItem.source_url ? Zyph.Utils.getDomainFromUrl(remoteItem.source_url) : null,
                        timestamp: remoteItem.created_at || new Date().toISOString(),
                        metadata: {
                            remoteSync: {
                                state: 'synced',
                                remoteContentId: remoteItem.id,
                                syncedAt: new Date().toISOString()
                            },
                            syncedFromRemote: true,
                            isFileContent: isFileContent,
                            needsPull: needsPull,
                            originalContentType: remoteItem.content_type
                        }
                    };
                    itemsToAdd.push(localItem);
                }
            }

            // Handle deletions
            if (itemsToDelete.length > 0) {
                console.log(`[FolderManager] Found ${itemsToDelete.length} items deleted from zyph.com, removing locally`);

                // Remove the deleted items from local storage
                const result = await chrome.storage.local.get('zyphContent');
                const allContent = result.zyphContent || [];
                const updatedContent = allContent.filter(item => !itemsToDelete.includes(item.id));

                await chrome.storage.local.set({ zyphContent: updatedContent });

                // Clean up session payloads for deleted items
                for (const deletedId of itemsToDelete) {
                    const deletedItem = localContent.find(item => item.id === deletedId);
                    if (deletedItem) {
                        await this.clearSessionPayloadsForItem(deletedItem);
                    }
                }

                console.log(`[FolderManager] Successfully removed ${itemsToDelete.length} deleted items from local storage`);
            }

            // Handle additions
            if (itemsToAdd.length > 0) {
                console.log(`[FolderManager] Found ${itemsToAdd.length} new remote items, adding locally`);

                // Add the new items to local storage
                const result = await chrome.storage.local.get('zyphContent');
                const allContent = result.zyphContent || [];
                const updatedContent = [...allContent, ...itemsToAdd];

                await chrome.storage.local.set({ zyphContent: updatedContent });

                console.log(`[FolderManager] Successfully added ${itemsToAdd.length} remote items to local storage`);
            }

        } catch (error) {
            // Don't throw error for sync failures, just log
            console.warn('[FolderManager] Failed to sync folder content with remote:', error);
        }
    }

    async hydrateSessionPayloads(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return;
        }

        const sessionKeys = new Set();
        items.forEach(item => {
            const metadata = item.metadata || {};
            if (metadata.sessionContentKey) {
                sessionKeys.add(metadata.sessionContentKey);
            }
            if (metadata.rawHtmlSessionKey) {
                sessionKeys.add(metadata.rawHtmlSessionKey);
            }
            if (metadata.fileSessionKey) {
                sessionKeys.add(metadata.fileSessionKey);
            }
        });

        if (sessionKeys.size === 0) {
            return;
        }

        try {
            if (!chrome.storage?.session?.get) {
                console.warn('[FolderManager] Session storage unavailable; using local previews only');
                return;
            }
            const keys = Array.from(sessionKeys);
            const sessionData = await chrome.storage.session.get(keys);

            items.forEach(item => {
                const metadata = item.metadata || {};
                if (metadata.sessionContentKey) {
                    if (sessionData[metadata.sessionContentKey]) {
                        item.content = sessionData[metadata.sessionContentKey];
                        metadata.sessionContentExpired = false;
                    } else if (metadata.sessionContentStored) {
                        metadata.sessionContentExpired = true;
                        if (!metadata.sessionContentExpiredNotified) {
                            if (typeof item.content === 'string' && !item.content.includes('[Full content expired after browser restart')) {
                                item.content += '\n\n[Full content expired after browser restart. Use the preview above or re-capture the page.]';
                            }
                            metadata.sessionContentExpiredNotified = true;
                        }
                    }
                }
                if (metadata.rawHtmlSessionKey) {
                    if (sessionData[metadata.rawHtmlSessionKey]) {
                        item.rawHtml = sessionData[metadata.rawHtmlSessionKey];
                        metadata.rawHtmlExpired = false;
                    } else if (metadata.rawHtmlStored) {
                        metadata.rawHtmlExpired = true;
                    }
                }
                if (metadata.fileSessionKey) {
                    if (sessionData[metadata.fileSessionKey]) {
                        metadata.fileStored = 'session';
                        metadata.fileExpired = false;
                    } else if (metadata.fileStored === 'session') {
                        metadata.fileExpired = true;
                    }
                }
                item.metadata = metadata;
            });
        } catch (error) {
            console.error('[FolderManager] Failed to hydrate session payloads:', error);
        }
    }

    async deleteContentItem(contentId) {
        try {
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            const contentIndex = allContent.findIndex(item => item.id === contentId);

            if (contentIndex === -1) {
                console.warn(`[FolderManager] Content item ${contentId} not found`);
                return { success: false, folderId: null };
            }

            const [removedItem] = allContent.splice(contentIndex, 1);
            await chrome.storage.local.set({ zyphContent: allContent });
            await this.clearSessionPayloadsForItem(removedItem);
            console.log(`[FolderManager] Removed content item ${contentId} from folder ${removedItem.folderId}`);

            return { success: true, folderId: removedItem.folderId };
        } catch (error) {
            console.error(`[FolderManager] Error deleting content item ${contentId}:`, error);
            return { success: false, folderId: null };
        }
    }

    async clearSessionPayloadsForItem(item) {
        try {
            const metadata = item?.metadata;
            if (!metadata) {
                return;
            }

            const keys = [];
            if (Array.isArray(metadata.sessionPayloadKeys)) {
                keys.push(...metadata.sessionPayloadKeys);
            }
            if (metadata.sessionContentKey && !keys.includes(metadata.sessionContentKey)) {
                keys.push(metadata.sessionContentKey);
            }
            if (metadata.rawHtmlSessionKey && !keys.includes(metadata.rawHtmlSessionKey)) {
                keys.push(metadata.rawHtmlSessionKey);
            }
            if (metadata.fileSessionKey && !keys.includes(metadata.fileSessionKey)) {
                keys.push(metadata.fileSessionKey);
            }

            if (keys.length === 0 || !chrome.storage?.session?.remove) {
                return;
            }

            await chrome.storage.session.remove(keys);
            console.log(`[FolderManager] Cleared session payloads for item ${item.id}`);
        } catch (error) {
            console.warn('[FolderManager] Failed to clear session payloads:', error);
        }
    }

    async deleteFolder(folderId) {
        if (!folderId) {
            console.error('[FolderManager] Cannot delete folder: No folder ID provided');
            return false;
        }

        try {
            if (!window?.Zyph?.Api) {
                throw new Error('API module not available');
            }

            console.log(`[FolderManager] Deleting folder ${folderId}`);
            await window.Zyph.Api.deleteFolder(folderId);

            // Refresh folders after deletion
            await this.loadFolders({ forceRefresh: true });

            // Update context menus
            this.updateContextMenus();

            console.log(`[FolderManager] Folder ${folderId} deleted successfully`);
            return true;
        } catch (error) {
            console.error('[FolderManager] Failed to delete folder:', error);
            throw error;
        }
    }

    async deleteFolderRecursive(folderId) {
        // The backend handles recursive deletion, so just call deleteFolder
        return this.deleteFolder(folderId);
    }

    async createFolder(name, parentId = null, description = '') {
        if (!name || typeof name !== 'string' || name.trim() === '') {
            console.error('[FolderManager] Cannot create folder: Invalid name');
            return null;
        }

        try {
            if (!window?.Zyph?.Api) {
                throw new Error('API module not available');
            }

            console.log(`[FolderManager] Creating folder "${name}" with parent ${parentId || 'root'}`);
            const folderData = {
                name: name.trim(),
                description: description || '',
                parent_id: parentId
            };

            const result = await window.Zyph.Api.createFolder(folderData);

            // Refresh folders after creation
            await this.loadFolders({ forceRefresh: true });

            // Update context menus
            this.updateContextMenus();

            console.log(`[FolderManager] Folder created successfully:`, result);
            return result;
        } catch (error) {
            console.error('[FolderManager] Failed to create folder:', error);
            throw error;
        }
    }

    async renameFolder(folderId, newName) {
        if (!folderId) {
            console.error('[FolderManager] Cannot rename folder: No folder ID provided');
            return false;
        }

        if (!newName || typeof newName !== 'string' || newName.trim() === '') {
            console.error('[FolderManager] Cannot rename folder: Invalid name');
            return false;
        }

        try {
            if (!window?.Zyph?.Api) {
                throw new Error('API module not available');
            }

            console.log(`[FolderManager] Renaming folder ${folderId} to "${newName}"`);
            const result = await window.Zyph.Api.updateFolder(folderId, { name: newName.trim() });

            // Refresh folders after rename
            await this.loadFolders({ forceRefresh: true });

            // Update context menus
            this.updateContextMenus();

            console.log(`[FolderManager] Folder renamed successfully:`, result);
            return true;
        } catch (error) {
            console.error('[FolderManager] Failed to rename folder:', error);
            throw error;
        }
    }

    updateFolderRemoteMapping(folderId) {
        const folder = this.findFolderById(folderId);
        if (!folder) {
            return false;
        }
        const meta = this.getOrCreateMetadata(folderId);
        folder.context = { ...meta.context };
        return true;
    }

    updateFolderContext(folderId, summary, isGenerating = false) {
        const folder = this.findFolderById(folderId);
        if (folder) {
            const meta = this.getOrCreateMetadata(folderId);
            meta.context = {
                summary,
                lastUpdated: new Date().toISOString(),
                isGenerating
            };
            folder.context = { ...meta.context };
            this.persistMetadata();
            return true;
        }
        return false;
    }

    setFolderGenerating(folderId, isGenerating) {
        const folder = this.findFolderById(folderId);
        if (folder) {
            const meta = this.getOrCreateMetadata(folderId);
            meta.context = {
                summary: folder.context?.summary || null,
                lastUpdated: folder.context?.lastUpdated || null,
                isGenerating
            };
            folder.context = { ...meta.context };
            this.persistMetadata();
            return true;
        }
        return false;
    }

    updateContextMenus() {
        try {
            chrome.runtime.sendMessage({ action: 'updateContextMenus' })
                .catch(() => {
                    console.log('[FolderManager] Could not send context menu update message');
                });
        } catch (error) {
            console.error('[FolderManager] Error sending context menu update:', error);
        }
    }

    notifyRemoteFoldersUpdated() {
        try {
            const detail = {
                status: this.remoteStatus,
                options: this.cachedRemoteOptions
            };
            const event = new CustomEvent('zyph:remote-folders-updated', { detail });
            document.dispatchEvent(event);
        } catch (error) {
            console.warn('[FolderManager] Failed to dispatch remote folder update event:', error);
        }
    }

    // Helper methods for sync functionality

    isFileContent(remoteItem) {
        // Check if this is a file-based content
        const hasFileUrl = remoteItem.file_url || remoteItem.file_path;
        const isDocumentType = remoteItem.content_type === 'document' && hasFileUrl;
        const hasAttachment = remoteItem.metadata?.has_attachment || remoteItem.metadata?.file_size;

        return hasFileUrl || isDocumentType || hasAttachment;
    }

    async refreshCurrentFolderContent() {
        // Refresh the currently displayed folder to show newly synced items
        if (window?.Zyph?.UIManager?.currentlyDisplayedFolderId) {
            const folderId = window.Zyph.UIManager.currentlyDisplayedFolderId;
            console.log('[FolderManager] Refreshing folder content after sync:', folderId);

            // Reload content without showing loading state (silent refresh)
            try {
                const content = await this.loadFolderContent(folderId);
                if (window?.Zyph?.UIManager?.contentRenderer) {
                    const contentPanel = window.Zyph.UIManager.contentRenderer.displayFolderContent(content, { preserveExpanded: true });
                    if (window?.Zyph?.UIManager?.eventHandler) {
                        window.Zyph.UIManager.eventHandler.bindContentPanelEvents(contentPanel);
                    }
                }
            } catch (error) {
                console.warn('[FolderManager] Failed to refresh folder content:', error);
            }
        }
    }

    mapRemoteContentType(contentType) {
        return Zyph.Utils.mapRemoteContentType(contentType);
    }
};
