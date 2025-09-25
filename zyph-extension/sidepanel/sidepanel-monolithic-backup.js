class FolderManager {
    constructor() {
        this.folders = [];
        this.selectedFolder = null;
        this.editingFolder = null;
        
        this.initializeElements();
        this.bindEvents();
        this.loadFolders();
        this.setupMessageListener();
    }

    initializeElements() {
        this.folderTree = document.getElementById('folder-tree');
        this.searchInput = document.getElementById('search-input');
        this.folderModal = document.getElementById('folder-modal');
        this.folderNameInput = document.getElementById('folder-name');
        this.parentFolderSelect = document.getElementById('parent-folder');
        this.saveFolderBtn = document.getElementById('save-folder-btn');
        this.cancelBtn = document.getElementById('cancel-btn');
        this.closeModalBtn = document.getElementById('close-modal');
        this.folderActions = document.getElementById('folder-actions');
        this.renameFolderBtn = document.getElementById('rename-folder');
        this.deleteFolderBtn = document.getElementById('delete-folder');
        this.modalTitle = document.getElementById('modal-title');
        this.iconSelector = document.getElementById('icon-selector');
        
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
                this.openCreateModal();
            }
            if (e.target.closest('.folder-action-btn.add-subfolder')) {
                const folderId = e.target.closest('.folder-item').dataset.folderId;
                this.openCreateModal(folderId);
            }
        });
        
        this.saveFolderBtn.addEventListener('click', () => this.saveFolder());
        this.cancelBtn.addEventListener('click', () => this.closeModal());
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.searchInput.addEventListener('input', (e) => this.searchFolders(e.target.value));
        this.renameFolderBtn.addEventListener('click', () => this.openEditModal());
        this.deleteFolderBtn.addEventListener('click', () => this.deleteFolder());
        
        // Settings events
        this.settingsBtn.addEventListener('click', () => this.openSettings());
        this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
        this.cancelSettingsBtn.addEventListener('click', () => this.closeSettings());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        
        this.iconSelector.addEventListener('click', (e) => {
            if (e.target.closest('.icon-option')) {
                this.selectIcon(e.target.closest('.icon-option'));
            }
        });

        this.folderModal.addEventListener('click', (e) => {
            if (e.target === this.folderModal) {
                this.closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        // Settings modal clicks
        this.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.closeSettings();
            }
        });
    }

    async openSettings() {
        // Load current API key
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

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'regenerateContext') {
                // Only regenerate if we have the API key and the folder is currently selected
                chrome.storage.local.get('openaiApiKey').then(result => {
                    if (result.openaiApiKey && this.selectedFolder && this.selectedFolder.id === message.folderId) {
                        // Add a small delay to allow content to be saved first
                        setTimeout(() => {
                            this.generateFolderContext(message.folderId);
                        }, 1000);
                    }
                });
            }
            sendResponse({ success: true });
        });
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    createFolder(name, icon = 'folder', parentId = null) {
        const folder = {
            id: this.generateId(),
            name: name.trim(),
            icon: icon,
            parentId: parentId,
            children: [],
            expanded: false,
            createdAt: new Date().toISOString(),
            context: {
                summary: null,
                lastUpdated: null,
                isGenerating: false
            }
        };

        if (parentId) {
            const parent = this.findFolderById(parentId);
            if (parent) {
                parent.children.push(folder.id);
            }
        }

        this.folders.push(folder);
        this.saveFolders();
        this.renderFolders();
        return folder;
    }

    findFolderById(id) {
        return this.folders.find(folder => folder.id === id);
    }

    getFolderChildren(folderId) {
        const folder = this.findFolderById(folderId);
        return folder ? folder.children.map(childId => this.findFolderById(childId)).filter(Boolean) : [];
    }

    getRootFolders() {
        return this.folders.filter(folder => !folder.parentId);
    }

    openCreateModal(parentId = null) {
        this.editingFolder = null;
        this.modalTitle.textContent = 'Create New Folder';
        this.saveFolderBtn.textContent = 'Create Folder';
        this.folderNameInput.value = '';
        this.populateParentSelect(parentId);
        this.selectIcon(this.iconSelector.querySelector('.icon-option[data-icon="folder"]'));
        this.showModal();
    }

    openEditModal() {
        if (!this.selectedFolder) return;
        
        this.editingFolder = this.selectedFolder;
        this.modalTitle.textContent = 'Edit Folder';
        this.saveFolderBtn.textContent = 'Save Changes';
        this.folderNameInput.value = this.selectedFolder.name;
        this.populateParentSelect(this.selectedFolder.parentId, this.selectedFolder.id);
        this.selectIcon(this.iconSelector.querySelector(`[data-icon="${this.selectedFolder.icon}"]`));
        this.showModal();
    }

    populateParentSelect(selectedParentId = null, excludeFolderId = null) {
        this.parentFolderSelect.innerHTML = '<option value="">Root Level</option>';
        
        const addFolderOptions = (folders, depth = 0) => {
            folders.forEach(folder => {
                if (folder.id === excludeFolderId) return;
                
                const option = document.createElement('option');
                option.value = folder.id;
                option.textContent = '  '.repeat(depth) + folder.name;
                if (folder.id === selectedParentId) {
                    option.selected = true;
                }
                this.parentFolderSelect.appendChild(option);
                
                const children = this.getFolderChildren(folder.id);
                if (children.length > 0) {
                    addFolderOptions(children, depth + 1);
                }
            });
        };

        addFolderOptions(this.getRootFolders());
    }

    selectIcon(iconElement) {
        this.iconSelector.querySelectorAll('.icon-option').forEach(el => {
            el.classList.remove('selected');
        });
        iconElement.classList.add('selected');
    }

    saveFolder() {
        const name = this.folderNameInput.value.trim();
        if (!name) {
            this.folderNameInput.focus();
            return;
        }

        const selectedIcon = this.iconSelector.querySelector('.icon-option.selected');
        const icon = selectedIcon ? selectedIcon.dataset.icon : 'folder';
        const parentId = this.parentFolderSelect.value || null;

        if (this.editingFolder) {
            this.editingFolder.name = name;
            this.editingFolder.icon = icon;
            
            if (this.editingFolder.parentId !== parentId) {
                if (this.editingFolder.parentId) {
                    const oldParent = this.findFolderById(this.editingFolder.parentId);
                    if (oldParent) {
                        oldParent.children = oldParent.children.filter(id => id !== this.editingFolder.id);
                    }
                }
                
                if (parentId) {
                    const newParent = this.findFolderById(parentId);
                    if (newParent && !newParent.children.includes(this.editingFolder.id)) {
                        newParent.children.push(this.editingFolder.id);
                    }
                }
                
                this.editingFolder.parentId = parentId;
            }
        } else {
            this.createFolder(name, icon, parentId);
        }

        this.saveFolders();
        this.renderFolders();
        this.closeModal();
    }

    deleteFolder() {
        if (!this.selectedFolder) return;
        
        if (confirm(`Are you sure you want to delete "${this.selectedFolder.name}" and all its contents?`)) {
            this.deleteFolderRecursive(this.selectedFolder.id);
            this.selectedFolder = null;
            this.hideFolderActions();
            this.saveFolders();
            this.renderFolders();
        }
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
            this.renderFolders();
        }
    }

    selectFolder(folder) {
        this.selectedFolder = folder;
        this.showFolderActions();
        this.renderFolders();
        this.loadFolderContent(folder.id);
    }

    showFolderActions() {
        this.folderActions.style.display = 'flex';
    }

    hideFolderActions() {
        this.folderActions.style.display = 'none';
    }

    showModal() {
        this.folderModal.classList.add('show');
        setTimeout(() => this.folderNameInput.focus(), 100);
    }

    closeModal() {
        this.folderModal.classList.remove('show');
        this.editingFolder = null;
    }

    getIconSvg(iconType) {
        const icons = {
            folder: '<path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>',
            work: '<path d="M20 6h-2.5l-1.1-1.1c-.4-.4-.9-.6-1.4-.6H9c-.5 0-1 .2-1.4.6L6.5 6H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 11c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z"/>',
            person: '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
            home: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
            star: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
            bookmark: '<path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/>'
        };
        return icons[iconType] || icons.folder;
    }

    renderFolders(searchTerm = '') {
        // Add/remove searching class for CSS styling
        if (searchTerm) {
            this.folderTree.classList.add('searching');
        } else {
            this.folderTree.classList.remove('searching');
        }

        const filteredFolders = searchTerm ? 
            this.folders.filter(folder => 
                folder.name.toLowerCase().includes(searchTerm.toLowerCase())
            ) : this.getRootFolders();

        if (filteredFolders.length === 0 && !searchTerm) {
            this.renderEmptyState();
            return;
        }

        if (searchTerm) {
            this.renderSearchResults(filteredFolders);
        } else {
            this.renderFolderTree();
        }
    }

    renderFolderTree() {
        const rootFolders = this.getRootFolders();
        
        // Clear tree but preserve create button
        const createButton = this.folderTree.querySelector('.create-root-folder');
        this.folderTree.innerHTML = '';
        if (createButton) {
            this.folderTree.appendChild(createButton);
        }
        
        if (rootFolders.length > 0) {
            this.folderTree.classList.add('has-folders');
            this.renderFolderLevel(rootFolders, 0);
        } else {
            this.folderTree.classList.remove('has-folders');
        }
    }

    renderFolderLevel(folders, depth) {
        folders.forEach(folder => {
            const folderElement = this.createFolderElement(folder, depth);
            this.folderTree.appendChild(folderElement);

            if (folder.expanded && folder.children.length > 0) {
                const children = this.getFolderChildren(folder.id);
                this.renderFolderLevel(children, depth + 1);
            }
        });
    }

    createFolderElement(folder, depth) {
        const div = document.createElement('div');
        div.className = `folder-item ${depth > 0 ? 'nested' : ''} ${this.selectedFolder?.id === folder.id ? 'selected' : ''}`;
        div.style.marginLeft = `${depth * 20}px`;
        div.dataset.folderId = folder.id;

        const hasChildren = folder.children.length > 0;
        const toggleClass = hasChildren ? (folder.expanded ? 'expanded' : '') : 'empty';

        div.innerHTML = `
            <button class="folder-toggle ${toggleClass}">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                </svg>
            </button>
            <svg class="folder-icon" viewBox="0 0 24 24" fill="currentColor">
                ${this.getIconSvg(folder.icon)}
            </svg>
            <span class="folder-name">${folder.name}</span>
            ${hasChildren ? `<span class="folder-count">${folder.children.length}</span>` : ''}
            <div class="folder-actions-inline">
                <button class="folder-action-btn add-subfolder" title="Add subfolder">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
                    </svg>
                </button>
            </div>
        `;

        const toggle = div.querySelector('.folder-toggle');
        if (hasChildren) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFolder(folder.id);
            });
        }

        div.addEventListener('click', (e) => {
            if (!e.target.closest('.folder-action-btn')) {
                this.selectFolder(folder);
            }
        });

        return div;
    }

    renderSearchResults(folders) {
        // Clear tree but preserve create button
        const createButton = this.folderTree.querySelector('.create-root-folder');
        this.folderTree.innerHTML = '';
        if (createButton) {
            this.folderTree.appendChild(createButton);
        }
        
        folders.forEach(folder => {
            const folderElement = this.createFolderElement(folder, 0);
            this.folderTree.appendChild(folderElement);
        });
    }

    renderEmptyState() {
        // Clear tree but preserve create button
        const createButton = this.folderTree.querySelector('.create-root-folder');
        this.folderTree.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
                </svg>
                <h3>No folders found</h3>
                <p>Create your first folder to get started organizing your information.</p>
            </div>
        `;
        if (createButton) {
            this.folderTree.appendChild(createButton);
        }
    }

    searchFolders(searchTerm) {
        this.renderFolders(searchTerm);
        if (searchTerm) {
            this.hideFolderActions();
        }
    }

    saveFolders() {
        chrome.storage.local.set({ 
            zyphFolders: this.folders 
        });
        
        // Update context menus when folders change
        chrome.runtime.sendMessage({
            action: 'updateContextMenus'
        });
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
            
            this.renderFolders();
        } catch (error) {
            console.error('Error loading folders:', error);
            this.folders = [];
            this.renderFolders();
        }
    }

    async loadFolderContent(folderId) {
        try {
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            const folderContent = allContent.filter(item => item.folderId === folderId);
            
            this.displayFolderContent(folderContent);
        } catch (error) {
            console.error('Error loading folder content:', error);
        }
    }

    displayFolderContent(content) {
        // Create content panel if it doesn't exist
        let contentPanel = document.getElementById('folder-content-panel');
        if (!contentPanel) {
            contentPanel = document.createElement('div');
            contentPanel.id = 'folder-content-panel';
            contentPanel.className = 'folder-content-panel';
            document.body.appendChild(contentPanel);
        }

        if (content.length === 0) {
            contentPanel.innerHTML = `
                <div class="content-header">
                    <h3>${this.selectedFolder.name}</h3>
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
            // Sort content by timestamp in descending order (newest first)
            const sortedContent = [...content].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const contentHTML = sortedContent.map(item => this.createContentItemHTML(item)).join('');
            const contextHTML = this.createContextHTML(this.selectedFolder);
            
            contentPanel.innerHTML = `
                <div class="content-header">
                    <h3>${this.selectedFolder.name} (${content.length} items)</h3>
                    <button class="close-content-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                ${contextHTML}
                <div class="content-list">
                    ${contentHTML}
                </div>
            `;
        }

        contentPanel.classList.add('show');
        
        // Add event listeners for content actions
        this.addContentEventListeners(contentPanel);
    }

    addContentEventListeners(contentPanel) {
        contentPanel.addEventListener('click', (e) => {
            const refreshButton = e.target.closest('.context-refresh-btn');
            if (refreshButton) {
                const { folderId } = refreshButton.dataset;
                if (folderId) {
                    refreshButton.disabled = true;
                    this.generateFolderContext(folderId);
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
                    this.resetGeneratingState(folderId);
                }
                return;
            }

            // Handle content header row click to show raw data modal
            if (e.target.closest('.content-header-row')) {
                const headerRow = e.target.closest('.content-header-row');
                const contentId = headerRow.dataset.contentId;
                this.showContentModal(contentId);
                return;
            }
            
            // Handle close button
            if (e.target.closest('.close-content-btn')) {
                contentPanel.remove();
            }
        });
    }

    async showContentModal(contentId) {
        try {
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            const item = allContent.find(content => content.id === contentId);
            
            if (!item) return;

            const date = new Date(item.timestamp).toLocaleDateString();
            const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const hasRawHtml = item.rawHtml && item.rawHtml.fullSource;
            
            const modal = document.createElement('div');
            modal.className = 'content-modal-overlay';
            modal.innerHTML = `
                <div class="content-modal">
                    <div class="content-modal-header">
                        <h3>${item.title}</h3>
                        <button class="close-modal-btn">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="content-modal-meta">
                        <span>${item.domain}</span>
                        <span>${date} ${time}</span>
                        <span>${item.type === 'selection' ? 'Text Selection' : 'Full Page'}</span>
                    </div>
                    <div class="content-modal-actions">
                        <button class="modal-action-btn download-text-btn" data-content-id="${item.id}">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
                            </svg>
                            Download Text
                        </button>
                        ${hasRawHtml ? `
                        <button class="modal-action-btn download-html-btn" data-content-id="${item.id}">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
                            </svg>
                            Download HTML
                        </button>
                        ` : ''}
                        <button class="modal-action-btn delete-btn" data-content-id="${item.id}">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                            Delete
                        </button>
                    </div>
                    <div class="content-modal-body">
                        <h4>Raw Data:</h4>
                        <pre class="raw-content">${this.escapeHtml(item.content)}</pre>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Add event listeners
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.closest('.close-modal-btn')) {
                    modal.remove();
                }
                
                if (e.target.closest('.download-text-btn')) {
                    this.downloadTextFile(item);
                }
                
                if (e.target.closest('.download-html-btn')) {
                    this.downloadHtmlFile(item.id);
                }
                
                if (e.target.closest('.delete-btn')) {
                    if (confirm('Are you sure you want to delete this content?')) {
                        this.deleteContentItem(item.id);
                        modal.remove();
                    }
                }
            });

        } catch (error) {
            console.error('Error showing content modal:', error);
        }
    }

    downloadTextFile(item) {
        const blob = new Blob([item.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async generateFolderContext(folderId) {
        try {
            const folder = this.findFolderById(folderId);
            if (!folder) return;

            // Ensure folder has context property (for folders created before this feature)
            if (!folder.context) {
                folder.context = {
                    summary: null,
                    lastUpdated: null,
                    isGenerating: false
                };
            }

            // Mark as generating
            folder.context.isGenerating = true;
            this.saveFolders();
            this.updateContextDisplay(folderId);

            // Get API key from storage
            const result = await chrome.storage.local.get('openaiApiKey');
            if (!result.openaiApiKey) {
                throw new Error('OpenAI API key not found. Please set it in settings.');
            }

            // Get folder content
            const contentResult = await chrome.storage.local.get('zyphContent');
            const allContent = contentResult.zyphContent || [];
            const folderContent = allContent.filter(item => item.folderId === folderId);

            if (folderContent.length === 0) {
                folder.context.summary = 'No content available in this folder yet.';
                folder.context.lastUpdated = new Date().toISOString();
                folder.context.isGenerating = false;
                this.saveFolders();
                this.updateContextDisplay(folderId);
                return;
            }

            // Prepare content for API
            const contentText = folderContent.map(item => {
                return `Title: ${item.title}\nURL: ${item.url}\nDate: ${new Date(item.timestamp).toLocaleDateString()}\nContent: ${item.content}\n---`;
            }).join('\n\n');

            const existingContext = folder.context.summary;
            
            // Generate context using OpenAI
            const newContext = await this.callOpenAIAPI(result.openaiApiKey, contentText, existingContext, folder.name);
            
            // Update folder context
            folder.context.summary = newContext;
            folder.context.lastUpdated = new Date().toISOString();
            folder.context.isGenerating = false;
            
            this.saveFolders();
            this.updateContextDisplay(folderId);

        } catch (error) {
            console.error('Error generating folder context:', error);
            const folder = this.findFolderById(folderId);
            if (folder) {
                folder.context.isGenerating = false;
                this.saveFolders();
                this.updateContextDisplay(folderId);
            }
            alert(`Failed to generate context: ${error.message}`);
        }
    }

    resetGeneratingState(folderId) {
        const folder = this.findFolderById(folderId);
        if (folder) {
            folder.context.isGenerating = false;
            this.saveFolders();
            this.updateContextDisplay(folderId);
        }
    }

    async loadSystemPrompt(folderName) {
        try {
            console.log(`[OpenAI API] Loading system prompt from file...`);
            const response = await fetch(chrome.runtime.getURL('prompts/system-prompt.txt'));
            if (!response.ok) {
                throw new Error(`Failed to load system prompt: ${response.status}`);
            }
            const promptTemplate = await response.text();
            const systemPrompt = promptTemplate.replace('{folderName}', folderName);
            console.log(`[OpenAI API] System prompt loaded and customized for folder: ${folderName}`);
            return systemPrompt;
        } catch (error) {
            console.warn(`[OpenAI API] Could not load system prompt from file, using fallback:`, error);
            // Fallback to inline prompt if file loading fails
            return `You are a knowledge base curator creating comprehensive overviews for folders containing content about projects, people, or ideas. For the folder "${folderName}", analyze all provided content and create a detailed knowledge base overview that explains:

1. What this folder is about (main subject/purpose)
2. Key entities involved (people, organizations, projects, concepts)
3. Important details, facts, and context
4. Current status or recent developments
5. Relationships between different pieces of content

Make it comprehensive enough that anyone reading it will understand the full context and background. Structure it clearly with key points and specific details. Aim for 3-4 paragraphs that serve as a complete knowledge base overview.`;
        }
    }

    async callOpenAIAPI(apiKey, contentText, existingContext, folderName) {
        console.log(`[OpenAI API] Starting API call for folder: ${folderName}`);
        console.log(`[OpenAI API] Content length: ${contentText.length} characters`);
        console.log(`[OpenAI API] Has existing context: ${!!existingContext}`);
        
        // Load system prompt from file
        const systemPrompt = await this.loadSystemPrompt(folderName);
        
        const messages = [
            {
                role: 'system',
                content: systemPrompt
            }
        ];

        if (existingContext) {
            messages.push({
                role: 'user',
                content: `Here's the existing context for this folder:\n\n${existingContext}\n\nHere's the current content in the folder:\n\n${contentText}\n\nPlease update the context summary to reflect all the content, incorporating both existing insights and new information.`
            });
            console.log(`[OpenAI API] Using existing context mode`);
        } else {
            messages.push({
                role: 'user',
                content: `Here's the content in the folder:\n\n${contentText}\n\nPlease create a context summary that captures the main themes, topics, and key information from this content.`
            });
            console.log(`[OpenAI API] Creating new context`);
        }

        console.log(`[OpenAI API] Total messages: ${messages.length}`);
        console.log(`[OpenAI API] User message length: ${messages[messages.length - 1].content.length} characters`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const requestBody = {
            model: 'gpt-4.1',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.3
        };
        
        console.log(`[OpenAI API] Request body:`, {
            model: requestBody.model,
            messageCount: requestBody.messages.length,
            maxTokens: requestBody.max_tokens,
            temperature: requestBody.temperature
        });
        console.log(`[OpenAI API] API key prefix: ${apiKey.substring(0, 7)}...`);
        
        try {
            console.log(`[OpenAI API] Making request to OpenAI...`);
            const startTime = Date.now();
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;
            console.log(`[OpenAI API] Response received in ${duration}ms`);
            console.log(`[OpenAI API] Response status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                console.log(`[OpenAI API] Error response - status: ${response.status}`);
                let errorMessage = `API request failed with status ${response.status}`;
                try {
                    const error = await response.json();
                    console.log(`[OpenAI API] Error details:`, error);
                    errorMessage = error.error?.message || errorMessage;
                } catch (e) {
                    console.log(`[OpenAI API] Could not parse error response:`, e);
                    errorMessage = `API request failed: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            console.log(`[OpenAI API] Parsing response...`);
            const data = await response.json();
            console.log(`[OpenAI API] Response data:`, {
                choices: data.choices?.length || 0,
                usage: data.usage,
                model: data.model
            });
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.log(`[OpenAI API] Invalid response format:`, data);
                throw new Error('Invalid response format from OpenAI API');
            }
            
            const content = data.choices[0].message.content.trim();
            console.log(`[OpenAI API] Generated content length: ${content.length} characters`);
            console.log(`[OpenAI API] Content preview: ${content.substring(0, 100)}...`);
            console.log(`[OpenAI API] API call completed successfully`);
            
            return content;
            
        } catch (error) {
            clearTimeout(timeoutId);
            console.log(`[OpenAI API] Error occurred:`, error);
            if (error.name === 'AbortError') {
                console.log(`[OpenAI API] Request timed out`);
                throw new Error('Request timed out after 30 seconds. Please try again.');
            }
            throw error;
        }
    }

    createContextHTML(folder) {
        // Ensure folder has context property (for folders created before this feature)
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
        const contextElement = document.getElementById(`folder-context-${folderId}`);
        if (contextElement) {
            const folder = this.findFolderById(folderId);
            if (folder) {
                const newContextHTML = this.createContextHTML(folder);
                const parser = new DOMParser();
                const newElement = parser.parseFromString(newContextHTML, 'text/html').body.firstChild;
                contextElement.replaceWith(newElement);
            }
        }
    }

    createContentItemHTML(item) {
        const date = new Date(item.timestamp).toLocaleDateString();
        const typeIcon = item.type === 'selection' ? '📝' : '📄';
        
        return `
            <div class="content-item" data-content-id="${item.id}">
                <div class="content-header-row" data-content-id="${item.id}">
                    <div class="content-icon">${typeIcon}</div>
                    <span class="content-header-text">${item.title} - ${date}</span>
                    <svg class="expand-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                    </svg>
                </div>
            </div>
        `;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    switchContentTab(contentItem, tabType) {
        // Update tab buttons
        const tabs = contentItem.querySelectorAll('.content-tab');
        const panels = contentItem.querySelectorAll('.tab-panel');
        
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabType);
        });
        
        panels.forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabType);
        });
    }

    async viewHtmlSource(contentId) {
        try {
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            const item = allContent.find(content => content.id === contentId);
            
            if (item && item.rawHtml) {
                this.showHtmlViewer(item);
            }
        } catch (error) {
            console.error('Error viewing HTML source:', error);
        }
    }

    showHtmlViewer(item) {
        const viewer = document.createElement('div');
        viewer.className = 'html-viewer-modal';
        viewer.innerHTML = `
            <div class="html-viewer-content">
                <div class="html-viewer-header">
                    <h3>HTML Source: ${item.title}</h3>
                    <div class="html-viewer-actions">
                        <button class="btn secondary close-viewer-btn" type="button">Close</button>
                        <button class="btn primary download-btn" data-content-id="${item.id}">Download</button>
                    </div>
                </div>
                <div class="html-viewer-body">
                    <div class="html-info">
                        <span>Size: ${this.formatFileSize(item.rawHtml.size)}</span>
                        <span>Scripts: ${item.rawHtml.scripts.length}</span>
                        <span>Stylesheets: ${item.rawHtml.stylesheets.length}</span>
                    </div>
                    <pre><code class="html-source-full">${this.escapeHtml(item.rawHtml.fullSource)}</code></pre>
                </div>
            </div>
        `;

        // Add event listener for download button
        viewer.querySelector('.download-btn').addEventListener('click', () => {
            this.downloadHtmlFile(item.id);
        });

        const closeButton = viewer.querySelector('.close-viewer-btn');
        if (closeButton) {
            closeButton.addEventListener('click', () => viewer.remove());
        }

        document.body.appendChild(viewer);
    }

    async generateContextPrompt(folderId) {
        try {
            const folder = this.findFolderById(folderId);
            if (!folder || !folder.context.summary) {
                alert('No context available to generate prompt');
                return;
            }

            // Get folder content
            const contentResult = await chrome.storage.local.get('zyphContent');
            const allContent = contentResult.zyphContent || [];
            const folderContent = allContent.filter(item => item.folderId === folderId);

            // Generate formatted context prompt
            const contextPrompt = this.createFormattedPrompt(folder, folderContent);
            
            // Show the prompt in a modal for copying
            this.showContextPromptModal(folder.name, contextPrompt);

        } catch (error) {
            console.error('Error generating context prompt:', error);
            alert('Failed to generate context prompt');
        }
    }

    createFormattedPrompt(folder, folderContent) {
        const timestamp = new Date().toLocaleString();
        const contentCount = folderContent.length;
        const dateRange = this.getContentDateRange(folderContent);
        
        let prompt = `# Knowledge Base: ${folder.name}\n`;
        prompt += `*Last updated: ${timestamp} | ${contentCount} sources | Date range: ${dateRange}*\n\n`;
        
        // Add executive summary
        prompt += `## Executive Overview\n${folder.context.summary}\n\n`;
        
        // Add key facts section
        if (folderContent.length > 0) {
            const keyFacts = this.extractKeyFacts(folderContent);
            if (keyFacts.length > 0) {
                prompt += `## Key Facts & Entities\n\n`;
                keyFacts.forEach(fact => {
                    prompt += `- ${fact}\n`;
                });
                prompt += `\n`;
            }
        }
        
        // Add detailed sources
        if (folderContent.length > 0) {
            prompt += `## Detailed Sources & Content\n\n`;
            
            folderContent.forEach((item, index) => {
                prompt += `### Source ${index + 1}: ${item.title}\n`;
                prompt += `**URL:** ${item.url}\n`;
                prompt += `**Collected:** ${new Date(item.timestamp).toLocaleDateString()}\n`;
                prompt += `**Type:** ${item.type === 'selection' ? 'Selected Text' : 'Full Page Content'}\n\n`;
                prompt += `**Content:**\n${item.content}\n\n`;
                prompt += `---\n\n`;
            });
        }
        
        // Add timeline if multiple dates
        if (folderContent.length > 1) {
            prompt += `## Content Timeline\n\n`;
            const sortedContent = [...folderContent].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            sortedContent.forEach(item => {
                prompt += `- **${new Date(item.timestamp).toLocaleDateString()}:** ${item.title}\n`;
            });
            prompt += `\n`;
        }
        
        // Add context for understanding
        prompt += `## About This Knowledge Base\n\n`;
        prompt += `This comprehensive knowledge base contains all essential information about **${folder.name}**. `;
        prompt += `It has been curated from ${contentCount} verified web sources and provides complete context for understanding this subject.\n\n`;
        
        prompt += `**Purpose:** This knowledge base serves as a complete reference that enables anyone to quickly understand the background, current status, key players, and important details related to ${folder.name}. Perfect for onboarding, research, or as context for AI assistance.\n\n`;
        
        prompt += `**Content Validation:** All information is sourced from original web content with URLs provided for verification and further research.\n\n`;
        
        prompt += `*Generated by Zyph Extension - Intelligent Web Content Organization*`;
        
        return prompt;
    }

    getContentDateRange(folderContent) {
        if (folderContent.length === 0) return 'No content';
        if (folderContent.length === 1) return new Date(folderContent[0].timestamp).toLocaleDateString();
        
        const dates = folderContent.map(item => new Date(item.timestamp));
        const earliest = new Date(Math.min(...dates));
        const latest = new Date(Math.max(...dates));
        
        return `${earliest.toLocaleDateString()} - ${latest.toLocaleDateString()}`;
    }

    extractKeyFacts(folderContent) {
        const facts = [];
        
        // Extract URLs and domains
        const domains = [...new Set(folderContent.map(item => {
            try {
                return new URL(item.url).hostname;
            } catch {
                return null;
            }
        }).filter(Boolean))];
        
        if (domains.length > 0) {
            facts.push(`Primary sources: ${domains.slice(0, 3).join(', ')}${domains.length > 3 ? ` and ${domains.length - 3} others` : ''}`);
        }
        
        // Extract dates
        const dateRange = this.getContentDateRange(folderContent);
        if (dateRange !== 'No content') {
            facts.push(`Content collection period: ${dateRange}`);
        }
        
        // Extract content types
        const hasSelections = folderContent.some(item => item.type === 'selection');
        const hasFullPages = folderContent.some(item => item.type !== 'selection');
        
        if (hasSelections && hasFullPages) {
            facts.push('Content mix: Selected text excerpts and full page captures');
        } else if (hasSelections) {
            facts.push('Content type: Curated text selections');
        } else if (hasFullPages) {
            facts.push('Content type: Full page documentation');
        }
        
        return facts;
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

    async downloadHtmlFile(contentId) {
        try {
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            const item = allContent.find(content => content.id === contentId);
            
            if (item && item.rawHtml) {
                const blob = new Blob([item.rawHtml.fullSource], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error downloading HTML file:', error);
        }
    }

    async deleteContentItem(contentId) {
        if (!confirm('Are you sure you want to delete this content?')) return;
        
        try {
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = result.zyphContent || [];
            const updatedContent = allContent.filter(item => item.id !== contentId);
            
            await chrome.storage.local.set({ zyphContent: updatedContent });
            
            // Refresh the content display
            if (this.selectedFolder) {
                this.loadFolderContent(this.selectedFolder.id);
            }
        } catch (error) {
            console.error('Error deleting content:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.folderManager = new FolderManager();
});
