window.Zyph = window.Zyph || {};

window.Zyph.EventHandler = class EventHandler {
    constructor(uiManager, folderManager, contextGenerator) {
        this.uiManager = uiManager;
        this.folderManager = folderManager;
        this.contextGenerator = contextGenerator;
    }

    bindEvents() {
        this.bindFolderTreeEvents();
        this.bindDragAndDropEvents();
        this.bindModalEvents();
        this.bindSettingsEvents();
        this.bindIconSelectorEvents();
        this.bindSearchEvents();
        this.bindRuntimeMessages();
    }

    bindFolderTreeEvents() {
        this.uiManager.folderTree.addEventListener('click', (e) => {
            // Handle create folder button
            if (e.target.closest('[data-action="create-folder"]')) {
                e.stopPropagation();
                this.handleCreateFolder();
                return;
            }

            // Handle create subfolder button
            if (e.target.closest('[data-action="create-subfolder"]')) {
                e.stopPropagation();
                const button = e.target.closest('[data-action="create-subfolder"]');
                const parentId = button.dataset.parentId;
                this.handleCreateSubfolder(parentId);
                this.closeAllFolderMenus();
                return;
            }

            // Handle rename folder button
            if (e.target.closest('[data-action="rename-folder"]')) {
                e.stopPropagation();
                const button = e.target.closest('[data-action="rename-folder"]');
                const folderId = button.dataset.folderId;
                this.handleRenameFolder(folderId);
                this.closeAllFolderMenus();
                return;
            }

            // Handle delete folder button
            if (e.target.closest('[data-action="delete-folder"]')) {
                e.stopPropagation();
                const button = e.target.closest('[data-action="delete-folder"]');
                const folderId = button.dataset.folderId;
                this.handleDeleteFolder(folderId);
                this.closeAllFolderMenus();
                return;
            }

            // Handle folder menu button
            if (e.target.closest('.folder-menu-btn')) {
                e.stopPropagation();
                const menuBtn = e.target.closest('.folder-menu-btn');
                const dropdown = menuBtn.nextElementSibling;

                // Close all other menus first
                this.closeAllFolderMenus();

                // Toggle this menu
                if (dropdown) {
                    dropdown.classList.toggle('show');
                }
                return;
            }

            // Close menus if clicking outside
            if (!e.target.closest('.folder-menu-dropdown')) {
                this.closeAllFolderMenus();
            }

            if (e.target.closest('[data-action="open-remote-management"]')) {
                this.uiManager.openRemoteManagement();
                return;
            }

            if (e.target.closest('.remote-status-action[data-action="open-settings"]')) {
                this.uiManager.openSettings();
                return;
            }

            const folderElement = e.target.closest('.folder-item');
            if (!folderElement) {
                return;
            }

            const folderId = folderElement.dataset.folderId;
            if (!folderId) {
                console.warn('[EventHandler] No folder ID found on clicked element');
                return;
            }

            const folder = this.folderManager.findFolderById(folderId);
            if (!folder) {
                console.warn(`[EventHandler] Folder ${folderId} not found`);
                return;
            }

            if (e.target.closest('.folder-toggle')) {
                this.folderManager.toggleFolder(folderId);
                this.uiManager.renderFolders();
                return;
            }

            try {
                this.folderManager.selectFolder(folder);
                this.uiManager.renderFolders();

                this.uiManager.expandedContentIds.clear();
                this.uiManager.currentlyDisplayedFolderId = folderId;
                this.uiManager.loadFolderContent(folderId);
            } catch (error) {
                console.error('[EventHandler] Error handling folder selection:', error);
            }
        });
    }

    closeAllFolderMenus() {
        const allMenus = this.uiManager.folderTree.querySelectorAll('.folder-menu-dropdown.show');
        allMenus.forEach(menu => menu.classList.remove('show'));
    }

    async handleCreateFolder() {
        this.showInlineFolderInput(null);
    }

    async handleCreateSubfolder(parentId) {
        this.showInlineFolderInput(parentId);
    }

    showInlineFolderInput(parentId = null) {
        // Remove any existing inline inputs
        const existingInput = this.uiManager.folderTree.querySelector('.inline-folder-input-container');
        if (existingInput) {
            existingInput.remove();
        }

        // Calculate depth for indentation
        let depth = 0;
        let insertAfterElement = null;

        if (parentId) {
            const parentElement = this.uiManager.folderTree.querySelector(`[data-folder-id="${parentId}"]`);
            if (!parentElement) return;

            const parentFolder = this.folderManager.findFolderById(parentId);
            if (!parentFolder) return;

            // Ensure parent is expanded
            if (!parentFolder.expanded) {
                this.folderManager.toggleFolder(parentId);
                this.uiManager.renderFolders();
                // Re-query after render
                const newParentElement = this.uiManager.folderTree.querySelector(`[data-folder-id="${parentId}"]`);
                if (newParentElement) {
                    insertAfterElement = newParentElement;
                }
            } else {
                insertAfterElement = parentElement;
            }

            // Calculate depth based on parent
            const parentStyle = window.getComputedStyle(parentElement);
            const parentMargin = parseInt(parentStyle.marginLeft) || 0;
            depth = (parentMargin / 20) + 1; // Each level is 20px
        } else {
            // Insert at top of folder tree, after folder-actions
            const folderActions = this.uiManager.folderTree.querySelector('.folder-actions');
            if (folderActions) {
                insertAfterElement = folderActions;
            }
        }

        // Create inline input
        const inputContainer = document.createElement('div');
        inputContainer.className = 'inline-folder-input-container';
        inputContainer.style.marginLeft = `${depth * 20}px`;

        inputContainer.innerHTML = `
            <div class="inline-folder-input-wrapper">
                <div class="folder-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
                    </svg>
                </div>
                <input
                    type="text"
                    class="inline-folder-input"
                    placeholder="Folder name..."
                    maxlength="100"
                    autocomplete="off"
                    spellcheck="false"
                />
                <div class="inline-folder-actions">
                    <button class="inline-action-btn save-btn" title="Create (Enter)">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                    </button>
                    <button class="inline-action-btn cancel-btn" title="Cancel (Esc)">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Insert the input
        if (insertAfterElement) {
            insertAfterElement.after(inputContainer);
        } else {
            this.uiManager.folderTree.prepend(inputContainer);
        }

        const input = inputContainer.querySelector('.inline-folder-input');
        const saveBtn = inputContainer.querySelector('.save-btn');
        const cancelBtn = inputContainer.querySelector('.cancel-btn');

        // Focus the input
        input.focus();

        // Handle save
        const saveFolderName = async () => {
            const folderName = input.value.trim();
            if (!folderName) {
                input.focus();
                input.classList.add('error');
                setTimeout(() => input.classList.remove('error'), 300);
                return;
            }

            try {
                inputContainer.classList.add('saving');
                this.uiManager.showNotification('Creating folder...', 'info');
                await this.folderManager.createFolder(folderName, parentId);
                await this.uiManager.renderFolders();
                this.uiManager.showNotification('Folder created successfully!', 'success');
            } catch (error) {
                console.error('[EventHandler] Failed to create folder:', error);
                this.uiManager.showNotification('Failed to create folder: ' + error.message, 'error');
                inputContainer.classList.remove('saving');
                input.focus();
            }
        };

        // Handle cancel
        const cancelInput = () => {
            inputContainer.remove();
        };

        // Event listeners
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveFolderName();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelInput();
            }
        });

        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            saveFolderName();
        });

        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelInput();
        });

        // Close on click outside
        const closeOnClickOutside = (e) => {
            if (!inputContainer.contains(e.target)) {
                cancelInput();
                document.removeEventListener('click', closeOnClickOutside);
            }
        };

        // Delay to prevent immediate closing
        setTimeout(() => {
            document.addEventListener('click', closeOnClickOutside);
        }, 100);
    }

    async handleRenameFolder(folderId) {
        const folder = this.folderManager.findFolderById(folderId);
        if (!folder) return;

        const newName = prompt(`Rename folder "${folder.name}" to:`, folder.name);
        if (!newName || !newName.trim() || newName.trim() === folder.name) return;

        try {
            this.uiManager.showNotification('Renaming folder...', 'info');
            await this.folderManager.renameFolder(folderId, newName.trim());
            await this.uiManager.renderFolders();
            this.uiManager.showNotification('Folder renamed successfully!', 'success');
        } catch (error) {
            console.error('[EventHandler] Failed to rename folder:', error);
            this.uiManager.showNotification('Failed to rename folder: ' + error.message, 'error');
        }
    }

    async handleDeleteFolder(folderId) {
        const folder = this.folderManager.findFolderById(folderId);
        if (!folder) return;

        const confirmed = confirm(`Are you sure you want to delete "${folder.name}"? This will also delete all subfolders and content.`);
        if (!confirmed) return;

        try {
            this.uiManager.showNotification('Deleting folder...', 'info');
            await this.folderManager.deleteFolder(folderId);
            await this.uiManager.renderFolders();
            this.uiManager.showNotification('Folder deleted successfully!', 'success');
        } catch (error) {
            console.error('[EventHandler] Failed to delete folder:', error);
            this.uiManager.showNotification('Failed to delete folder: ' + error.message, 'error');
        }
    }

    bindDragAndDropEvents() {
        const tree = this.uiManager.folderTree;
        if (!tree) {
            return;
        }

        const MAX_BINARY_BYTES = 5 * 1024 * 1024; // 5 MB safety cap

        const clearHighlights = () => {
            tree.querySelectorAll('.folder-item.drag-over').forEach(item => {
                item.classList.remove('drag-over');
                delete item.dataset.dragCounter;
            });
        };

        tree.addEventListener('dragenter', (e) => {
            const folderItem = e.target.closest('.folder-item');
            if (!folderItem) {
                return;
            }
            e.preventDefault();
            const counter = Number(folderItem.dataset.dragCounter || 0) + 1;
            folderItem.dataset.dragCounter = String(counter);
            folderItem.classList.add('drag-over');
        });

        tree.addEventListener('dragover', (e) => {
            const folderItem = e.target.closest('.folder-item');
            if (!folderItem) {
                return;
            }
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
        });

        tree.addEventListener('dragleave', (e) => {
            const folderItem = e.target.closest('.folder-item');
            if (!folderItem) {
                return;
            }

            const counter = Math.max(0, Number(folderItem.dataset.dragCounter || 0) - 1);
            if (counter === 0) {
                folderItem.classList.remove('drag-over');
                delete folderItem.dataset.dragCounter;
            } else {
                folderItem.dataset.dragCounter = String(counter);
            }
        });

        tree.addEventListener('drop', async (e) => {
            const folderItem = e.target.closest('.folder-item');
            if (!folderItem) {
                return;
            }

            e.preventDefault();
            const folderId = folderItem.dataset.folderId;
            clearHighlights();

            if (!folderId) {
                return;
            }

            await this.handleFolderDrop(folderId, e.dataTransfer, MAX_BINARY_BYTES);
        });

        tree.addEventListener('dragend', clearHighlights);
    }

    async handleFolderDrop(folderId, dataTransfer, maxBinaryBytes) {
        try {
            const items = await this.collectDroppedItems(dataTransfer, maxBinaryBytes);

            if (!items.length) {
                this.uiManager.showNotification('Drop did not contain supported files, links, or text.', 'error');
                return;
            }

            const response = await this.sendRuntimeMessage({
                action: 'saveDroppedContent',
                folderId,
                items,
                source: 'sidepanel-drag-drop'
            });

            if (!response || !response.success) {
                const errorMessage = response?.error || 'Failed to import dropped items.';
                this.uiManager.showNotification(errorMessage, 'error');
                return;
            }

            const savedCount = Array.isArray(response.saved) ? response.saved.length : 0;
            const errorCount = Array.isArray(response.errors) ? response.errors.length : 0;

            if (savedCount === 0) {
                this.uiManager.showNotification('Unable to import dropped items.', 'error');
                return;
            }

            if (errorCount > 0) {
                this.uiManager.showNotification(`${savedCount} item(s) saved, ${errorCount} failed.`, 'warning');
            } else {
                this.uiManager.showNotification(`${savedCount} item(s) added to the folder.`, 'success');
            }
        } catch (error) {
            console.error('[EventHandler] Failed to handle folder drop:', error);
            this.uiManager.showNotification('Drop failed. Please try again.', 'error');
        }
    }

    async collectDroppedItems(dataTransfer, maxBinaryBytes) {
        if (!dataTransfer) {
            return [];
        }

        const collected = [];
        const urlSet = new Set();
        const MAX_FILE_COUNT = 5;
        const MAX_TEXT_DROP_LENGTH = 50000;
        const fileEntries = [];

        if (dataTransfer.files) {
            for (const file of Array.from(dataTransfer.files)) {
                if (fileEntries.length >= MAX_FILE_COUNT) break;
                if (file) {
                    fileEntries.push(file);
                }
            }
        }

        if (dataTransfer.items) {
            for (const item of Array.from(dataTransfer.items)) {
                if (fileEntries.length >= MAX_FILE_COUNT) break;
                if (item.kind === 'file') {
                    const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
                    if (file) {
                        fileEntries.push(file);
                    }
                }
            }
        }

        const seenFiles = new Set();
        const files = [];
        for (const file of fileEntries) {
            if (files.length >= MAX_FILE_COUNT) break;
            const key = `${file.name || 'unknown'}::${file.size || 0}::${file.type || ''}`;
            if (seenFiles.has(key)) {
                continue;
            }
            seenFiles.add(key);
            files.push(file);
        }

        for (const file of files) {
            try {
                const descriptor = await this.readDroppedFile(file, maxBinaryBytes);
                if (descriptor) {
                    collected.push(descriptor);
                }
            } catch (error) {
                console.warn('[EventHandler] Failed to read dropped file:', error);
            }
        }

        let anchorTitles = new Map();
        if (typeof dataTransfer.getData === 'function') {
            const htmlSnippet = dataTransfer.getData('text/html');
            if (htmlSnippet) {
                try {
                    const temp = document.createElement('div');
                    temp.innerHTML = htmlSnippet;
                    const anchor = temp.querySelector('a[href]');
                    if (anchor && anchor.href) {
                        anchorTitles.set(anchor.href, anchor.textContent?.trim() || '');
                    }
                } catch (error) {
                    console.warn('[EventHandler] Failed to parse dropped HTML:', error);
                }
            }
        }

        const uriList = typeof dataTransfer.getData === 'function'
            ? dataTransfer.getData('text/uri-list')
            : '';

        if (uriList) {
            this.parseUriList(uriList).forEach((url) => {
                if (!url || url.startsWith('file://')) {
                    return;
                }
                urlSet.add(url);
            });
        }

        urlSet.forEach((url) => {
            collected.push({
                kind: 'url',
                url,
                title: anchorTitles.get(url) || null
            });
        });

        const plainText = typeof dataTransfer.getData === 'function'
            ? dataTransfer.getData('text/plain')
            : '';

        if (plainText) {
            const trimmed = plainText.trim();
            if (trimmed && !urlSet.has(trimmed) && !this.looksLikeFilePath(trimmed)) {
                const truncated = trimmed.length > MAX_TEXT_DROP_LENGTH;
                const textValue = truncated ? trimmed.slice(0, MAX_TEXT_DROP_LENGTH) : trimmed;
                collected.push({
                    kind: 'text',
                    text: textValue,
                    truncated,
                    originalLength: trimmed.length
                });
            }
        }

        return collected;
    }

    async readDroppedFile(file, maxBinaryBytes) {
        if (!file) {
            return null;
        }

        const MAX_TEXT_PREVIEW_BYTES = 200 * 1024;

        const descriptor = {
            kind: 'file',
            name: file.name || 'Untitled file',
            mimeType: file.type || '',
            size: typeof file.size === 'number' ? file.size : 0,
            lastModified: file.lastModified || null,
            textContent: null,
            dataUrl: null,
            textTruncated: false,
            binary: null,
            binaryTooLarge: false
        };

        const isText = this.isTextFile(file);

        if (isText) {
            const { content, truncated } = await this.readFileAsText(file, MAX_TEXT_PREVIEW_BYTES);
            descriptor.textContent = content;
            descriptor.textTruncated = truncated;
        } else if (descriptor.size > 0 && descriptor.size <= 200 * 1024) {
            descriptor.dataUrl = await this.readFileAsDataUrl(file);
        }

        const shouldCaptureBinary = Number.isFinite(descriptor.size) && descriptor.size > 0
            && (!maxBinaryBytes || descriptor.size <= maxBinaryBytes);

        console.log('[EventHandler] Binary capture check:', {
            fileName: descriptor.name,
            fileSize: descriptor.size,
            maxBinaryBytes: maxBinaryBytes,
            shouldCaptureBinary: shouldCaptureBinary,
            sizeFinite: Number.isFinite(descriptor.size),
            sizeGreaterThanZero: descriptor.size > 0,
            withinLimit: !maxBinaryBytes || descriptor.size <= maxBinaryBytes
        });

        if (shouldCaptureBinary) {
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            if (arrayBuffer) {
                // Convert ArrayBuffer to Uint8Array for message passing
                descriptor.binary = {
                    type: 'Uint8Array',
                    data: Array.from(new Uint8Array(arrayBuffer)),
                    byteLength: arrayBuffer.byteLength
                };
            }
            console.log('[EventHandler] Binary captured:', !!descriptor.binary);
        } else if (descriptor.size > 0) {
            descriptor.binaryTooLarge = true;
        }

        return descriptor;
    }

    async readFileAsText(file, limit) {
        const slice = file.size > limit ? file.slice(0, limit) : file;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const value = typeof reader.result === 'string' ? reader.result : '';
                resolve({ content: value, truncated: file.size > limit });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(slice);
        });
    }

    async readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    async readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (reader.result instanceof ArrayBuffer) {
                    resolve(reader.result);
                } else {
                    resolve(null);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    isTextFile(file) {
        if (!file) {
            return false;
        }

        if (file.type && file.type.startsWith('text/')) {
            return true;
        }

        const name = (file.name || '').toLowerCase();
        return ['.txt', '.md', '.markdown', '.json', '.csv', '.log'].some(ext => name.endsWith(ext));
    }

    parseUriList(value) {
        return value.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    }

    looksLikeFilePath(value) {
        return value.startsWith('file://') || /^[A-Za-z]:\\\\/.test(value) || value.startsWith('\\\\');
    }

    async sendRuntimeMessage(payload) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(payload, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                        return;
                    }
                    resolve(response);
                });
            } catch (error) {
                resolve({ success: false, error: error.message });
            }
        });
    }

    bindModalEvents() {
        // Folder modal events
        this.uiManager.saveFolderBtn.addEventListener('click', () => this.uiManager.saveFolder());
        this.uiManager.cancelBtn.addEventListener('click', () => this.uiManager.closeModal());
        this.uiManager.closeModalBtn.addEventListener('click', () => this.uiManager.closeModal());
        this.uiManager.folderModal.addEventListener('click', (e) => {
            if (e.target === this.uiManager.folderModal) this.uiManager.closeModal();
        });
    }

    bindSettingsEvents() {
        this.uiManager.refreshFoldersBtn.addEventListener('click', () => this.uiManager.refreshFolders());
        this.uiManager.settingsBtn.addEventListener('click', () => this.uiManager.openSettings());
        this.uiManager.closeSettingsBtn.addEventListener('click', () => this.uiManager.closeSettings());
        this.uiManager.cancelSettingsBtn.addEventListener('click', () => this.uiManager.closeSettings());
        this.uiManager.saveSettingsBtn.addEventListener('click', () => this.uiManager.saveSettings());
        this.uiManager.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.uiManager.settingsModal) this.uiManager.closeSettings();
        });
    }

    bindIconSelectorEvents() {
        this.uiManager.iconSelector.addEventListener('click', (e) => {
            if (e.target.closest('.icon-option')) {
                this.uiManager.selectIcon(e.target.closest('.icon-option'));
            }
        });
    }

    bindSearchEvents() {
        this.uiManager.searchInput.addEventListener('input', (e) => {
            this.uiManager.filterFolders(e.target.value);
        });
    }

    bindRuntimeMessages() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'regenerateContext') {
                // Handle async operation properly
                chrome.storage.local.get('openaiApiKey').then(result => {
                    if (result.openaiApiKey) {
                        setTimeout(() => {
                            this.contextGenerator.generateFolderContext(message.folderId)
                                .then(() => {
                                    // Only update display if the folder content is currently shown
                                    const contextElement = document.getElementById(`folder-context-${message.folderId}`);
                                    if (contextElement) {
                                        this.uiManager.updateContextDisplay(message.folderId);
                                    } else {
                                    }
                                    sendResponse({ success: true, updated: !!contextElement });
                                })
                                .catch(error => {
                                    console.error('[EventHandler] Error regenerating context:', error);
                                    sendResponse({ success: false, error: error.message });
                                });
                        }, 1000);
                    } else {
                        sendResponse({ success: false, error: 'No API key available' });
                    }
                }).catch(error => {
                    console.error('[EventHandler] Error accessing storage for API key:', error);
                    sendResponse({ success: false, error: error.message });
                });

                return true; // Keep message channel open for async response
            }

            if (message.action === 'contentSynced') {
                // Handle content sync notification - refresh folder content to show newly synced item
                console.log('[EventHandler] Content synced notification received:', message);

                // Refresh folder content if it's currently displayed
                if (this.folderManager && message.folderId) {
                    setTimeout(() => {
                        this.folderManager.refreshCurrentFolderContent();
                    }, 500); // Small delay to ensure sync metadata is updated
                }

                sendResponse({ success: true });
                return true;
            }
        });
    }

    bindContentPanelEvents(contentPanel) {
        if (contentPanel.dataset.listenersAttached === 'true') {
            return;
        }

        contentPanel.dataset.listenersAttached = 'true';
        contentPanel.addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.delete-content-btn');
            if (deleteButton) {
                e.preventDefault();
                e.stopPropagation();

                const contentId = deleteButton.dataset.contentId;
                if (contentId && confirm('Remove this saved item from the folder?')) {
                    await this.uiManager.removeContentItem(contentId);
                }
                return;
            }

            const pullButton = e.target.closest('.pull-content-btn');
            if (pullButton) {
                e.preventDefault();
                e.stopPropagation();

                const contentId = pullButton.dataset.contentId;
                const action = pullButton.dataset.action;
                const remoteId = pullButton.dataset.remoteId;

                if (contentId && remoteId) {
                    await this.handlePullContent(contentId, remoteId, action, pullButton);
                }
                return;
            }

            const refreshButton = e.target.closest('.context-refresh-btn');
            if (refreshButton) {
                const { folderId } = refreshButton.dataset;
                if (folderId) {
                    refreshButton.disabled = true;
                    this.contextGenerator.generateFolderContext(folderId)
                        .then(() => this.uiManager.updateContextDisplay(folderId))
                        .catch(error => {
                            console.error('Error generating context:', error);
                            alert(`Failed to generate context: ${error.message}`);
                        })
                        .finally(() => {
                            refreshButton.disabled = false;
                        });
                }
                return;
            }

            const generatePromptButton = e.target.closest('.generate-prompt-btn');
            if (generatePromptButton) {
                const { folderId } = generatePromptButton.dataset;
                if (folderId) {
                    this.uiManager.generateContextPrompt(folderId);
                }
                return;
            }

            const resetButton = e.target.closest('.reset-btn');
            if (resetButton) {
                const { folderId } = resetButton.dataset;
                if (folderId) {
                    this.folderManager.setFolderGenerating(folderId, false);
                    this.uiManager.updateContextDisplay(folderId);
                }
                return;
            }

            if (e.target.closest('.close-content-btn')) {
                this.uiManager.closeFolderContent();
                return;
            }

            // Handle content header row click to show inline details
            if (e.target.closest('.content-header-row')) {
                const headerRow = e.target.closest('.content-header-row');
                const contentId = headerRow.dataset.contentId;
                if (contentId) {
                    this.uiManager.showContentInline(contentId, headerRow);
                }
            }
        });

    }

    async handlePullContent(contentId, remoteId, action, buttonElement) {
        try {
            // Show loading state
            buttonElement.classList.add('loading');
            buttonElement.disabled = true;
            buttonElement.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="loading-spin">
                    <path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>
                </svg>
            `;

            if (action === 'download') {
                // Handle file download
                await this.downloadFileContent(remoteId, contentId);
            } else {
                // Handle content retry (pull text content)
                await this.retryContentPull(remoteId, contentId);
            }

            // Remove the pull button after successful operation
            buttonElement.remove();

        } catch (error) {
            console.error('[EventHandler] Failed to pull content:', error);

            // Reset button state on error
            buttonElement.classList.remove('loading');
            buttonElement.disabled = false;

            const isFile = action === 'download';
            const icon = isFile ?
                '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>' :
                '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>';

            buttonElement.innerHTML = icon;

            this.uiManager.showNotification(
                `Failed to ${isFile ? 'download file' : 'load content'}: ${error.message}`,
                'error'
            );
        }
    }

    async downloadFileContent(remoteId, localContentId) {
        try {
            const response = await window.Zyph.Api.getFullContent(remoteId);

            if (!response || !response.file_url) {
                throw new Error('File download URL not available');
            }

            // Open the file URL in a new tab to download
            window.open(response.file_url, '_blank');

            // Update local content to mark as downloaded
            await this.updateContentItemMetadata(localContentId, (metadata) => {
                return {
                    ...metadata,
                    needsPull: false,
                    downloadedAt: new Date().toISOString()
                };
            });

        } catch (error) {
            console.error('[EventHandler] Failed to download file:', error);
            throw new Error('Failed to download file from zyph.com');
        }
    }

    async retryContentPull(remoteId, localContentId) {
        try {
            const response = await window.Zyph.Api.getFullContent(remoteId);

            if (!response || !response.content) {
                throw new Error('Content not available from zyph.com');
            }

            // Update local content item with the full content
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            const itemIndex = allContent.findIndex(item => item.id === localContentId);

            if (itemIndex === -1) {
                throw new Error('Local content item not found');
            }

            allContent[itemIndex].content = response.content;
            allContent[itemIndex].metadata = {
                ...allContent[itemIndex].metadata,
                needsPull: false,
                pulledAt: new Date().toISOString()
            };

            await chrome.storage.local.set({ zyphContent: allContent });

            // Refresh the content display
            if (this.uiManager.currentlyDisplayedFolderId) {
                await this.uiManager.loadFolderContent(this.uiManager.currentlyDisplayedFolderId, { preserveExpanded: true });
            }

        } catch (error) {
            console.error('[EventHandler] Failed to retry content pull:', error);
            throw new Error('Failed to load content from zyph.com');
        }
    }

    async updateContentItemMetadata(contentId, updater) {
        return await Zyph.Utils.updateContentMetadata(contentId, updater);
    }
};
