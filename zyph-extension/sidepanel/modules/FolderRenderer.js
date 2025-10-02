window.Zyph = window.Zyph || {};

window.Zyph.FolderRenderer = class FolderRenderer {
    constructor(folderManager) {
        this.folderManager = folderManager;
    }

    async renderFolders(folderTree) {
        let status = this.folderManager.getRemoteStatus();
        let folders = [];
        try {
            // Force refresh to get latest folders from zyph.com
            folders = await this.folderManager.loadFolders({ forceRefresh: true });
            status = this.folderManager.getRemoteStatus();

            // Update context menus after loading folders
            this.folderManager.updateContextMenus();
        } catch (error) {
            console.error('[FolderRenderer] Failed to load folders:', error);
        }

        const rootFolders = folders.filter(folder => !folder.parentId);
        let html = '';

        // Add folder creation button at the top
        html += this.renderFolderActions();

        if (status.state === 'loading') {
            html += this.renderStatusMessage('Loading folders from Zyph.com...', 'info');
        } else if (status.state === 'error') {
            const message = status.message || 'Unable to load folders from Zyph.com.';
            html += this.renderStatusMessage(`${message} <button class="remote-status-action" data-action="open-settings">Reconnect</button>`, 'error');
        } else if (status.state === 'unavailable') {
            html += this.renderStatusMessage('Zyph.com integration is unavailable in this context.', 'warning');
        } else if (status.state === 'ready' && rootFolders.length === 0) {
            html += this.renderStatusMessage('No folders found. Create a folder to get started!', 'info');
        }

        rootFolders.forEach(folder => {
            html += this.createFolderHTML(folder, folders);
        });

        html += this.renderManageHint();
        folderTree.innerHTML = html;
    }

    renderFolderActions() {
        return `
            <div class="folder-actions">
                <button class="create-folder-btn" data-action="create-folder" title="Create new folder">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    <span>New Folder</span>
                </button>
            </div>
        `;
    }

    renderStatusMessage(message, tone = 'info') {
        return `
            <div class="remote-folder-status ${tone}">
                <span>${message}</span>
            </div>
        `;
    }

    renderManageHint() {
        return `
            <div class="remote-manage-hint">
                <button class="manage-remote-btn" data-action="open-remote-management">
                    Manage folders on Zyph.com
                </button>
            </div>
        `;
    }

    createFolderHTML(folder, allFolders, depth = 0) {
        const children = allFolders.filter(f => f.parentId === folder.id);
        const hasChildren = children.length > 0;
        const isSelected = this.folderManager.selectedFolder && this.folderManager.selectedFolder.id === folder.id;
        const remotePath = folder.remote?.path && folder.remote.path !== folder.name
            ? this.escapeHtml(folder.remote.path)
            : null;
        const infoTitle = remotePath ? ` title="Linked to ${remotePath}"` : '';

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

                    <div class="folder-info"${infoTitle}>
                        <span class="folder-name">${this.escapeHtml(folder.name)}</span>
                    </div>

                    ${this.renderRemoteBadge(folder)}

                    <div class="folder-actions-menu">
                        <button class="folder-menu-btn" title="Folder options">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                            </svg>
                        </button>
                        <div class="folder-menu-dropdown">
                            <button class="menu-item" data-action="create-subfolder" data-parent-id="${folder.id}">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                                </svg>
                                <span>New Subfolder</span>
                            </button>
                            <button class="menu-item" data-action="rename-folder" data-folder-id="${folder.id}">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                                </svg>
                                <span>Rename</span>
                            </button>
                            <button class="menu-item danger" data-action="delete-folder" data-folder-id="${folder.id}">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                </svg>
                                <span>Delete</span>
                            </button>
                        </div>
                    </div>
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

    renderRemoteBadge(folder) {
        if (!folder?.remote?.id) {
            return '';
        }
        const tooltip = this.escapeHtml(folder.remote.path || folder.remote.name || 'Zyph.com folder');
        return `
            <span class="remote-badge" title="Linked to ${tooltip}">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
                </svg>
            </span>
        `;
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

    escapeHtml(value) {
        if (typeof value !== 'string') {
            return '';
        }
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    filterFolders(folderTree, searchTerm) {
        const folderItems = folderTree.querySelectorAll('.folder-item');
        const term = searchTerm.toLowerCase();

        folderItems.forEach(item => {
            const folderName = item.querySelector('.folder-name').textContent.toLowerCase();
            const matches = folderName.includes(term);
            item.style.display = matches || !searchTerm ? 'block' : 'none';
        });
    }
};
