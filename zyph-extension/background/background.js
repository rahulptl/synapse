class ZyphBackgroundManager {
    constructor() {
        this.restrictedNotificationShown = new Set();
        this.contextMenuCreationPromise = null;
        this.contextMenuRebuildRequested = false;
        this.MAX_LOCAL_CONTENT_LENGTH = 100000; // characters kept in local storage per item
        this.SESSION_CONTENT_THRESHOLD = 50000; // bytes threshold before offloading to session storage
        this.setupExtension();
        this.bindEvents();
    }

    setupExtension() {
        chrome.runtime.onInstalled.addListener(() => {
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
            this.createContextMenus();
        });
        
        // Also create context menus on startup (for development reloads)
        chrome.runtime.onStartup.addListener(() => {
            this.createContextMenus();
        });
        
        // Create context menus immediately when background script loads
        this.createContextMenus();
    }

    bindEvents() {
        chrome.action.onClicked.addListener((tab) => {
            chrome.sidePanel.open({ windowId: tab.windowId });
        });

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });

        chrome.contextMenus.onClicked.addListener((info, tab) => {
            this.handleContextMenuClick(info, tab);
        });
    }

    async createContextMenus() {
        if (this.contextMenuCreationPromise) {
            console.log('[Background] Context menu creation in progress - queuing rebuild');
            this.contextMenuRebuildRequested = true;
            await this.contextMenuCreationPromise;

            if (this.contextMenuRebuildRequested) {
                this.contextMenuRebuildRequested = false;
                return this.createContextMenus();
            }
            return;
        }

        this.contextMenuCreationPromise = this.buildContextMenus();

        try {
            await this.contextMenuCreationPromise;
        } finally {
            this.contextMenuCreationPromise = null;
        }

        if (this.contextMenuRebuildRequested) {
            this.contextMenuRebuildRequested = false;
            return this.createContextMenus();
        }
    }

    async buildContextMenus() {
        console.log(`[Background] Creating context menus...`);

        const supportedContexts = ['page', 'selection'];
        
        try {
            await chrome.contextMenus.removeAll();
            console.log(`[Background] Removed all existing context menus`);
            
            // Add a small delay to ensure removal is complete
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`[Background] Error removing context menus:`, error);
        }
        
        const folders = await this.getFolders();
        console.log(`[Background] Found ${folders.length} folders:`, folders.map(f => ({ id: f.id, name: f.name })));
        
        if (folders.length === 0) {
            console.log(`[Background] No folders found - user needs to create folders first`);
        }
        
        try {
            chrome.contextMenus.create({
                id: 'zyph-main',
                title: 'Save to Zyph',
                contexts: supportedContexts
            });

            chrome.contextMenus.create({
                id: 'zyph-separator',
                type: 'separator',
                parentId: 'zyph-main',
                contexts: supportedContexts
            });

            if (folders.length === 0) {
                chrome.contextMenus.create({
                    id: 'zyph-no-folders',
                    title: 'No folders available - Create one first',
                    parentId: 'zyph-main',
                    enabled: false,
                    contexts: supportedContexts
                });
            } else {
                console.log(`[Background] Adding ${folders.length} folders to context menu`);
                this.addFoldersToMenu(folders, 'zyph-main', supportedContexts, 0, null);
            }

            chrome.contextMenus.create({
                id: 'zyph-manage-separator',
                type: 'separator',
                parentId: 'zyph-main',
                contexts: supportedContexts
            });

            chrome.contextMenus.create({
                id: 'zyph-manage',
                title: 'Manage Folders...',
                parentId: 'zyph-main',
                contexts: supportedContexts
            });
            
            console.log(`[Background] Context menus created successfully`);
        } catch (error) {
            console.error(`[Background] Error creating context menus:`, error);
        }
    }

    addFoldersToMenu(folders, parentMenuId, contexts, depth = 0, currentParentId = null) {
        // Get folders for the current level
        const foldersToShow = folders.filter(f => f.parentId === currentParentId);
        console.log(`[Background] Adding folders at depth ${depth}, parent ${currentParentId}:`, foldersToShow.map(f => f.name));
        
        foldersToShow.forEach(folder => {
            const menuId = `zyph-folder-${folder.id}`;
            const title = '  '.repeat(depth) + folder.name;
            
            console.log(`[Background] Creating menu item: ${menuId} -> "${title}"`);
            chrome.contextMenus.create({
                id: menuId,
                title: title,
                parentId: parentMenuId,
                contexts: contexts
            });

            // Add children recursively
            const children = folders.filter(f => f.parentId === folder.id);
            if (children.length > 0) {
                this.addFoldersToMenu(folders, menuId, contexts, depth + 1, folder.id);
            }
        });
    }

    async handleContextMenuClick(info, tab) {
        console.log(`[Background] Context menu clicked:`, {
            menuItemId: info.menuItemId,
            selectionText: info.selectionText,
            pageUrl: info.pageUrl,
            tabId: tab.id
        });

        if (info.menuItemId === 'zyph-main') {
            // Main menu item clicked - this is a parent menu, no action needed
            console.log(`[Background] Main menu item clicked - no action required`);
            return;
        }

        if (info.menuItemId === 'zyph-manage') {
            console.log(`[Background] Opening side panel for management`);
            chrome.sidePanel.open({ windowId: tab.windowId });
            return;
        }

        if (info.menuItemId.startsWith('zyph-folder-')) {
            const folderId = info.menuItemId.replace('zyph-folder-', '');
            console.log(`[Background] Saving to folder ${folderId}`);
            await this.saveContentToFolder(folderId, info, tab);
            return;
        }

        if (info.menuItemId === 'zyph-no-folders') {
            // No folders available - open side panel to create one
            console.log(`[Background] No folders available - opening side panel to create folders`);
            chrome.sidePanel.open({ windowId: tab.windowId });
            return;
        }

        // Handle separator items (they shouldn't be clickable but just in case)
        if (info.menuItemId === 'zyph-separator' || info.menuItemId === 'zyph-manage-separator') {
            console.log(`[Background] Separator clicked - no action required`);
            return;
        }

        console.log(`[Background] Unhandled context menu item: ${info.menuItemId}`);
    }

    async saveContentToFolder(folderId, info, tab) {
        try {
            console.log(`[Background] Saving content to folder ${folderId}`, { info, tab });
            const folder = await this.getFolderById(folderId);
            if (!folder) {
                console.error(`[Background] Folder ${folderId} not found`);
                return;
            }
            console.log(`[Background] Found folder:`, folder);

            let contentData;
            
            // For invalid page types, use fallback method
            if (!this.isValidTabForContentScript(tab)) {
                console.warn('Using fallback method for restricted page type:', tab.url);
                const fallbackType = info.selectionText ? 'selection' : 'page';
                contentData = this.createFallbackContent(info, tab, folder, fallbackType);
                await this.showRestrictedPageNotification(tab, fallbackType);
            } else {
                // Normal content extraction
                if (info.selectionText) {
                    contentData = await this.saveSelectedText(info, tab, folder);
                } else {
                    contentData = await this.saveEntirePage(tab, folder);
                }
            }

            if (contentData) {
                console.log(`[Background] Content data prepared:`, contentData);
                const saveResult = await this.saveContentItem(contentData);

                if (!saveResult.success) {
                    await this.showSaveError('Chrome storage is full. Remove older Zyph items and try again.');
                    return;
                }

                if (saveResult.quotaFallback) {
                    await this.showSaveError('Chrome storage is almost full. Zyph saved a lightweight placeholder instead of the full content. Delete older items to free up space.');
                } else {
                    this.showSaveNotification(folder.name, saveResult.item.type);
                }

                console.log(`[Background] Content saved successfully to ${folder.name}`);
            } else {
                console.error(`[Background] No content data generated`);
            }
        } catch (error) {
            console.error('Error saving content:', error);
            await this.showSaveError('Failed to save content. Please try again.');
        }
    }

    async saveSelectedText(info, tab, folder) {
        try {
            console.log(`[Background] Saving selected text:`, {
                selectionText: info.selectionText,
                tabId: tab.id,
                folderId: folder.id,
                tabUrl: tab.url
            });

            const response = await this.sendMessageWithTimeout(tab.id, {
                action: 'getPageContent'
            });

            console.log(`[Background] Content script response for selection:`, response);

            return {
                id: this.generateId(),
                type: 'selection',
                folderId: folder.id,
                title: `Selection from ${response.title || tab.title}`,
                content: info.selectionText,
                url: tab.url,
                favicon: response.favicon || this.getDefaultFavicon(tab.url),
                domain: response.domain || new URL(tab.url).hostname,
                timestamp: new Date().toISOString(),
                metadata: {
                    pageTitle: response.title || tab.title,
                    selectedText: info.selectionText,
                    ...response.metadata
                }
            };
        } catch (error) {
            console.warn(`[Background] Content script not available for selection, using fallback:`, error.message);
            await this.showRestrictedPageNotification(tab, 'selection');
            return this.createFallbackContent(info, tab, folder, 'selection');
        }
    }

    async saveEntirePage(tab, folder) {
        try {
            const response = await this.sendMessageWithTimeout(tab.id, {
                action: 'getPageContent'
            });

            return {
                id: this.generateId(),
                type: 'page',
                folderId: folder.id,
                title: response.title || tab.title,
                content: response.content || 'Content could not be extracted',
                rawHtml: response.rawHtml,
                url: tab.url,
                favicon: response.favicon || this.getDefaultFavicon(tab.url),
                domain: response.domain || new URL(tab.url).hostname,
                timestamp: new Date().toISOString(),
                metadata: response.metadata || {}
            };
        } catch (error) {
            console.warn('Content script not available, using fallback for entire page');
            await this.showRestrictedPageNotification(tab, 'page');
            return this.createFallbackContent(null, tab, folder, 'page');
        }
    }

    async saveContentItem(contentData) {
        const { itemForLocal, sessionKeys } = await this.prepareItemForStorage(contentData);
        const result = await chrome.storage.local.get('zyphContent');
        const existingContent = result.zyphContent || [];
        const fullContentList = [...existingContent, itemForLocal];

        try {
            await chrome.storage.local.set({ zyphContent: fullContentList });
            this.scheduleContextRegeneration(itemForLocal.folderId);
            return { success: true, quotaFallback: false, item: itemForLocal };
        } catch (error) {
            if (!this.isQuotaError(error)) {
                await this.removeSessionPayloads(sessionKeys);
                throw error;
            }

            console.warn('[Background] Storage quota exceeded while saving content, attempting placeholder save');
            await this.removeSessionPayloads(sessionKeys);

            const placeholderItem = this.createQuotaPlaceholder(itemForLocal);
            const placeholderList = [...existingContent, placeholderItem];

            try {
                await chrome.storage.local.set({ zyphContent: placeholderList });
                this.scheduleContextRegeneration(placeholderItem.folderId);
                return { success: true, quotaFallback: true, item: placeholderItem };
            } catch (innerError) {
                if (this.isQuotaError(innerError)) {
                    console.error('[Background] Storage quota exceeded even after placeholder attempt');
                    return { success: false, quotaFallback: false, error: innerError };
                }
                throw innerError;
            }
        }
    }

    async prepareItemForStorage(contentData) {
        const optimized = { ...contentData };
        const metadata = optimized.metadata ? { ...optimized.metadata } : {};
        const sessionKeys = [];

        // Offload raw HTML to session storage when available
        if (optimized.rawHtml) {
            const rawHtmlSize = optimized.rawHtml.size
                || optimized.rawHtml.fullSource?.length
                || optimized.rawHtml.bodyOnly?.length
                || 0;

            const rawHtmlKey = this.buildSessionKey(optimized.id, 'rawHtml');
            const rawHtmlStoreResult = await this.storeSessionPayload(rawHtmlKey, optimized.rawHtml);

            if (rawHtmlStoreResult.success) {
                metadata.rawHtmlStored = 'session';
                metadata.rawHtmlOriginalSize = rawHtmlSize;
                metadata.rawHtmlSessionKey = rawHtmlKey;
                sessionKeys.push(rawHtmlKey);
            } else {
                metadata.rawHtmlStored = false;
                metadata.rawHtmlStoreError = rawHtmlStoreResult.error;
                console.warn('[Background] Failed to store raw HTML in session storage:', rawHtmlStoreResult.error);
            }

            delete optimized.rawHtml;
        }

        if (typeof optimized.content === 'string') {
            const encoder = new TextEncoder();
            const originalContent = optimized.content;
            const contentBytes = encoder.encode(originalContent).length;

            metadata.originalContentBytes = contentBytes;

            if (contentBytes > this.SESSION_CONTENT_THRESHOLD) {
                const contentKey = this.buildSessionKey(optimized.id, 'content');
                const sessionStoreResult = await this.storeSessionPayload(contentKey, originalContent);

                if (sessionStoreResult.success) {
                    metadata.sessionContentStored = true;
                    metadata.sessionContentKey = contentKey;
                    metadata.sessionContentBytes = contentBytes;
                    sessionKeys.push(contentKey);
                } else {
                    metadata.sessionContentStored = false;
                    metadata.sessionContentError = sessionStoreResult.error;
                    console.warn('[Background] Failed to store full content in session storage:', sessionStoreResult.error);
                }
            }

            if (originalContent.length > this.MAX_LOCAL_CONTENT_LENGTH) {
                const truncatedContent = originalContent.slice(0, this.MAX_LOCAL_CONTENT_LENGTH);
                optimized.content = `${truncatedContent}\n\n[Content truncated to reduce storage size]`;
                metadata.truncatedForStorage = true;
                metadata.truncatedContentLength = this.MAX_LOCAL_CONTENT_LENGTH;
            }
        }

        if (sessionKeys.length > 0) {
            metadata.sessionPayloadKeys = sessionKeys;
        } else if (metadata.sessionPayloadKeys) {
            delete metadata.sessionPayloadKeys;
        }

        optimized.metadata = metadata;

        return { itemForLocal: optimized, sessionKeys };
    }

    buildSessionKey(itemId, payloadType) {
        return `zyph:${itemId}:${payloadType}`;
    }

    async storeSessionPayload(key, payload) {
        if (!chrome.storage?.session?.set) {
            return { success: false, error: 'Session storage API unavailable' };
        }
        try {
            await chrome.storage.session.set({ [key]: payload });
            return { success: true };
        } catch (error) {
            return { success: false, error: error?.message || 'Failed to store payload in session storage' };
        }
    }

    async removeSessionPayloads(keys) {
        if (!keys || keys.length === 0) {
            return;
        }

        try {
            if (!chrome.storage?.session?.remove) {
                return;
            }
            await chrome.storage.session.remove(keys);
        } catch (error) {
            console.warn('[Background] Failed to remove session payloads:', error?.message || error);
        }
    }

    createQuotaPlaceholder(originalItem) {
        const placeholderMessage = 'Chrome storage is full, so Zyph saved this lightweight placeholder instead of the captured content. Delete older items in the side panel and try again.';
        const placeholderContent = `Page URL: ${originalItem.url}\n\n${placeholderMessage}`;
        const originalSize = this.estimateItemSize(originalItem);
        const truncatedTitle = originalItem.title && originalItem.title.length > 80
            ? `${originalItem.title.slice(0, 77)}...`
            : originalItem.title;

        const metadata = originalItem.metadata ? { ...originalItem.metadata } : {};
        delete metadata.sessionContentKey;
        delete metadata.sessionContentBytes;
        delete metadata.sessionContentStored;
        delete metadata.sessionPayloadKeys;
        delete metadata.sessionContentError;
        delete metadata.rawHtmlSessionKey;
        delete metadata.rawHtmlStored;
        delete metadata.rawHtmlStoreError;
        metadata.quotaFallback = true;
        metadata.quotaOriginalItemId = originalItem.id;
        metadata.quotaOriginalSize = originalSize;
        metadata.quotaRecordedAt = new Date().toISOString();

        return {
            ...originalItem,
            id: this.generateId(),
            title: truncatedTitle ? `[Storage limited] ${truncatedTitle}` : '[Storage limited] Untitled',
            content: placeholderContent,
            metadata,
            timestamp: new Date().toISOString()
        };
    }

    estimateItemSize(item) {
        try {
            const json = JSON.stringify(item);
            return new TextEncoder().encode(json).length;
        } catch (error) {
            console.warn('[Background] Failed to estimate item size:', error);
            return 0;
        }
    }

    isQuotaError(error) {
        if (!error) {
            return false;
        }
        const message = (error.message || error.toString() || '').toLowerCase();
        return message.includes('quota') || message.includes('resource::kquotabytes');
    }

    scheduleContextRegeneration(folderId) {
        // Send message to sidepanel to regenerate context
        console.log(`[Background] Scheduling context regeneration for folder ${folderId}`);
        
        // Try to send message to sidepanel with timeout
        chrome.runtime.sendMessage({
            action: 'regenerateContext',
            folderId: folderId
        }).then((response) => {
            if (response) {
                console.log(`[Background] Context regeneration response:`, response);
            } else {
                console.log(`[Background] Context regeneration message sent (no response expected)`);
            }
        }).catch((error) => {
            // Sidepanel might not be open, that's okay
            console.log(`[Background] Could not send context regeneration message:`, error.message);
        });
    }

    showSaveNotification(folderName, type) {
        const message = type === 'selection' 
            ? `Selected text saved to "${folderName}"`
            : `Page saved to "${folderName}"`;
            
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        
        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
        }, 2000);
    }

    async showSaveError(message) {
        console.error('Save error:', message);
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff9800' });
        
        // Show notification to user
        try {
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: this.getNotificationIconUrl(),
                title: 'Zyph Save Error',
                message: message,
                priority: 2
            });
        } catch (error) {
            console.error('[Background] Failed to show save error notification:', error);
        }
        
        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
        }, 3000);
    }

    async showRestrictedPageNotification(tab, contentType) {
        if (!tab || !tab.url) {
            return;
        }

        try {
            const pageType = this.getPageType(tab.url);
            let domain = '';
            try {
                domain = new URL(tab.url).hostname;
            } catch {
                domain = tab.url;
            }

            const notificationKey = `${pageType}:${domain}:${contentType}`;
            if (this.restrictedNotificationShown.has(notificationKey)) {
                return;
            }

            this.restrictedNotificationShown.add(notificationKey);

            let message = 'The browser blocked Zyph from reading this page. Only basic details were saved.';
            if (pageType === 'Restricted page type' && contentType === 'page') {
                message = 'This page is restricted by the browser. Zyph saved the link only—highlight what you need and use "Save selection" instead.';
            } else if (pageType === 'Restricted page type' && contentType === 'selection') {
                message = 'This page is restricted by the browser. Zyph can capture highlighted text, but not the full page.';
            }

            const notificationOptions = {
                type: 'basic',
                iconUrl: this.getNotificationIconUrl(),
                title: 'Content capture limited',
                message: message,
                requireInteraction: true,
                priority: 2
            };

            if (domain) {
                notificationOptions.contextMessage = domain;
            }

            try {
                await chrome.notifications.create(notificationOptions);
            } catch (notificationError) {
                console.error('[Background] Failed to show restricted page notification:', notificationError);
            }

            // Also try to show an in-page warning popup when content scripts are allowed
            if (tab.id !== undefined) {
                const overlayPayload = {
                    headline: 'Zyph can\'t capture this page automatically',
                    message,
                    instructions: contentType === 'selection'
                        ? 'Re-select the content you need and choose "Save to Zyph > Folder" so only the highlighted text is saved.'
                        : 'Highlight the content you need on this page and use "Save to Zyph > Folder" to capture it.',
                    url: tab.url,
                    domain,
                    contentType
                };

                chrome.tabs.sendMessage(tab.id, {
                    action: 'showRestrictedWarning',
                    payload: overlayPayload
                }).catch((error) => {
                    console.warn('[Background] Could not show in-page restricted warning:', error?.message || error);
                });
            }
        } catch (error) {
            console.error('[Background] Failed to show restricted page notification:', error);
        }
    }

    getNotificationIconUrl() {
        try {
            return chrome.runtime.getURL('icons/icon48.png');
        } catch (error) {
            console.warn('[Background] Failed to resolve notification icon URL, falling back to relative path:', error);
            return 'icons/icon48.png';
        }
    }

    isValidTabForContentScript(tab) {
        if (!tab || !tab.url) return false;
        
        // Content scripts can't run on these URLs
        const invalidProtocols = ['chrome:', 'chrome-extension:', 'moz-extension:', 'edge:', 'about:', 'data:', 'file:'];
        const invalidUrls = ['chrome.google.com/webstore'];
        
        const url = tab.url.toLowerCase();
        
        // Check protocols
        if (invalidProtocols.some(protocol => url.startsWith(protocol))) {
            return false;
        }
        
        // Check specific URLs
        if (invalidUrls.some(invalidUrl => url.includes(invalidUrl))) {
            return false;
        }
        
        return true;
    }

    async sendMessageWithTimeout(tabId, message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Content script communication timeout'));
            }, timeout);

            chrome.tabs.sendMessage(tabId, message, (response) => {
                clearTimeout(timeoutId);
                
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    getDefaultFavicon(url) {
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
        } catch {
            return '';
        }
    }

    createFallbackContent(info, tab, folder, type) {
        try {
            const domain = new URL(tab.url).hostname;
            
            console.log(`[Background] Creating fallback content:`, {
                type: type,
                hasSelectionText: !!info?.selectionText,
                selectionLength: info?.selectionText?.length || 0,
                folderId: folder.id,
                tabUrl: tab.url
            });
            
            if (type === 'selection' && info?.selectionText) {
                const fallbackContent = {
                    id: this.generateId(),
                    type: 'selection',
                    folderId: folder.id,
                    title: `Selection from ${tab.title}`,
                    content: info.selectionText,
                    url: tab.url,
                    favicon: this.getDefaultFavicon(tab.url),
                    domain: domain,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        pageTitle: tab.title,
                        selectedText: info.selectionText,
                        fallback: true
                    }
                };
                console.log(`[Background] Created fallback selection content:`, fallbackContent);
                return fallbackContent;
            } else {
                const pageType = this.getPageType(tab.url);
                const instructions = pageType === 'Restricted page type'
                    ? 'Tip: Highlight the portion you need and use "Save selection", or open Gmail\'s "Show original" view for the raw message.'
                    : 'Only basic page information could be stored for this page.';

                const fallbackPageContent = {
                    id: this.generateId(),
                    type: 'page',
                    folderId: folder.id,
                    title: tab.title || 'Untitled Page',
                    content: `Page URL: ${tab.url}\nPage Title: ${tab.title}\nPage Type: ${pageType}\n\nNote: This page type (${pageType}) doesn't allow content extraction. ${instructions}`,
                    url: tab.url,
                    favicon: this.getDefaultFavicon(tab.url),
                    domain: domain,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        pageTitle: tab.title,
                        pageType: pageType,
                        fallback: true,
                        reason: 'Content script not allowed on this page type'
                    }
                };
                console.log(`[Background] Created fallback page content:`, fallbackPageContent);
                return fallbackPageContent;
            }
        } catch (error) {
            console.error(`[Background] Error creating fallback content:`, error);
            return null;
        }
    }

    getPageType(url) {
        if (url.startsWith('chrome:')) return 'Chrome internal page';
        if (url.startsWith('chrome-extension:')) return 'Chrome extension page';
        if (url.startsWith('moz-extension:')) return 'Firefox extension page';
        if (url.startsWith('edge:')) return 'Edge internal page';
        if (url.startsWith('about:')) return 'Browser about page';
        if (url.startsWith('data:')) return 'Data URL';
        if (url.startsWith('file:')) return 'Local file';
        if (url.includes('chrome.google.com/webstore')) return 'Chrome Web Store';
        return 'Restricted page type';
    }

    async getFolders() {
        const result = await chrome.storage.local.get('zyphFolders');
        return result.zyphFolders || [];
    }

    async getFolderById(folderId) {
        const folders = await this.getFolders();
        return folders.find(f => f.id === folderId);
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async handleMessage(message, sender, sendResponse) {
        if (message.action === 'openSidePanel') {
            chrome.sidePanel.open({ windowId: message.windowId || sender.tab?.windowId });
            sendResponse({ success: true });
        }
        
        if (message.action === 'updateContextMenus') {
            console.log(`[Background] Received updateContextMenus message`);
            await this.createContextMenus();
            sendResponse({ success: true });
        }

        if (message.action === 'contentDeleted') {
            if (message.folderId) {
                console.log(`[Background] Received contentDeleted message for folder ${message.folderId}`);
                this.scheduleContextRegeneration(message.folderId);
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Missing folderId' });
            }
        }
    }
}

new ZyphBackgroundManager();
