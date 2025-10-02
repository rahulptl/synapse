window.Zyph = window.Zyph || {};

const CONTENT_TYPE_ICONS = {
    page: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm3 18H7V4h6v5h5zm-8-3h8v-2H9zm0-4h8v-2H9z"/></svg>',
    selection: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3H9a2 2 0 0 0-2 2v16l4-4h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 12H10.83L9 16.83V5h10z"/></svg>'
};

const SECTION_ICONS = {
    saved: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-2-2h-8z"/></svg>',
    context: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V5h14zm-3-9H8v2h8zm0 4H8v2h8zm0-8H8v2h8z"/></svg>'
};


window.Zyph.ContentRenderer = class ContentRenderer {
    constructor(folderManager, contextGenerator) {
        this.folderManager = folderManager;
        this.contextGenerator = contextGenerator;
        this.expandedContentIds = new Set();
        this.currentContentItems = []; // Store currently displayed content items
    }

    displayFolderContent(content, options = {}) {
        const folderName = Zyph.Utils.escapeHtml(this.folderManager.selectedFolder?.name || '');

        let contentPanel = document.getElementById('folder-content-panel');
        if (!contentPanel) {
            contentPanel = document.createElement('div');
            contentPanel.id = 'folder-content-panel';
            contentPanel.className = 'folder-content-panel show';
            document.body.appendChild(contentPanel);
        } else {
            contentPanel.className = 'folder-content-panel show';
        }

        let renderedContent = [];

        if (content.length === 0) {
            contentPanel.innerHTML = `
                <div class="content-header">
                    <h3>${folderName}</h3>
                    <button class="close-content-btn" type="button">${Zyph.UI_ICONS.CLOSE}</button>
                </div>
                <div class="empty-content">
                    <p>No content saved to this folder yet.</p>
                    <p>Right-click on any webpage to save content here.</p>
                </div>
            `;
        } else {
            const sortedContent = [...content].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            this.currentContentItems = sortedContent; // Store content items for showContentInline
            const contentHTML = sortedContent.map(item => this.createContentItemHTML(item)).join('');
            const contextHTML = this.createContextHTML(this.folderManager.selectedFolder);

            contentPanel.innerHTML = `
                <div class="content-header">
                    <h3>${folderName}</h3>
                    <button class="close-content-btn" type="button">${Zyph.UI_ICONS.CLOSE}</button>
                </div>
                ${contextHTML}
                <div class="content-list">
                    <h4 class="content-list-title">
                        ${SECTION_ICONS.saved}
                        <span>Saved Content (${content.length})</span>
                    </h4>
                    ${contentHTML}
                </div>
            `;
            renderedContent = sortedContent;
        }

        if (options.preserveExpanded) {
            this.restoreExpandedContent(contentPanel, renderedContent);
        } else {
            this.expandedContentIds.clear();
        }

        return contentPanel;
    }

    createContentItemHTML(item) {
        const date = new Date(item.timestamp).toLocaleDateString();
        const icon = CONTENT_TYPE_ICONS[item.type] || CONTENT_TYPE_ICONS.page;
        const remoteBadge = this.buildRemoteSyncBadge(item);
        const title = Zyph.Utils.escapeHtml(item.title || 'Untitled');
        const pullButton = this.buildPullButton(item);

        return `
            <div class="content-item" data-content-id="${item.id}">
                <div class="content-header-row" data-content-id="${item.id}">
                    <div class="content-icon" aria-hidden="true">${icon}</div>
                    <span class="content-header-text">${title} - ${date}</span>
                    ${remoteBadge}
                    ${pullButton}
                    <button class="content-action-btn delete-content-btn" type="button" title="Remove from folder" data-content-id="${item.id}">
                        ${Zyph.UI_ICONS.DELETE}
                    </button>
                    <svg class="expand-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                    </svg>
                </div>
            </div>
        `;
    }

    buildPullButton(item) {
        const metadata = item?.metadata;
        if (!metadata?.needsPull || !metadata?.remoteSync?.remoteContentId) {
            return '';
        }

        const isFile = metadata.isFileContent;
        const isLoading = metadata.pullInProgress;

        if (isLoading) {
            return `
                <button class="content-action-btn pull-content-btn loading" type="button" disabled title="Loading content...">
                    ${Zyph.UI_ICONS.LOADING}
                </button>
            `;
        }

        const icon = isFile ? Zyph.UI_ICONS.DOWNLOAD : Zyph.UI_ICONS.RETRY;
        const title = isFile ? 'Download file' : 'Retry loading content';
        const action = isFile ? 'download' : 'retry';

        return `
            <button class="content-action-btn pull-content-btn" type="button" title="${title}" data-content-id="${item.id}" data-action="${action}" data-remote-id="${metadata.remoteSync.remoteContentId}">
                ${icon}
            </button>
        `;
    }

    buildRemoteSyncBadge(item) {
        const remote = item?.metadata?.remoteSync;
        if (!remote || !remote.folderId) {
            return '';
        }

        const baseState = remote.state || 'pending';
        const derivedState = remote.syncedAt && baseState !== 'error' ? 'synced' : baseState;
        const stateKey = ['synced', 'error', 'pending'].includes(derivedState) ? derivedState : 'pending';

        const icons = {
            synced: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1 15-4-4 1.41-1.41L11 14.17l4.59-4.58L17 11z"/></svg>',
            pending: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 11h-4V7h2v4h2z"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2zm0-4h-2v-4h2z"/></svg>'
        };

        const labels = {
            synced: 'Synced',
            pending: 'Syncing...',
            error: 'Sync error'
        };

        const tooltipParts = [];
        if (remote.folderPath) {
            tooltipParts.push(`Folder: ${remote.folderPath}`);
        }
        if (remote.syncedAt) {
            tooltipParts.push(`Synced: ${new Date(remote.syncedAt).toLocaleString()}`);
        }
        if (stateKey === 'error' && remote.errorMessage) {
            tooltipParts.push(`Error: ${remote.errorMessage}`);
        }
        if (remote.attempts) {
            tooltipParts.push(`Attempts: ${remote.attempts}`);
        }

        const tooltip = Zyph.Utils.escapeHtml(tooltipParts.join(' | ') || 'Synced with Zyph.com');

        return `
            <span class="remote-sync-badge remote-sync-${stateKey}" title="${tooltip}">
                ${icons[stateKey]}
                <span class="remote-sync-text">${labels[stateKey]}</span>
            </span>
        `;
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

        const generatingMarkup = `
            <span class="context-status generating">
                Generating...
                <button class="reset-btn" type="button" data-folder-id="${folder.id}" title="Cancel generation">${Zyph.UI_ICONS.CLOSE}</button>
            </span>
        `;

        const actionsMarkup = `
            <button class="context-refresh-btn" type="button" data-folder-id="${folder.id}">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/>
                </svg>
                Refresh
            </button>
            ${hasContext ?
                `<button class="generate-prompt-btn" type="button" data-folder-id="${folder.id}">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12z"/>
                        <path d="M8 5h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2v14h11V7z"/>
                    </svg>
                    Generate Prompt
                </button>` : ''
            }
        `;

        return `
            <div class="folder-context" id="folder-context-${folder.id}">
                <div class="context-header">
                    <h4 class="context-title">
                        ${SECTION_ICONS.context}
                        <span>Folder Context</span>
                    </h4>
                    <div class="context-actions">
                        ${context.isGenerating ? generatingMarkup : actionsMarkup}
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
                return;
            }

            const folder = this.folderManager.findFolderById(folderId);
            if (!folder) {
                console.error(`[ContentRenderer] Folder ${folderId} not found`);
                return;
            }

            const newContextHTML = this.createContextHTML(folder);
            const parser = new DOMParser();
            const newDocument = parser.parseFromString(newContextHTML, 'text/html');
            const newElement = newDocument.body.firstChild;

            if (newElement) {
                contextElement.replaceWith(newElement);
            } else {
                console.error(`[ContentRenderer] Failed to parse new context HTML for folder ${folderId}`);
            }
        } catch (error) {
            console.error(`[ContentRenderer] Error updating context display for folder ${folderId}:`, error);
        }
    }


    async showContentInline(contentId, headerRow) {
        try {
            // First try to find the content item in the currently displayed items
            let contentItem = this.currentContentItems.find(item => item.id === contentId);

            // Fallback to local storage if not found in current items
            if (!contentItem) {
                const result = await chrome.storage.local.get('zyphContent');
                const allContent = result.zyphContent || [];
                contentItem = allContent.find(item => item.id === contentId);
            }

            if (!contentItem) {
                console.error(`Content item ${contentId} not found`);
                return;
            }

            const existingDetails = headerRow.nextElementSibling;
            if (existingDetails && existingDetails.classList.contains('content-details')) {
                existingDetails.remove();
                headerRow.classList.remove('expanded');
                this.expandedContentIds.delete(contentId);
                return;
            }

            const contentPanel = headerRow.closest('.folder-content-panel');
            contentPanel?.querySelectorAll('.content-details').forEach(el => {
                const previousRow = el.previousElementSibling;
                if (previousRow?.dataset?.contentId) {
                    this.expandedContentIds.delete(previousRow.dataset.contentId);
                    previousRow.classList.remove('expanded');
                }
                el.remove();
            });

            const detailsElement = this.createContentDetailsElement(contentItem, headerRow);
            headerRow.insertAdjacentElement('afterend', detailsElement);
            headerRow.classList.add('expanded');
            this.expandedContentIds.add(contentId);

        } catch (error) {
            console.error('Error showing content inline:', error);
            alert('Failed to load content details');
        }
    }

    createContentDetailsElement(contentItem, headerRow) {
        const detailsElement = document.createElement('div');
        detailsElement.className = 'content-details';

        const rawContent = this.getContentText(contentItem);
        const previewHtml = rawContent
            ? Zyph.Utils.escapeHtml(rawContent).replace(/\n/g, '<br>')
            : '<em>No content captured</em>';
        const fallbackNote = contentItem.metadata?.fallback
            ? '<p><strong>Note:</strong> Content saved using fallback method</p>'
            : '';

        detailsElement.innerHTML = `
            <div class="content-metadata">
                <p><strong>URL:</strong> <a href="${contentItem.url}" target="_blank">${contentItem.url}</a></p>
                <p><strong>Domain:</strong> ${contentItem.domain || ''}</p>
                <p><strong>Saved:</strong> ${new Date(contentItem.timestamp).toLocaleString()}</p>
                <p><strong>Type:</strong> ${contentItem.type === 'selection' ? 'Selected Text' : 'Full Page'}</p>
                ${fallbackNote}
            </div>
            <div class="content-text">
                <h4>Content:</h4>
                <div class="content-preview">${previewHtml}</div>
            </div>
            <div class="content-actions">
                <button class="btn secondary copy-content-btn" type="button">Copy Content</button>
                <button class="btn secondary collapse-btn" type="button">Collapse</button>
            </div>
        `;

        const copyButton = detailsElement.querySelector('.copy-content-btn');
        if (copyButton) {
            copyButton.addEventListener('click', () => {
                this.copyToClipboard(rawContent || '', 'Content copied to clipboard!');
            });
        }

        const collapseButton = detailsElement.querySelector('.collapse-btn');
        if (collapseButton) {
            collapseButton.addEventListener('click', () => {
                detailsElement.remove();
                headerRow.classList.remove('expanded');
                if (contentItem.id) {
                    this.expandedContentIds.delete(contentItem.id);
                }
            });
        }

        return detailsElement;
    }

    restoreExpandedContent(contentPanel, contentItems) {
        if (!this.expandedContentIds || this.expandedContentIds.size === 0) {
            return;
        }

        const contentMap = new Map(contentItems.map(item => [item.id, item]));

        Array.from(this.expandedContentIds).forEach(contentId => {
            const headerRow = contentPanel.querySelector(`.content-header-row[data-content-id="${contentId}"]`);
            const contentItem = contentMap.get(contentId);

            if (!headerRow || !contentItem) {
                this.expandedContentIds.delete(contentId);
                return;
            }

            const existingDetails = headerRow.nextElementSibling;
            if (!existingDetails || !existingDetails.classList.contains('content-details')) {
                const detailsElement = this.createContentDetailsElement(contentItem, headerRow);
                headerRow.insertAdjacentElement('afterend', detailsElement);
            }
            headerRow.classList.add('expanded');
        });
    }

    getContentText(contentItem) {
        const content = contentItem?.content;

        if (typeof content === 'string') {
            return content;
        }

        if (content === undefined || content === null) {
            return '';
        }

        try {
            return JSON.stringify(content, null, 2);
        } catch (error) {
            console.warn('[ContentRenderer] Failed to stringify content, using fallback string:', error);
            return String(content);
        }
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

    showNotification(message, type = 'info') {
        Zyph.Utils.showNotification(message, type);
    }

    closeFolderContent() {
        const contentPanel = document.getElementById('folder-content-panel');
        if (contentPanel) {
            contentPanel.remove();
        }
        this.expandedContentIds.clear();
        this.currentContentItems = []; // Clear stored content items
    }
};
