// Import modules
importScripts('../common/utils.js', '../common/zyph-api.js', 'dialog-manager.js', 'content-saver.js');

class ZyphBackgroundManager {
    constructor() {
        this.contextMenuCreationPromise = null;
        this.contextMenuRebuildRequested = false;

        // Initialize modules
        this.dialogManager = new DialogManager();
        this.contentSaver = new ContentSaver(this.dialogManager);

        this.setupExtension();
        this.bindEvents();

        this.contentSaver.processRemoteQueue().catch(error => {
            console.warn('[Background] Remote sync queue processing failed on startup:', error);
        });
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

        // Handle notification button clicks
        chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
            this.dialogManager.handleNotificationButtonClick(notificationId, buttonIndex);
        });

        chrome.notifications.onClicked.addListener((notificationId) => {
            this.dialogManager.handleNotificationClick(notificationId);
        });

        if (chrome?.alarms?.onAlarm) {
            chrome.alarms.onAlarm.addListener((alarm) => {
                if (alarm.name === this.contentSaver.REMOTE_QUEUE_ALARM) {
                    this.contentSaver.processRemoteQueue();
                }
            });
        }
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
        
        const folders = await this.contentSaver.getFolders({ forceRefresh: true });
        const normalizedFolders = folders.map(folder => ({
            ...folder,
            parentId: folder.parentId ?? null
        }));

        if (normalizedFolders.length === 0) {
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

            if (normalizedFolders.length === 0) {
                chrome.contextMenus.create({
                    id: 'zyph-no-folders',
                    title: 'No folders available - Create one first',
                    parentId: 'zyph-main',
                    enabled: false,
                    contexts: supportedContexts
                });
            } else {
                const grouped = this.groupFoldersByParent(normalizedFolders);
                const rootItems = grouped.get(null) || [];
                rootItems.forEach(folder => {
                    this.addFolderBranch(folder, 'zyph-main', supportedContexts, grouped);
                });
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

    groupFoldersByParent(folders) {
        const grouped = new Map();

        folders.forEach(folder => {
            const parentKey = folder.parentId ?? null;
            if (!grouped.has(parentKey)) {
                grouped.set(parentKey, []);
            }
            grouped.get(parentKey).push(folder);
        });

        grouped.forEach(list => {
            list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        });

        return grouped;
    }

    addFolderBranch(folder, parentMenuId, contexts, grouped) {
        const menuId = `zyph-folder-${folder.id}`;
        chrome.contextMenus.create({
            id: menuId,
            title: folder.name,
            parentId: parentMenuId,
            contexts
        });

        const children = grouped.get(folder.id) || [];
        children.forEach(child => this.addFolderBranch(child, menuId, contexts, grouped));
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
            // Check if this is a protected page BEFORE attempting to save
            if (!Zyph.Utils.isValidTabForContentScript(tab)) {
                console.log(`[Background] Blocking save attempt on protected page: ${tab.url}`);
                await this.showProtectedPageError(tab);
                return;
            }

            const folderId = info.menuItemId.replace('zyph-folder-', '');
            console.log(`[Background] Saving to folder ${folderId}`);
            await this.contentSaver.saveContentToFolder(folderId, info, tab);
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

    // Content saving and dialog methods moved to respective modules

    async handleMessage(message, sender, sendResponse) {
        if (message.action === 'openSidePanel') {
            chrome.sidePanel.open({ windowId: message.windowId || sender.tab?.windowId });
            sendResponse({ success: true });
            return;
        }

        if (message.action === 'processRemoteQueue') {
            this.contentSaver.processRemoteQueue();
            sendResponse({ success: true });
            return;
        }

        if (message.action === 'updateContextMenus') {
            console.log(`[Background] Received updateContextMenus message`);
            await this.createContextMenus();
            sendResponse({ success: true });
            return;
        }

        if (message.action === 'saveDroppedContent') {
            try {
                // Check if we're on a protected page before saving dropped content
                if (sender.tab && !Zyph.Utils.isValidTabForContentScript(sender.tab)) {
                    console.log(`[Background] Blocking dropped content save on protected page: ${sender.tab.url}`);
                    sendResponse({
                        success: false,
                        error: 'Cannot save content on protected pages. Try dropping on a regular webpage first.'
                    });
                    return;
                }

                const folderId = message.folderId;
                const items = Array.isArray(message.items) ? message.items : [];

                if (!folderId || items.length === 0) {
                    sendResponse({ success: false, error: 'Missing folderId or items' });
                    return;
                }

                const result = await this.contentSaver.saveDroppedContent(folderId, items, message.source || 'sidepanel');
                sendResponse({
                    success: true,
                    saved: result.savedItems || [],
                    errors: result.errors || []
                });
            } catch (error) {
                console.error('[Background] Failed to save dropped content:', error);
                sendResponse({ success: false, error: error?.message || 'Failed to import dropped content' });
            }
            return;
        }

        if (message.action === 'contentDeleted') {
            if (message.folderId) {
                console.log(`[Background] Received contentDeleted message for folder ${message.folderId}`);
                this.contentSaver.scheduleContextRegeneration(message.folderId);
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Missing folderId' });
            }
            return;
        }

        if (message.action === 'closeProtectedDialog') {
            const result = await this.dialogManager.closeProtectedDialog();
            sendResponse(result);
            return;
        }
    }

    // Notification handlers moved to DialogManager module

    async showProtectedPageError(tab) {
        try {
            const pageType = Zyph.Utils.getPageType(tab.url);
            const message = `Cannot save content from ${pageType}. This page type is protected by your browser for security reasons.`;

            console.log(`[Background] Protected page error: ${message}`);

            // Show notification
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: '../assets/icon48.png',
                title: 'Zyph - Protected Page',
                message: message,
                priority: 2
            });

            // Show badge error
            chrome.action.setBadgeText({ text: 'ERR' });
            chrome.action.setBadgeBackgroundColor({ color: '#ff9800' });

            setTimeout(() => {
                chrome.action.setBadgeText({ text: '' });
            }, 3000);

        } catch (error) {
            console.error('[Background] Failed to show protected page error:', error);
        }
    }

}

new ZyphBackgroundManager();
