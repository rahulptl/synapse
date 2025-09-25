window.Zyph = window.Zyph || {};

window.Zyph.UIManager = class UIManager {
    constructor(folderManager, contextGenerator) {
        this.folderManager = folderManager;
        this.contextGenerator = contextGenerator;
        this.currentlyDisplayedFolderId = null; // Track which folder content is currently displayed
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        // Main elements
        this.folderTree = document.getElementById('folder-tree');
        this.searchInput = document.getElementById('search-input');
        this.folderActions = document.getElementById('folder-actions');
        
        // Modal elements
        this.folderModal = document.getElementById('folder-modal');
        this.modalTitle = document.getElementById('modal-title');
        this.folderNameInput = document.getElementById('folder-name');
        this.parentFolderSelect = document.getElementById('parent-folder');
        this.iconSelector = document.getElementById('icon-selector');
        this.saveFolderBtn = document.getElementById('save-folder-btn');
        this.cancelBtn = document.getElementById('cancel-btn');
        this.closeModalBtn = document.getElementById('close-modal');
        
        // Action buttons
        this.renameFolderBtn = document.getElementById('rename-folder');
        this.deleteFolderBtn = document.getElementById('delete-folder');
        
        // Settings elements
        this.settingsBtn = document.getElementById('settings-btn');
        this.settingsModal = document.getElementById('settings-modal');
        this.closeSettingsBtn = document.getElementById('close-settings');
        this.cancelSettingsBtn = document.getElementById('cancel-settings-btn');
        this.saveSettingsBtn = document.getElementById('save-settings-btn');
        this.apiKeyInput = document.getElementById('openai-api-key');
    }

    bindEvents() {
        // Root folder creation
        this.folderTree.addEventListener('click', (e) => {
            if (e.target.closest('.create-folder-btn.root-level')) {
                this.showCreateFolderModal();
            }
        });

        // Folder tree interactions
        this.folderTree.addEventListener('click', (e) => {
            const folderElement = e.target.closest('.folder-item');
            if (!folderElement) return;

            const folderId = folderElement.dataset.folderId;
            if (!folderId) {
                console.warn('[UIManager] No folder ID found on clicked element');
                return;
            }

            const folder = this.folderManager.findFolderById(folderId);
            if (!folder) {
                console.warn(`[UIManager] Folder ${folderId} not found`);
                return;
            }

            console.log(`[UIManager] Folder clicked: ${folder.name} (${folderId})`);

            if (e.target.closest('.folder-toggle')) {
                console.log(`[UIManager] Toggling folder ${folderId}`);
                this.folderManager.toggleFolder(folderId);
                this.renderFolders();
            } else if (e.target.closest('.create-child-btn')) {
                console.log(`[UIManager] Creating child folder for ${folderId}`);
                this.showCreateFolderModal(folderId);
            } else {
                console.log(`[UIManager] Selecting folder ${folderId}`);
                try {
                    this.folderManager.selectFolder(folder);
                    this.showFolderActions();
                    this.renderFolders();
                    
                    // Load content for the selected folder
                    console.log(`[UIManager] Loading content for folder ${folderId} (currently displayed: ${this.currentlyDisplayedFolderId})`);
                    this.currentlyDisplayedFolderId = folderId;
                    this.loadFolderContent(folderId);
                } catch (error) {
                    console.error(`[UIManager] Error handling folder selection:`, error);
                }
            }
        });

        // Folder actions
        this.renameFolderBtn.addEventListener('click', () => this.showRenameFolderModal());
        this.deleteFolderBtn.addEventListener('click', () => this.confirmDeleteFolder());

        // Modal events
        this.saveFolderBtn.addEventListener('click', () => this.saveFolder());
        this.cancelBtn.addEventListener('click', () => this.closeModal());
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.folderModal.addEventListener('click', (e) => {
            if (e.target === this.folderModal) this.closeModal();
        });

        // Settings events
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        this.cancelSettingsBtn.addEventListener('click', () => this.closeSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });

        // Icon selector
        this.iconSelector.addEventListener('click', (e) => {
            if (e.target.closest('.icon-option')) {
                this.selectIcon(e.target.closest('.icon-option'));
            }
        });

        // Search functionality
        this.searchInput.addEventListener('input', (e) => {
            this.filterFolders(e.target.value);
        });

        // Listen for context regeneration messages
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'regenerateContext') {
                console.log(`[UIManager] Received regenerateContext message for folder ${message.folderId}`);
                
                // Handle async operation properly
                chrome.storage.local.get('openaiApiKey').then(result => {
                    if (result.openaiApiKey) {
                        console.log(`[UIManager] API key available, scheduling context regeneration`);
                        setTimeout(() => {
                            this.contextGenerator.generateFolderContext(message.folderId)
                                .then(() => {
                                    // Only update display if the folder content is currently shown
                                    const contextElement = document.getElementById(`folder-context-${message.folderId}`);
                                    if (contextElement) {
                                        this.updateContextDisplay(message.folderId);
                                        console.log(`[UIManager] Context display updated for folder ${message.folderId}`);
                                    } else {
                                        console.log(`[UIManager] Context regenerated for folder ${message.folderId} (not currently displayed)`);
                                    }
                                    sendResponse({ success: true, updated: !!contextElement });
                                })
                                .catch(error => {
                                    console.error('[UIManager] Error regenerating context:', error);
                                    sendResponse({ success: false, error: error.message });
                                });
                        }, 1000);
                    } else {
                        console.log('[UIManager] No API key available for context regeneration');
                        sendResponse({ success: false, error: 'No API key available' });
                    }
                }).catch(error => {
                    console.error('[UIManager] Error accessing storage for API key:', error);
                    sendResponse({ success: false, error: error.message });
                });
                
                return true; // Keep message channel open for async response
            }
        });
    }

    async renderFolders() {
        const folders = await this.folderManager.loadFolders();
        const rootFolders = folders.filter(folder => !folder.parentId);
        
        let html = '';
        rootFolders.forEach(folder => {
            html += this.createFolderHTML(folder, folders);
        });
        
        const createRootFolder = this.folderTree.querySelector('.create-root-folder');
        if (createRootFolder) {
            createRootFolder.innerHTML = `
                <button class="create-folder-btn root-level" title="Create New Folder">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                    </svg>
                    Create New Folder
                </button>
            `;
            this.folderTree.innerHTML = html + createRootFolder.outerHTML;
        } else {
            this.folderTree.innerHTML = html + `
                <div class="create-root-folder">
                    <button class="create-folder-btn root-level" title="Create New Folder">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                        </svg>
                        Create New Folder
                    </button>
                </div>
            `;
        }
    }

    createFolderHTML(folder, allFolders, depth = 0) {
        const children = allFolders.filter(f => f.parentId === folder.id);
        const hasChildren = children.length > 0;
        const isSelected = this.folderManager.selectedFolder && this.folderManager.selectedFolder.id === folder.id;
        
        let html = `
            <div class="folder-item ${isSelected ? 'selected' : ''}" data-folder-id="${folder.id}" style="margin-left: ${depth * 20}px">
                <div class="folder-content">
                    ${hasChildren ? `
                        <button class="folder-toggle ${folder.expanded ? 'expanded' : ''}">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                            </svg>
                        </button>
                    ` : '<div class="folder-spacer"></div>'}
                    
                    <div class="folder-icon">
                        ${this.getIconSVG(folder.icon)}
                    </div>
                    
                    <span class="folder-name">${folder.name}</span>
                    
                    <button class="create-child-btn" title="Create Subfolder">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        if (hasChildren && folder.expanded) {
            children.forEach(child => {
                html += this.createFolderHTML(child, allFolders, depth + 1);
            });
        }
        
        return html;
    }

    getIconSVG(iconName) {
        const icons = {
            folder: '<path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>',
            work: '<path d="M20 6h-2.5l-1.1-1.1c-.4-.4-.9-.6-1.4-.6H9c-.5 0-1 .2-1.4.6L6.5 6H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 11c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z"/>',
            person: '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
            home: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
            star: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
            bookmark: '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>'
        };
        return `<svg viewBox="0 0 24 24" fill="currentColor">${icons[iconName] || icons.folder}</svg>`;
    }

    showFolderActions() {
        this.folderActions.style.display = 'flex';
    }

    hideFolderActions() {
        this.folderActions.style.display = 'none';
    }

    showCreateFolderModal(parentId = null) {
        this.modalTitle.textContent = parentId ? 'Create Subfolder' : 'Create New Folder';
        this.folderNameInput.value = '';
        this.populateParentFolderSelect(parentId);
        this.selectIcon(this.iconSelector.querySelector('.icon-option[data-icon="folder"]'));
        this.saveFolderBtn.textContent = 'Create Folder';
        this.saveFolderBtn.dataset.mode = 'create';
        this.saveFolderBtn.dataset.parentId = parentId || '';
        this.showModal();
    }

    showRenameFolderModal() {
        if (!this.folderManager.selectedFolder) return;
        
        this.modalTitle.textContent = 'Rename Folder';
        this.folderNameInput.value = this.folderManager.selectedFolder.name;
        this.populateParentFolderSelect(this.folderManager.selectedFolder.parentId);
        this.selectIcon(this.iconSelector.querySelector(`[data-icon="${this.folderManager.selectedFolder.icon}"]`));
        this.saveFolderBtn.textContent = 'Save Changes';
        this.saveFolderBtn.dataset.mode = 'rename';
        this.saveFolderBtn.dataset.folderId = this.folderManager.selectedFolder.id;
        this.showModal();
    }

    populateParentFolderSelect(selectedParentId = null) {
        let options = '<option value="">Root Level</option>';
        
        this.folderManager.folders.forEach(folder => {
            if (this.folderManager.selectedFolder && folder.id === this.folderManager.selectedFolder.id) return;
            options += `<option value="${folder.id}" ${folder.id === selectedParentId ? 'selected' : ''}>${folder.name}</option>`;
        });
        
        this.parentFolderSelect.innerHTML = options;
    }

    selectIcon(iconElement) {
        this.iconSelector.querySelectorAll('.icon-option').forEach(option => {
            option.classList.remove('selected');
        });
        iconElement.classList.add('selected');
    }

    showModal() {
        this.folderModal.classList.add('show');
        setTimeout(() => this.folderNameInput.focus(), 100);
    }

    async showContentInline(contentId, headerRow) {
        try {
            // Find the content item by ID
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            const contentItem = allContent.find(item => item.id === contentId);
            
            if (!contentItem) {
                console.error(`Content item ${contentId} not found`);
                return;
            }

            // Check if details are already expanded
            const existingDetails = headerRow.nextElementSibling;
            if (existingDetails && existingDetails.classList.contains('content-details')) {
                // Toggle: remove existing details
                existingDetails.remove();
                headerRow.classList.remove('expanded');
                return;
            }

            // Remove any other expanded details
            document.querySelectorAll('.content-details').forEach(el => el.remove());
            document.querySelectorAll('.content-header-row').forEach(el => el.classList.remove('expanded'));

            // Create inline details element
            const detailsElement = document.createElement('div');
            detailsElement.className = 'content-details';
            detailsElement.innerHTML = `
                <div class="content-metadata">
                    <p><strong>URL:</strong> <a href="${contentItem.url}" target="_blank">${contentItem.url}</a></p>
                    <p><strong>Domain:</strong> ${contentItem.domain}</p>
                    <p><strong>Saved:</strong> ${new Date(contentItem.timestamp).toLocaleString()}</p>
                    <p><strong>Type:</strong> ${contentItem.type === 'selection' ? 'Selected Text' : 'Full Page'}</p>
                    ${contentItem.metadata?.fallback ? '<p><strong>Note:</strong> Content saved using fallback method</p>' : ''}
                </div>
                <div class="content-text">
                    <h4>Content:</h4>
                    <div class="content-preview">${contentItem.content.replace(/\n/g, '<br>')}</div>
                </div>
                <div class="content-actions">
                    <button class="btn secondary copy-content-btn" data-content="${this.escapeHtml(contentItem.content)}">Copy Content</button>
                    <button class="btn secondary collapse-btn">Collapse</button>
                </div>
            `;

            // Add event listeners
            detailsElement.querySelector('.copy-content-btn').addEventListener('click', (e) => {
                const content = e.target.dataset.content;
                this.copyToClipboard(content, 'Content copied to clipboard!');
            });

            detailsElement.querySelector('.collapse-btn').addEventListener('click', () => {
                detailsElement.remove();
                headerRow.classList.remove('expanded');
            });

            // Insert after the header row
            headerRow.insertAdjacentElement('afterend', detailsElement);
            headerRow.classList.add('expanded');

        } catch (error) {
            console.error('Error showing content inline:', error);
            alert('Failed to load content details');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    closeModal() {
        this.folderModal.classList.remove('show');
    }

    async saveFolder() {
        const name = this.folderNameInput.value.trim();
        if (!name) {
            alert('Please enter a folder name');
            return;
        }

        const selectedIcon = this.iconSelector.querySelector('.icon-option.selected');
        const icon = selectedIcon ? selectedIcon.dataset.icon : 'folder';
        const mode = this.saveFolderBtn.dataset.mode;

        try {
            if (mode === 'create') {
                const parentId = this.saveFolderBtn.dataset.parentId || null;
                this.folderManager.createFolder(name, icon, parentId);
            } else if (mode === 'rename') {
                const folderId = this.saveFolderBtn.dataset.folderId;
                this.folderManager.renameFolder(folderId, name);
            }

            this.closeModal();
            this.renderFolders();
        } catch (error) {
            console.error('Error saving folder:', error);
            alert('Failed to save folder');
        }
    }

    confirmDeleteFolder() {
        if (!this.folderManager.selectedFolder) return;
        
        const folderName = this.folderManager.selectedFolder.name;
        if (confirm(`Are you sure you want to delete "${folderName}" and all its subfolders?`)) {
            this.folderManager.deleteFolder(this.folderManager.selectedFolder.id);
            this.folderManager.selectedFolder = null;
            this.hideFolderActions();
            this.renderFolders();
            this.closeFolderContent();
        }
    }

    filterFolders(searchTerm) {
        const folderItems = this.folderTree.querySelectorAll('.folder-item');
        const term = searchTerm.toLowerCase();

        folderItems.forEach(item => {
            const folderName = item.querySelector('.folder-name').textContent.toLowerCase();
            const matches = folderName.includes(term);
            item.style.display = matches || !searchTerm ? 'block' : 'none';
        });
    }

    async loadFolderContent(folderId) {
        try {
            console.log(`[UIManager] Loading content for folder ${folderId}`);
            const content = await this.folderManager.loadFolderContent(folderId);
            console.log(`[UIManager] Loaded ${content.length} content items for folder ${folderId}`);
            
            // Add a small delay to ensure storage operations are complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            this.displayFolderContent(content);
            console.log(`[UIManager] Content display completed for folder ${folderId}`);
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

    displayFolderContent(content) {
        console.log(`[UIManager] displayFolderContent called with ${content.length} items:`, content);
        
        // Create content panel if it doesn't exist
        let contentPanel = document.getElementById('folder-content-panel');
        if (!contentPanel) {
            console.log(`[UIManager] Creating new content panel`);
            contentPanel = document.createElement('div');
            contentPanel.id = 'folder-content-panel';
            contentPanel.className = 'folder-content-panel show';
            
            document.body.appendChild(contentPanel);
            console.log(`[UIManager] New content panel created and appended to body`);
        } else {
            console.log(`[UIManager] Using existing content panel`);
            contentPanel.className = 'folder-content-panel show';
        }

        if (content.length === 0) {
            contentPanel.innerHTML = `
                <div class="content-header">
                    <h3>${this.folderManager.selectedFolder.name}</h3>
                    <button class="close-content-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div class="empty-content">
                    <p>No content saved to this folder yet.</p>
                    <p>Right-click on any webpage to save content here.</p>
                </div>
            `;
        } else {
            console.log(`[UIManager] Creating content display for ${content.length} items`);
            const sortedContent = [...content].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            console.log(`[UIManager] Sorted content:`, sortedContent.map(item => ({ title: item.title, type: item.type })));
            
            const contentHTML = sortedContent.map(item => this.createContentItemHTML(item)).join('');
            const contextHTML = this.createContextHTML(this.folderManager.selectedFolder);
            
            console.log(`[UIManager] Generated contentHTML length: ${contentHTML.length}`);
            console.log(`[UIManager] Generated contextHTML length: ${contextHTML.length}`);
            
            const fullHTML = `
                <div class="content-header">
                    <h3>${this.folderManager.selectedFolder.name}</h3>
                    <button class="close-content-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                ${contextHTML}
                <div class="content-list">
                    <h4>📄 Saved Content (${content.length})</h4>
                    ${contentHTML}
                </div>
            `;
            
            console.log(`[UIManager] Setting contentPanel.innerHTML, fullHTML length: ${fullHTML.length}`);
            contentPanel.innerHTML = fullHTML;
        }

        this.addContentEventListeners(contentPanel);
    }

    addContentEventListeners(contentPanel) {
        contentPanel.addEventListener('click', async (e) => {
            const deleteButton = e.target.closest('.delete-content-btn');
            if (deleteButton) {
                e.preventDefault();
                e.stopPropagation();

                const contentId = deleteButton.dataset.contentId;
                if (contentId && confirm('Remove this saved item from the folder?')) {
                    await this.removeContentItem(contentId);
                }
                return;
            }

            const refreshButton = e.target.closest('.context-refresh-btn');
            if (refreshButton) {
                const { folderId } = refreshButton.dataset;
                if (folderId) {
                    refreshButton.disabled = true;
                    this.contextGenerator.generateFolderContext(folderId)
                        .then(() => this.updateContextDisplay(folderId))
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
                    this.generateContextPrompt(folderId);
                }
                return;
            }

            const resetButton = e.target.closest('.reset-btn');
            if (resetButton) {
                const { folderId } = resetButton.dataset;
                if (folderId) {
                    this.folderManager.setFolderGenerating(folderId, false);
                    this.updateContextDisplay(folderId);
                }
                return;
            }

            if (e.target.closest('.close-content-btn')) {
                this.closeFolderContent();
                return;
            }

            // Handle content header row click to show inline details
            if (e.target.closest('.content-header-row')) {
                const headerRow = e.target.closest('.content-header-row');
                const contentId = headerRow.dataset.contentId;
                if (contentId) {
                    this.showContentInline(contentId, headerRow);
                }
            }
        });
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
                console.log('[UIManager] Could not notify background about content deletion');
            });

            this.showNotification('Item removed from folder.', 'success');
        } catch (error) {
            console.error(`[UIManager] Error removing content item ${contentId}:`, error);
            this.showNotification('Failed to remove item. Please try again.', 'error');
        }
    }

    createContextHTML(folder) {
        if (!folder.context) {
            folder.context = {
                summary: null,
                lastUpdated: null,
                isGenerating: false
            };
        }
        
        const context = folder.context;
        const hasContext = context.summary && context.summary !== 'No content available in this folder yet.';
        const lastUpdated = context.lastUpdated ? new Date(context.lastUpdated).toLocaleString() : 'Never';
        
        return `
            <div class="folder-context" id="folder-context-${folder.id}">
                <div class="context-header">
                    <h4>📋 Folder Context</h4>
                    <div class="context-actions">
                        ${context.isGenerating ? 
                            `<span class="context-status generating">
                                Generating... 
                                <button class="reset-btn" type="button" data-folder-id="${folder.id}" title="Cancel generation">✕</button>
                            </span>` :
                            `<button class="context-refresh-btn" type="button" data-folder-id="${folder.id}">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                                </svg>
                                Refresh
                            </button>
                            ${hasContext ? 
                                `<button class="generate-prompt-btn" type="button" data-folder-id="${folder.id}">
                                    <svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                                    </svg>
                                    Generate Prompt
                                </button>` : ''
                            }`
                        }
                    </div>
                </div>
                <div class="context-content">
                    ${hasContext ? 
                        `<p class="context-text">${context.summary}</p>
                         <p class="context-updated">Last updated: ${lastUpdated}</p>` :
                        `<p class="context-placeholder">No context generated yet. Click "Refresh" to generate a summary of this folder's content.</p>`
                    }
                </div>
            </div>
        `;
    }

    updateContextDisplay(folderId) {
        try {
            const contextElement = document.getElementById(`folder-context-${folderId}`);
            if (!contextElement) {
                console.log(`[UIManager] Context element not found for folder ${folderId}`);
                return;
            }

            const folder = this.folderManager.findFolderById(folderId);
            if (!folder) {
                console.error(`[UIManager] Folder ${folderId} not found`);
                return;
            }

            const newContextHTML = this.createContextHTML(folder);
            const parser = new DOMParser();
            const newDocument = parser.parseFromString(newContextHTML, 'text/html');
            const newElement = newDocument.body.firstChild;
            
            if (newElement) {
                contextElement.replaceWith(newElement);
                console.log(`[UIManager] Context display updated for folder ${folderId}`);
            } else {
                console.error(`[UIManager] Failed to parse new context HTML for folder ${folderId}`);
            }
        } catch (error) {
            console.error(`[UIManager] Error updating context display for folder ${folderId}:`, error);
        }
    }

    createContentItemHTML(item) {
        const date = new Date(item.timestamp).toLocaleDateString();
        const typeIcon = item.type === 'selection' ? '📝' : '📄';
        
        const html = `
            <div class="content-item" data-content-id="${item.id}">
                <div class="content-header-row" data-content-id="${item.id}">
                    <div class="content-icon">${typeIcon}</div>
                    <span class="content-header-text">${item.title} - ${date}</span>
                    <button class="content-action-btn delete-content-btn" type="button" title="Remove from folder" data-content-id="${item.id}">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M15.5 4l-1-1h-5l-1 1H5v2h14V4h-3.5zM7 20c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H7v12zm4-9h2v7h-2v-7z"/>
                        </svg>
                    </button>
                    <svg class="expand-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                    </svg>
                </div>
            </div>
        `;
        
        console.log(`[UIManager] Created content item HTML for "${item.title}": ${html.length} chars`);
        return html;
    }

    closeFolderContent() {
        const contentPanel = document.getElementById('folder-content-panel');
        if (contentPanel) {
            contentPanel.remove();
        }
        this.folderManager.selectedFolder = null;
        this.currentlyDisplayedFolderId = null; // Reset tracking variable
        this.hideFolderActions();
        this.renderFolders();
        console.log('[UIManager] Folder content closed and tracking reset');
    }

    async generateContextPrompt(folderId) {
        try {
            const contextPrompt = await this.contextGenerator.generateContextPrompt(folderId);
            const folder = this.folderManager.findFolderById(folderId);
            this.showContextPromptModal(folder.name, contextPrompt);
        } catch (error) {
            console.error('Error generating context prompt:', error);
            alert(`Failed to generate context prompt: ${error.message}`);
        }
    }

    showContextPromptModal(folderName, contextPrompt) {
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content context-prompt-modal">
                <div class="modal-header">
                    <h3>Knowledge Base: ${folderName}</h3>
                    <button class="close-btn" type="button">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="prompt-actions">
                        <button class="btn primary copy-prompt-btn" type="button">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                            Copy to Clipboard
                        </button>
                        <button class="btn secondary download-prompt-btn" type="button">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                            </svg>
                            Download as Text
                        </button>
                    </div>
                    <textarea class="context-prompt-textarea" readonly>${contextPrompt}</textarea>
                    <p class="prompt-info">
                        📚 This knowledge base provides comprehensive context about "${folderName}". 
                        Anyone reading this will understand the project/person/idea completely. Perfect for sharing with team members, 
                        using as AI context, or as a standalone reference document.
                    </p>
                </div>
                <div class="modal-footer">
                    <button class="btn secondary close-modal-btn" type="button">Close</button>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('.close-btn').addEventListener('click', () => modal.remove());
        modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelector('.copy-prompt-btn').addEventListener('click', () => {
            this.copyToClipboard(contextPrompt, 'Context prompt copied to clipboard!');
        });

        modal.querySelector('.download-prompt-btn').addEventListener('click', () => {
            this.downloadPromptAsText(folderName, contextPrompt);
        });

        document.body.appendChild(modal);
    }

    async copyToClipboard(text, successMessage = 'Copied to clipboard!') {
        try {
            await navigator.clipboard.writeText(text);
            this.showNotification(successMessage, 'success');
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            // Fallback method
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showNotification(successMessage, 'success');
        }
    }

    downloadPromptAsText(folderName, contextPrompt) {
        const blob = new Blob([contextPrompt], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folderName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_context_prompt.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showNotification('Context prompt downloaded!', 'success');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Settings methods
    async openSettings() {
        const result = await chrome.storage.local.get('openaiApiKey');
        this.apiKeyInput.value = result.openaiApiKey || '';
        this.settingsModal.classList.add('show');
        setTimeout(() => this.apiKeyInput.focus(), 100);
    }

    closeSettings() {
        this.settingsModal.classList.remove('show');
    }

    async saveSettings() {
        const apiKey = this.apiKeyInput.value.trim();
        
        if (apiKey && !apiKey.startsWith('sk-')) {
            alert('Please enter a valid OpenAI API key (should start with "sk-")');
            return;
        }

        await chrome.storage.local.set({ openaiApiKey: apiKey });
        this.closeSettings();
        
        if (apiKey) {
            alert('API key saved successfully! You can now generate folder contexts.');
        }
    }
};
