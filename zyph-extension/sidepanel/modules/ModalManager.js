window.Zyph = window.Zyph || {};

window.Zyph.ModalManager = class ModalManager {
    constructor(uiElements, folderManager) {
        this.folderManager = folderManager;

        // Folder modal elements
        this.folderModal = uiElements.folderModal;
        this.modalTitle = uiElements.modalTitle;
        this.folderNameInput = uiElements.folderNameInput;
        this.parentFolderSelect = uiElements.parentFolderSelect;
        this.remoteFolderSelect = uiElements.remoteFolderSelect;
        this.remoteFolderStatus = uiElements.remoteFolderStatus;
        this.iconSelector = uiElements.iconSelector;
        this.saveFolderBtn = uiElements.saveFolderBtn;

        // Settings modal elements
        this.settingsModal = uiElements.settingsModal;
        this.zyphApiKeyInput = uiElements.zyphApiKeyInput;
        this.zyphApiKeyGroup = uiElements.zyphApiKeyGroup;
        this.zyphUserDisplay = uiElements.zyphUserDisplay;
        this.zyphConnectionStatus = uiElements.zyphConnectionStatus;
        this.zyphConnectedSummary = uiElements.zyphConnectedSummary;
        this.zyphConnectedDetails = uiElements.zyphConnectedDetails;
        this.zyphConnectionUpdated = uiElements.zyphConnectionUpdated;
        this.testZyphConnectionBtn = uiElements.testZyphConnectionBtn;
        this.disconnectZyphBtn = uiElements.disconnectZyphBtn;
        this.currentZyphAuth = null;

        this.handleRemoteFoldersUpdated = this.onRemoteFoldersUpdated.bind(this);
        document.addEventListener('zyph:remote-folders-updated', this.handleRemoteFoldersUpdated);

        if (this.testZyphConnectionBtn) {
            this.testZyphConnectionBtn.addEventListener('click', () => this.testZyphConnection());
        }

        if (this.disconnectZyphBtn) {
            this.disconnectZyphBtn.addEventListener('click', () => this.disconnectZyph());
        }
    }

    showCreateFolderModal(parentId = null) {
        this.modalTitle.textContent = parentId ? 'Create Subfolder' : 'Create New Folder';
        this.folderNameInput.value = '';
        this.populateParentFolderSelect(parentId);
        this.selectIcon(this.iconSelector.querySelector('.icon-option[data-icon="folder"]'));
        this.saveFolderBtn.textContent = 'Create Folder';
        this.saveFolderBtn.dataset.mode = 'create';
        this.saveFolderBtn.dataset.parentId = parentId || '';
        this.prepareRemoteFolderSelect();
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
        const currentRemoteId = this.folderManager.selectedFolder.remote?.id || '';
        this.prepareRemoteFolderSelect(currentRemoteId);
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

    async prepareRemoteFolderSelect(selectedRemoteId = null) {
        if (!this.remoteFolderSelect) {
            return;
        }

        this.renderRemoteFolderOptions([], selectedRemoteId);
        this.updateRemoteStatus({ state: 'loading' }, selectedRemoteId);

        let options = this.folderManager.getRemoteFolderOptions();
        let status = this.folderManager.getRemoteStatus();

        const needsFetch = !options.length || status.state === 'idle' || status.state === 'error';

        if (needsFetch) {
            try {
                const refreshOptions = await this.folderManager.refreshRemoteFolders({
                    forceRefresh: status.state === 'error'
                });
                options = refreshOptions;
                status = this.folderManager.getRemoteStatus();
            } catch (error) {
                status = this.folderManager.getRemoteStatus();
                console.warn('[ModalManager] Remote folder refresh failed:', error);
            }
        }

        this.renderRemoteFolderOptions(options, selectedRemoteId);
        this.updateRemoteStatus(status, selectedRemoteId);
    }

    renderRemoteFolderOptions(options, selectedRemoteId = null) {
        if (!this.remoteFolderSelect) {
            return;
        }

        const rows = ['<option value="">Not linked</option>'];

        if (Array.isArray(options)) {
            options.forEach(option => {
                const value = this.escapeHtml(option.id);
                const label = this.escapeHtml(option.path || option.name || 'Unnamed Folder');
                const isSelected = selectedRemoteId && option.id === selectedRemoteId;
                rows.push(`<option value="${value}" ${isSelected ? 'selected' : ''}>${label}</option>`);
            });
        }

        this.remoteFolderSelect.innerHTML = rows.join('');
        this.remoteFolderSelect.value = selectedRemoteId || '';
    }

    updateRemoteStatus(status, selectedRemoteId = null) {
        if (!this.remoteFolderStatus) {
            return;
        }

        const element = this.remoteFolderStatus;
        element.classList.remove('status-success', 'status-error', 'status-warning');

        const linkedMeta = selectedRemoteId ? this.folderManager.getRemoteFolderMeta(selectedRemoteId) : null;
        const availableOptions = this.folderManager.getRemoteFolderOptions() || [];
        let message = 'Connect your Zyph.com account in Settings to enable syncing.';
        let disableSelect = true;

        switch (status?.state) {
            case 'loading':
                message = 'Loading Zyph.com folders...';
                disableSelect = true;
                element.classList.add('status-warning');
                break;
            case 'ready':
                disableSelect = availableOptions.length === 0;
                if (linkedMeta) {
                    message = `Linked to ${linkedMeta.path || linkedMeta.name}`;
                    element.classList.add('status-success');
                } else if (availableOptions.length) {
                    message = 'Select a Zyph.com folder to sync captured items.';
                    element.classList.add('status-warning');
                } else {
                    message = 'No Zyph.com folders found. Create one on zyph.com first.';
                    element.classList.add('status-warning');
                }
                break;
            case 'error':
                disableSelect = true;
                element.classList.add('status-error');
                if (status.code === 'NO_AUTH') {
                    message = 'Enter your Zyph.com API key in Settings to sync folders.';
                } else if (status.message) {
                    message = status.message;
                } else {
                    message = 'Unable to load Zyph.com folders. Try again later.';
                }
                break;
            case 'unavailable':
                disableSelect = true;
                element.classList.add('status-warning');
                message = status.reason || 'Remote syncing is not available.';
                break;
            default:
                disableSelect = true;
                element.classList.add('status-warning');
                break;
        }

        if (this.remoteFolderSelect) {
            if (disableSelect) {
                this.remoteFolderSelect.setAttribute('disabled', 'disabled');
            } else {
                this.remoteFolderSelect.removeAttribute('disabled');
            }
        }

        element.textContent = message;
    }

    onRemoteFoldersUpdated(event) {
        if (!this.remoteFolderSelect || !this.folderModal.classList.contains('show')) {
            return;
        }

        const detail = event?.detail || {};
        const selectedRemoteId = this.remoteFolderSelect.value || null;
        this.renderRemoteFolderOptions(detail.options || [], selectedRemoteId);
        this.updateRemoteStatus(detail.status, selectedRemoteId);
    }

    escapeHtml(value) {
        if (typeof value !== 'string') {
            return value;
        }
        return value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
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
        const remoteFolderId = this.remoteFolderSelect ? (this.remoteFolderSelect.value || null) : null;

        try {
            if (mode === 'create') {
                const parentId = this.saveFolderBtn.dataset.parentId || null;
                this.folderManager.createFolder(name, icon, parentId, remoteFolderId);
            } else if (mode === 'rename') {
                const folderId = this.saveFolderBtn.dataset.folderId;
                this.folderManager.renameFolder(folderId, name, icon);
                this.folderManager.updateFolderRemoteMapping(folderId, remoteFolderId);
            }

            this.closeModal();
            return { success: true };
        } catch (error) {
            console.error('Error saving folder:', error);
            alert('Failed to save folder');
            return { success: false, error };
        }
    }

    // Settings modal methods
    async openSettings() {
        let remoteAuth = null;

        try {
            remoteAuth = await (window?.Zyph?.Api?.getAuth?.() || Promise.resolve(null));
        } catch (error) {
            console.warn('[ModalManager] Failed to retrieve Zyph auth:', error);
            remoteAuth = null;
        }

        this.currentZyphAuth = remoteAuth;

        if (this.zyphApiKeyInput) {
            this.zyphApiKeyInput.value = '';
        }
        if (this.disconnectZyphBtn) {
            this.disconnectZyphBtn.disabled = !remoteAuth;
        }

        this.updateUserDisplay(remoteAuth);
        this.updateConnectionStatus(remoteAuth);
        this.toggleZyphConnectionView(remoteAuth);
        this.renderConnectionSummary(remoteAuth);

        this.settingsModal.classList.add('show');
        const shouldFocusInput = this.zyphApiKeyInput && !(remoteAuth && remoteAuth.apiKey);
        if (shouldFocusInput) {
            setTimeout(() => {
                this.zyphApiKeyInput?.focus();
            }, 100);
        }
    }

    closeSettings() {
        this.settingsModal.classList.remove('show');
    }

    async saveSettings() {
        const zyphResult = await this.saveZyphSettings({ notifyOnError: true });
        if (!zyphResult.success) {
            return { success: false };
        }

        this.closeSettings();
        return { success: true };
    }

    async saveZyphSettings({ notifyOnError = false, showSuccessToast = false, forceValidate = false } = {}) {
        if (!this.zyphApiKeyInput || !window?.Zyph?.Api) {
            return { success: true };
        }

        const apiKey = this.zyphApiKeyInput.value.trim();
        const hasExistingAuth = !!(this.currentZyphAuth && this.currentZyphAuth.apiKey);

        if (!apiKey) {
            if (forceValidate && !hasExistingAuth) {
                if (notifyOnError) {
                    alert('Enter your Zyph API key before validating the connection.');
                }
                return { success: false };
            }

            if (!hasExistingAuth) {
                this.updateConnectionStatus(null);
                this.updateUserDisplay(null);
                this.toggleZyphConnectionView(null);
                this.renderConnectionSummary(null);
                return { success: true };
            }

            this.updateConnectionStatus(this.currentZyphAuth);
            this.updateUserDisplay(this.currentZyphAuth);
            this.toggleZyphConnectionView(this.currentZyphAuth);
            this.renderConnectionSummary(this.currentZyphAuth);
            return { success: true, unchanged: true };
        }

        try {
            // Show loading state during validation
            if (window?.Zyph?.UIManager?.showConnectionLoadingState) {
                window.Zyph.UIManager.showConnectionLoadingState();
            }

            const auth = await window.Zyph.Api.validateApiKey(apiKey);
            this.currentZyphAuth = auth;
            if (this.disconnectZyphBtn) {
                this.disconnectZyphBtn.disabled = false;
            }
            this.zyphApiKeyInput.value = '';
            this.updateConnectionStatus(auth);
            this.updateUserDisplay(auth);
            this.toggleZyphConnectionView(auth);
            this.renderConnectionSummary(auth);

            try {
                await this.folderManager.refreshRemoteFolders({ forceRefresh: true });
            } catch (refreshError) {
                console.warn('[ModalManager] Failed to refresh remote folders after validation:', refreshError);
            }

            chrome.runtime?.sendMessage?.({ action: 'processRemoteQueue' }).catch(() => {});

            if (showSuccessToast) {
                alert('Zyph.com connection validated successfully!');
            }

            return { success: true, auth };
        } catch (error) {
            console.error('[ModalManager] Zyph validation failed:', error);
            this.updateConnectionStatus(null, { state: 'error', message: error?.message });
            this.updateUserDisplay(null);
            this.toggleZyphConnectionView(null);
            this.renderConnectionSummary(null);
            if (notifyOnError) {
                alert(`Failed to validate Zyph.com connection: ${error?.message || 'Unknown error'}`);
            }
            return { success: false, error };
        }
    }

    async testZyphConnection() {
        const result = await this.saveZyphSettings({ notifyOnError: true, showSuccessToast: true, forceValidate: true });
        return result;
    }

    async disconnectZyph() {
        if (!window?.Zyph?.Api) {
            return;
        }

        try {
            await window.Zyph.Api.clearAuth();
            this.currentZyphAuth = null;
            if (this.zyphApiKeyInput) {
                this.zyphApiKeyInput.value = '';
            }
            if (this.disconnectZyphBtn) {
                this.disconnectZyphBtn.disabled = true;
            }
            this.updateConnectionStatus(null);
            this.updateUserDisplay(null);
            this.toggleZyphConnectionView(null);
            this.renderConnectionSummary(null);
            try {
                await this.folderManager.refreshRemoteFolders({ forceRefresh: true });
            } catch (error) {
                console.warn('[ModalManager] Failed to refresh remote folders after disconnect:', error);
            }
            alert('Disconnected from Zyph.com. Local captures will remain linked but new items will not sync until you reconnect.');
        } catch (error) {
            console.error('[ModalManager] Failed to clear Zyph auth:', error);
            alert(`Failed to disconnect from Zyph.com: ${error?.message || 'Unknown error'}`);
        }
    }

    updateUserDisplay(auth) {
        if (!this.zyphUserDisplay) {
            return;
        }

        if (auth && (auth.user || auth.userId || auth.user_id)) {
            const userName = auth.user?.full_name || auth.user?.email || auth.userId || auth.user_id || 'Zyph user';
            const userId = auth.userId || auth.user_id;
            this.zyphUserDisplay.textContent = userId ? `${userName} (${userId})` : userName;
        } else {
            this.zyphUserDisplay.textContent = 'Not connected';
        }
    }

    updateConnectionStatus(auth, options = {}) {
        if (!this.zyphConnectionStatus) {
            return;
        }

        this.zyphConnectionStatus.classList.remove('connected', 'error');

        if (auth && auth.apiKey) {
            const userName = auth.user?.full_name || auth.user?.email || auth.userId || 'Zyph user';
            const keyName = auth.keyName || auth.key_name || 'API Key';
            const validatedAt = auth.validatedAt || new Date().toISOString();
            const message = `Connected as ${userName} | ${keyName} | Validated ${new Date(validatedAt).toLocaleString()}`;
            this.zyphConnectionStatus.textContent = message;
            this.zyphConnectionStatus.classList.add('connected');
        } else if (options.state === 'error') {
            this.zyphConnectionStatus.textContent = options.message || 'Failed to connect to Zyph.com.';
            this.zyphConnectionStatus.classList.add('error');
        } else {
            this.zyphConnectionStatus.textContent = 'Not connected. Enter your Zyph.com API key to enable syncing.';
        }
    }

    toggleZyphConnectionView(auth) {
        const hasAuth = !!(auth && auth.apiKey);

        if (this.zyphApiKeyGroup) {
            this.zyphApiKeyGroup.classList.toggle('is-hidden', hasAuth);
        }

        if (this.testZyphConnectionBtn) {
            this.testZyphConnectionBtn.classList.toggle('is-hidden', hasAuth);
        }
    }

    renderConnectionSummary(auth) {
        if (!this.zyphConnectedSummary || !this.zyphConnectedDetails) {
            return;
        }

        const hasAuth = !!(auth && auth.apiKey);

        if (!hasAuth) {
            this.zyphConnectedSummary.classList.add('is-hidden');
            this.zyphConnectedDetails.innerHTML = '';
            if (this.zyphConnectionUpdated) {
                this.zyphConnectionUpdated.textContent = '';
            }
            return;
        }

        const rows = [];
        const userLabel = this.buildAuthUserLabel(auth);
        if (userLabel) {
            rows.push({ label: 'User', value: userLabel });
        }

        const keyName = auth.keyName || auth.key_name || 'API key';
        const keyPreview = auth.apiKey ? `${auth.apiKey.slice(0, 4)}...${auth.apiKey.slice(-4)}` : '';
        const keyValue = keyPreview ? `${keyName} · ${keyPreview}` : keyName;
        rows.push({ label: 'Key', value: keyValue });

        const validatedAt = auth.validatedAt || auth.validated_at || null;
        if (this.zyphConnectionUpdated) {
            this.zyphConnectionUpdated.textContent = validatedAt
                ? `Validated ${this.formatDateTime(validatedAt)}`
                : 'Validated recently';
        }

        this.zyphConnectedDetails.innerHTML = rows.map(row => `
            <div class="summary-row">
                <span class="summary-label">${this.escapeHtml(row.label)}</span>
                <span class="summary-value">${this.escapeHtml(row.value)}</span>
            </div>
        `).join('');

        this.zyphConnectedSummary.classList.remove('is-hidden');
    }

    buildAuthUserLabel(auth) {
        if (!auth) {
            return null;
        }

        const name = auth.user?.full_name || auth.user?.email || auth.user?.name || auth.userId || auth.user_id || null;
        const id = auth.userId || auth.user_id || null;

        if (name && id && !name.includes(id)) {
            return `${name} (${id})`;
        }

        return name || id || null;
    }

    formatDateTime(value) {
        try {
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) {
                return 'recently';
            }
            return date.toLocaleString();
        } catch (error) {
            return 'recently';
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
                        This knowledge base provides comprehensive context about "${folderName}".
                        Anyone reading this will understand the project, person, or idea completely. Perfect for sharing with teammates,
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
};
