window.Zyph = window.Zyph || {};

window.Zyph.UIManager = class UIManager {
    constructor(folderManager, contextGenerator) {
        this.folderManager = folderManager;
        this.contextGenerator = contextGenerator;
        this.currentlyDisplayedFolderId = null;
        this.expandedContentIds = new Set();

        this.initializeElements();
        this.initializeComponents();
        this.bindEvents();
        this.observeStorageChanges();
    }

    initializeElements() {
        // Main elements
        this.folderTree = document.getElementById('folder-tree');
        this.searchInput = document.getElementById('search-input');
        this.folderActions = null;

        // Modal elements
        this.folderModal = document.getElementById('folder-modal');
        this.modalTitle = document.getElementById('modal-title');
        this.folderNameInput = document.getElementById('folder-name');
        this.parentFolderSelect = document.getElementById('parent-folder');
        this.remoteFolderSelect = document.getElementById('remote-folder-select');
        this.remoteFolderStatus = document.getElementById('remote-folder-status');
        this.iconSelector = document.getElementById('icon-selector');
        this.saveFolderBtn = document.getElementById('save-folder-btn');
        this.cancelBtn = document.getElementById('cancel-btn');
        this.closeModalBtn = document.getElementById('close-modal');

        // Action buttons (unused in remote-only mode)
        this.renameFolderBtn = null;
        this.deleteFolderBtn = null;

        // Settings elements
        this.refreshFoldersBtn = document.getElementById('refresh-folders-btn');
        this.settingsBtn = document.getElementById('settings-btn');
        this.settingsModal = document.getElementById('settings-modal');
        this.closeSettingsBtn = document.getElementById('close-settings');
        this.cancelSettingsBtn = document.getElementById('cancel-settings-btn');
        this.saveSettingsBtn = document.getElementById('save-settings-btn');
        this.zyphApiKeyInput = document.getElementById('zyph-api-key');
        this.zyphApiKeyGroup = document.getElementById('zyph-api-key-group');
        this.zyphUserDisplay = document.getElementById('zyph-user-display');
        this.zyphConnectionStatus = document.getElementById('zyph-connection-status');
        this.zyphConnectedSummary = document.getElementById('zyph-connected-summary');
        this.zyphConnectedDetails = document.getElementById('zyph-connected-details');
        this.zyphConnectionUpdated = document.getElementById('zyph-connection-updated');
        this.testZyphConnectionBtn = document.getElementById('test-zyph-connection');
        this.disconnectZyphBtn = document.getElementById('disconnect-zyph');
    }

    initializeComponents() {
        // Initialize modular components
        this.folderRenderer = new window.Zyph.FolderRenderer(this.folderManager);
        this.contentRenderer = new window.Zyph.ContentRenderer(this.folderManager, this.contextGenerator);

        this.modalManager = new window.Zyph.ModalManager({
            folderModal: this.folderModal,
            modalTitle: this.modalTitle,
            folderNameInput: this.folderNameInput,
            parentFolderSelect: this.parentFolderSelect,
            remoteFolderSelect: this.remoteFolderSelect,
            remoteFolderStatus: this.remoteFolderStatus,
            iconSelector: this.iconSelector,
            saveFolderBtn: this.saveFolderBtn,
            settingsModal: this.settingsModal,
            zyphApiKeyInput: this.zyphApiKeyInput,
            zyphApiKeyGroup: this.zyphApiKeyGroup,
            zyphUserDisplay: this.zyphUserDisplay,
            zyphConnectionStatus: this.zyphConnectionStatus,
            zyphConnectedSummary: this.zyphConnectedSummary,
            zyphConnectedDetails: this.zyphConnectedDetails,
            zyphConnectionUpdated: this.zyphConnectionUpdated,
            testZyphConnectionBtn: this.testZyphConnectionBtn,
            disconnectZyphBtn: this.disconnectZyphBtn
        }, this.folderManager);

        this.eventHandler = new window.Zyph.EventHandler(this, this.folderManager, this.contextGenerator);
    }

    bindEvents() {
        this.eventHandler.bindEvents();
    }

    observeStorageChanges() {
        this.storageChangeHandler = (changes, areaName) => {
            if (areaName !== 'local' || !changes.zyphContent) {
                return;
            }

            if (!this.currentlyDisplayedFolderId) {
                return;
            }

            const contentPanel = document.querySelector('.folder-content-panel');
            if (!contentPanel || !contentPanel.classList.contains('show')) {
                return;
            }

            const folderId = this.currentlyDisplayedFolderId;

            const toArray = (value) => Array.isArray(value) ? value : [];
            const oldItems = toArray(changes.zyphContent.oldValue).filter(item => item.folderId === folderId);
            const newItems = toArray(changes.zyphContent.newValue).filter(item => item.folderId === folderId);

            const oldIds = new Set(oldItems.map(item => item.id));
            const newIds = new Set(newItems.map(item => item.id));

            const hasNewItem = Array.from(newIds).some(id => !oldIds.has(id));
            const hasRemovedItem = Array.from(oldIds).some(id => !newIds.has(id));
            const hasUpdatedItem = !hasNewItem && !hasRemovedItem && newItems.some(item => {
                const previous = oldItems.find(oldItem => oldItem.id === item.id);
                if (!previous) return false;
                return previous.timestamp !== item.timestamp || previous.content !== item.content;
            });

            if (hasNewItem || hasRemovedItem || hasUpdatedItem) {
                this.loadFolderContent(folderId);
            }
        };

        chrome.storage.onChanged.addListener(this.storageChangeHandler);
    }

    async renderFolders() {
        await this.folderRenderer.renderFolders(this.folderTree);
    }

    async refreshFolders() {
        console.log('[UIManager] Manually refreshing folders from Zyph.com...');

        // Add a spinning animation to the refresh button
        if (this.refreshFoldersBtn) {
            this.refreshFoldersBtn.disabled = true;
            this.refreshFoldersBtn.classList.add('spinning');
        }

        try {
            // Force refresh folders from API
            await this.folderManager.loadFolders({ forceRefresh: true });

            // Re-render the folder tree
            await this.renderFolders();

            console.log('[UIManager] Folders refreshed successfully');
        } catch (error) {
            console.error('[UIManager] Failed to refresh folders:', error);
            // Show error notification or message
        } finally {
            // Remove spinning animation
            if (this.refreshFoldersBtn) {
                this.refreshFoldersBtn.disabled = false;
                this.refreshFoldersBtn.classList.remove('spinning');
            }
        }
    }

    showFolderActions() {
        // No-op in remote-only mode
    }

    hideFolderActions() {
        // No-op in remote-only mode
    }

    showCreateFolderModal() {
        this.showRemoteManagementNotice();
    }

    showRenameFolderModal() {
        this.showRemoteManagementNotice();
    }

    selectIcon(iconElement) {
        this.modalManager.selectIcon(iconElement);
    }

    showModal() {
        this.modalManager.showModal();
    }

    closeModal() {
        this.modalManager.closeModal();
    }

    async showContentInline(contentId, headerRow) {
        await this.contentRenderer.showContentInline(contentId, headerRow);
        // Sync expanded state with content renderer
        this.expandedContentIds = this.contentRenderer.expandedContentIds;
    }


    async saveFolder() {
        const result = await this.modalManager.saveFolder();
        if (result && result.success) {
            this.renderFolders();
        }
    }

    confirmDeleteFolder() {
        this.showRemoteManagementNotice();
    }

    filterFolders(searchTerm) {
        this.folderRenderer.filterFolders(this.folderTree, searchTerm);
    }

    showRemoteManagementNotice() {
        alert('Folders are managed on Zyph.com. Use the button below the list to open Zyph and manage your folders.');
    }

    openRemoteManagement() {
        try {
            const win = window.open('https://zyph.com/', '_blank');
            if (win) {
                win.opener = null;
            }
        } catch (error) {
            console.error('[UIManager] Failed to open Zyph.com:', error);
        }
    }

    async loadFolderContent(folderId) {
        try {
            // Show loading state
            this.showContentLoadingState(folderId);

            const content = await this.folderManager.loadFolderContent(folderId);

            // Add a small delay to ensure storage operations are complete
            await new Promise(resolve => setTimeout(resolve, 100));

            const contentPanel = this.contentRenderer.displayFolderContent(content, { preserveExpanded: true });
            this.eventHandler.bindContentPanelEvents(contentPanel);

            // Sync expanded state with content renderer
            this.expandedContentIds = this.contentRenderer.expandedContentIds;

        } catch (error) {
            console.error(`[UIManager] Error loading folder content for ${folderId}:`, error);
            // Show user-friendly error
            const contentPanel = document.getElementById('folder-content-panel');
            if (contentPanel) {
                contentPanel.innerHTML = `
                    <div class="content-header">
                        <h3>Error Loading Content</h3>
                        <button class="close-content-btn">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="error-message" style="padding: 20px; text-align: center; color: #f44336;">
                        <p>Failed to load folder content. Please try again.</p>
                        <button onclick="location.reload()" class="btn primary">Reload Extension</button>
                    </div>
                `;
            }
        }
    }

    async removeContentItem(contentId) {
        try {
            const { success, folderId } = await this.folderManager.deleteContentItem(contentId);

            if (!success || !folderId) {
                this.showNotification('Unable to remove item. Please try again.', 'error');
                return;
            }

            if (this.folderManager.selectedFolder && this.folderManager.selectedFolder.id === folderId) {
                await this.loadFolderContent(folderId);
            }

            chrome.runtime.sendMessage({
                action: 'contentDeleted',
                folderId
            }).catch(() => {
            });

            this.showNotification('Item removed from folder.', 'success');
        } catch (error) {
            console.error(`[UIManager] Error removing content item ${contentId}:`, error);
            this.showNotification('Failed to remove item. Please try again.', 'error');
        }
    }

    updateContextDisplay(folderId) {
        this.contentRenderer.updateContextDisplay(folderId);
    }

    closeFolderContent() {
        this.contentRenderer.closeFolderContent();
        this.folderManager.selectedFolder = null;
        this.currentlyDisplayedFolderId = null;
        this.expandedContentIds.clear();
        this.hideFolderActions();
        this.renderFolders();
    }

    async generateContextPrompt(folderId) {
        try {
            const contextPrompt = await this.contextGenerator.generateContextPrompt(folderId);
            const folder = this.folderManager.findFolderById(folderId);
            this.modalManager.showContextPromptModal(folder.name, contextPrompt);
        } catch (error) {
            console.error('Error generating context prompt:', error);
            alert(`Failed to generate context prompt: ${error.message}`);
        }
    }

    showNotification(message, type = 'info') {
        this.modalManager.showNotification(message, type);
    }

    // Settings methods
    async openSettings() {
        await this.modalManager.openSettings();
    }

    closeSettings() {
        this.modalManager.closeSettings();
    }

    async saveSettings() {
        await this.modalManager.saveSettings();
    }

    showContentLoadingState(folderId) {
        const contentPanel = document.getElementById('folder-content-panel') ||
                           document.querySelector('.folder-content-panel');

        if (contentPanel) {
            contentPanel.innerHTML = `
                <div class="content-header">
                    <h3>Loading Content...</h3>
                    <button class="close-content-btn">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <p class="loading-text">Loading and syncing content...</p>
                    <p class="loading-subtext">Checking for new and deleted items on zyph.com</p>
                </div>
            `;
        }
    }

    showFolderLoadingState() {
        const folderList = document.getElementById('folder-list') ||
                          document.querySelector('.folder-list');

        if (folderList) {
            folderList.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <p class="loading-text">Loading folders from zyph.com...</p>
                </div>
            `;
        }
    }

    showConnectionLoadingState() {
        const statusElement = document.querySelector('.zyph-connection-status') ||
                             document.querySelector('.connection-status');

        if (statusElement) {
            statusElement.innerHTML = `
                <div class="loading-container inline">
                    <div class="loading-spinner small"></div>
                    <span class="loading-text">Connecting to zyph.com...</span>
                </div>
            `;
        }
    }
};
