class PopupManager {
    constructor() {
        this.folders = [];
        this.initializeElements();
        this.bindEvents();
        this.loadData();
    }

    initializeElements() {
        this.folderCountEl = document.getElementById('folder-count');
        this.nestedCountEl = document.getElementById('nested-count');
        this.folderListEl = document.getElementById('folder-list');
        this.openSidepanelBtn = document.getElementById('open-sidepanel');
        this.quickCreateBtn = document.getElementById('quick-create');
    }

    bindEvents() {
        this.openSidepanelBtn.addEventListener('click', () => this.openSidePanel());
        this.quickCreateBtn.addEventListener('click', () => this.quickCreate());
    }

    async loadData() {
        try {
            const result = await chrome.storage.local.get('zyphFolders');
            this.folders = result.zyphFolders || [];
            this.updateStats();
            this.renderRecentFolders();
        } catch (error) {
            console.error('Error loading folders:', error);
            this.folders = [];
            this.updateStats();
            this.renderEmptyState();
        }
    }

    updateStats() {
        const totalFolders = this.folders.length;
        const nestedFolders = this.folders.filter(folder => folder.parentId).length;
        
        this.folderCountEl.textContent = totalFolders;
        this.nestedCountEl.textContent = nestedFolders;
    }

    renderRecentFolders() {
        if (this.folders.length === 0) {
            this.renderEmptyState();
            return;
        }

        const recentFolders = [...this.folders]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

        this.folderListEl.innerHTML = '';
        
        recentFolders.forEach(folder => {
            const folderElement = this.createFolderElement(folder);
            this.folderListEl.appendChild(folderElement);
        });
    }

    createFolderElement(folder) {
        const div = document.createElement('div');
        div.className = 'folder-item';
        
        const childCount = folder.children ? folder.children.length : 0;
        
        div.innerHTML = `
            <svg class="folder-icon" viewBox="0 0 24 24" fill="currentColor">
                ${this.getIconSvg(folder.icon)}
            </svg>
            <span class="folder-name">${folder.name}</span>
            ${childCount > 0 ? `<span class="folder-count">${childCount}</span>` : ''}
        `;

        div.addEventListener('click', () => this.openSidePanel());
        
        return div;
    }

    renderEmptyState() {
        this.folderListEl.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
                </svg>
                <p>No folders created yet.<br>Start organizing your information!</p>
            </div>
        `;
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

    async openSidePanel() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs[0];
            
            await chrome.sidePanel.open({ windowId: tab.windowId });
            window.close();
        } catch (error) {
            console.error('Error opening side panel:', error);
        }
    }

    async quickCreate() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs[0];
            
            await chrome.sidePanel.open({ windowId: tab.windowId });
            
            chrome.runtime.sendMessage({
                action: 'triggerQuickCreate'
            });
            
            window.close();
        } catch (error) {
            console.error('Error triggering quick create:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});