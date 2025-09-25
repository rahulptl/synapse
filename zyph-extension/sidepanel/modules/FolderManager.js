// Create global namespace
window.Zyph = window.Zyph || {};

window.Zyph.FolderManager = class FolderManager {
    constructor() {
        this.folders = [];
        this.selectedFolder = null;
    }

    async loadFolders() {
        try {
            const result = await chrome.storage.local.get('zyphFolders');
            this.folders = result.zyphFolders || [];
            
            // Migrate existing folders to have context property
            let needsSave = false;
            this.folders.forEach(folder => {
                if (!folder.context) {
                    folder.context = {
                        summary: null,
                        lastUpdated: null,
                        isGenerating: false
                    };
                    needsSave = true;
                }
            });
            
            if (needsSave) {
                this.saveFolders();
            }
            
            return this.folders;
        } catch (error) {
            console.error('Error loading folders:', error);
            this.folders = [];
            return this.folders;
        }
    }

    async saveFolders() {
        try {
            await chrome.storage.local.set({ zyphFolders: this.folders });
        } catch (error) {
            console.error('Error saving folders:', error);
        }
    }

    createFolder(name, icon = 'folder', parentId = null) {
        const folder = {
            id: Date.now().toString(),
            name: name,
            icon: icon,
            parentId: parentId,
            children: [],
            expanded: true,
            context: {
                summary: null,
                lastUpdated: null,
                isGenerating: false
            }
        };

        this.folders.push(folder);

        if (parentId) {
            const parent = this.findFolderById(parentId);
            if (parent) {
                parent.children.push(folder.id);
            }
        }

        this.saveFolders();
        this.updateContextMenus();
        return folder;
    }

    renameFolder(folderId, newName) {
        const folder = this.findFolderById(folderId);
        if (folder) {
            folder.name = newName;
            this.saveFolders();
            this.updateContextMenus();
            return true;
        }
        return false;
    }

    deleteFolder(folderId) {
        const folder = this.findFolderById(folderId);
        if (folder) {
            this.deleteFolderRecursive(folderId);
            this.saveFolders();
            this.updateContextMenus();
            return true;
        }
        return false;
    }

    deleteFolderRecursive(folderId) {
        const folder = this.findFolderById(folderId);
        if (!folder) return;

        folder.children.forEach(childId => {
            this.deleteFolderRecursive(childId);
        });

        if (folder.parentId) {
            const parent = this.findFolderById(folder.parentId);
            if (parent) {
                parent.children = parent.children.filter(id => id !== folderId);
            }
        }

        this.folders = this.folders.filter(f => f.id !== folderId);
    }

    toggleFolder(folderId) {
        const folder = this.findFolderById(folderId);
        if (folder) {
            folder.expanded = !folder.expanded;
            this.saveFolders();
            return folder.expanded;
        }
        return false;
    }

    selectFolder(folder) {
        this.selectedFolder = folder;
        return folder;
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

    async loadFolderContent(folderId) {
        try {
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            const folderContent = allContent
                .filter(item => item.folderId === folderId)
                .map(item => ({ ...item }));

            await this.hydrateSessionPayloads(folderContent);

            console.log(`[FolderManager] Loading content for folder ${folderId}: ${folderContent.length} items found`);
            console.log(`[FolderManager] Total content in storage: ${allContent.length} items`);
            return folderContent;
        } catch (error) {
            console.error('Error loading folder content:', error);
            return [];
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

            if (keys.length === 0 || !chrome.storage?.session?.remove) {
                return;
            }

            await chrome.storage.session.remove(keys);
            console.log(`[FolderManager] Cleared session payloads for item ${item.id}`);
        } catch (error) {
            console.warn('[FolderManager] Failed to clear session payloads:', error);
        }
    }

    updateFolderContext(folderId, summary, isGenerating = false) {
        const folder = this.findFolderById(folderId);
        if (folder) {
            folder.context.summary = summary;
            folder.context.lastUpdated = new Date().toISOString();
            folder.context.isGenerating = isGenerating;
            this.saveFolders();
            return true;
        }
        return false;
    }

    setFolderGenerating(folderId, isGenerating) {
        const folder = this.findFolderById(folderId);
        if (folder) {
            folder.context.isGenerating = isGenerating;
            this.saveFolders();
            return true;
        }
        return false;
    }

    updateContextMenus() {
        // Send message to background script to update context menus
        try {
            chrome.runtime.sendMessage({
                action: 'updateContextMenus'
            }).catch(() => {
                console.log('Could not send context menu update message');
            });
        } catch (error) {
            console.error('Error sending context menu update:', error);
        }
    }
};
