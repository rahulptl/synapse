class DialogManager {
    constructor() {
        this.restrictedNotificationShown = new Set();
    }

    async showProtectedContentDialog(tab, pageType, message) {
        try {
            // Check if user has disabled the dialog
            const result = await chrome.storage.local.get('zyph-dont-show-protected-dialog');
            if (result['zyph-dont-show-protected-dialog']) {
                console.log('[DialogManager] Protected content dialog disabled by user preference');
                return;
            }

            // Encode parameters for the dialog URL
            const params = new URLSearchParams({
                title: tab.title || 'Protected Page',
                url: tab.url,
                type: pageType,
                message: message
            });

            // Create the dialog URL
            const dialogUrl = chrome.runtime.getURL(`dialog/protected-content-info.html?${params.toString()}`);

            // Get current window to calculate centered position
            const currentWindow = await chrome.windows.getCurrent();
            const dialogWidth = 500;
            const dialogHeight = 650;

            // Calculate centered position relative to current window
            const left = Math.round(currentWindow.left + (currentWindow.width - dialogWidth) / 2);
            const top = Math.round(currentWindow.top + (currentWindow.height - dialogHeight) / 2);

            // Create a new window for the dialog (centered)
            const dialogWindow = await chrome.windows.create({
                left: left,
                top: top,
                url: dialogUrl,
                type: 'popup',
                width: dialogWidth,
                height: dialogHeight,
                focused: true
            });

            console.log('[DialogManager] Protected content dialog opened:', dialogWindow.id);

            // Store dialog window ID for cleanup
            await chrome.storage.local.set({
                'zyph-dialog-window-id': dialogWindow.id
            });

        } catch (error) {
            console.error('[DialogManager] Failed to show protected content dialog:', error);

            // Fallback: Show enhanced browser notification
            try {
                await chrome.notifications.create(`zyph-fallback-${Date.now()}`, {
                    type: 'basic',
                    iconUrl: this.getNotificationIconUrl(),
                    title: 'Protected Content - Use Right-Click to Save',
                    message: `${message}\n\nTo save content: Select text -> Right-click -> Choose "Save to Zyph"`,
                    requireInteraction: true,
                    priority: 2
                });
            } catch (notificationError) {
                console.error('[DialogManager] Fallback notification also failed:', notificationError);
            }
        }
    }

    async showProtectedPageBadge(pageType) {
        try {
            chrome.action.setBadgeText({ text: 'LOCK' });
            chrome.action.setBadgeBackgroundColor({ color: '#FF6B35' });
            chrome.action.setTitle({ title: `Protected Content Detected\n\nZyph cannot read ${pageType} automatically.\nClick to learn how to save content using right-click.` });

            console.log('[DialogManager] Protected page badge notification set');

            // Clear badge after 10 seconds
            setTimeout(() => {
                chrome.action.setBadgeText({ text: '' });
                chrome.action.setTitle({ title: 'Open Zyph Folder Manager' });
            }, 10000);
        } catch (error) {
            console.error('[DialogManager] Failed to show badge notification:', error);
        }
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

            let message = 'This is a protected page that Zyph cannot read automatically.';
            let instructions = 'To save content: Select the text you want, then right-click and choose "Save to Zyph".';

            if (pageType === 'Chrome internal page' && contentType === 'page') {
                message = 'This is a protected content page (Chrome internal page).';
                instructions = 'To save content: 1) Select the text you want to save, 2) Right-click on the selection, 3) Choose "Save to Zyph" from the context menu.';
            } else if (pageType === 'Chrome internal page' && contentType === 'selection') {
                message = 'This is a protected content page (Chrome internal page).';
                instructions = 'You can save selected text by right-clicking and choosing "Save to Zyph".';
            } else if (contentType === 'page') {
                instructions = 'To save content: 1) Select the text you want to save, 2) Right-click on the selection, 3) Choose "Save to Zyph" from the context menu.';
            } else if (contentType === 'selection') {
                instructions = 'You can save selected text by right-clicking and choosing "Save to Zyph".';
            }

            const notificationOptions = {
                type: 'basic',
                iconUrl: this.getNotificationIconUrl(),
                title: 'Protected Content - Use Right-Click to Save',
                message: `${message}\n\nTo save content: Select text -> Right-click -> Choose "Save to Zyph"`,
                requireInteraction: true,
                priority: 2,
                buttons: [
                    { title: 'Got it!' },
                    { title: 'Open Extension' }
                ]
            };

            if (domain) {
                notificationOptions.contextMessage = domain;
            }

            let notificationId;
            try {
                notificationId = await chrome.notifications.create(`zyph-protected-${Date.now()}`, notificationOptions);
                console.log('[DialogManager] Enhanced browser notification created:', notificationId);
            } catch (notificationError) {
                console.error('[DialogManager] Failed to show restricted page notification:', notificationError);
            }

            // Try to show an in-page warning popup when content scripts are allowed
            if (tab.id !== undefined) {
                let headline = 'Protected Content - Use Right-Click to Save';
                if (pageType === 'Chrome internal page') {
                    headline = 'Protected Content - Use Right-Click to Save';
                }

                const overlayPayload = {
                    headline,
                    message,
                    instructions,
                    url: tab.url,
                    domain,
                    contentType
                };

                // Try content script first, with fallback if it fails
                chrome.tabs.sendMessage(tab.id, {
                    action: 'showRestrictedWarning',
                    payload: overlayPayload
                }).then(() => {
                    console.log('[DialogManager] In-page warning shown successfully');
                }).catch(async (error) => {
                    console.warn('[DialogManager] Content script unavailable, showing dialog:', error?.message || error);

                    // Show the dedicated info dialog
                    await this.showProtectedContentDialog(tab, pageType, message);

                    // Also show badge notification
                    await this.showProtectedPageBadge(pageType);
                });
            }
        } catch (error) {
            console.error('[DialogManager] Failed to show restricted page notification:', error);
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

    getNotificationIconUrl() {
        try {
            return chrome.runtime.getURL('icons/icon48.png');
        } catch (error) {
            console.warn('[DialogManager] Failed to resolve notification icon URL, falling back to relative path:', error);
            return 'icons/icon48.png';
        }
    }

    async closeProtectedDialog() {
        try {
            const result = await chrome.storage.local.get('zyph-dialog-window-id');
            const windowId = result['zyph-dialog-window-id'];

            if (windowId) {
                await chrome.windows.remove(windowId);
                await chrome.storage.local.remove('zyph-dialog-window-id');
                console.log('[DialogManager] Protected content dialog closed:', windowId);
            }

            return { success: true };
        } catch (error) {
            console.error('[DialogManager] Failed to close protected dialog:', error);
            return { success: false, error: error.message };
        }
    }

    async handleNotificationButtonClick(notificationId, buttonIndex) {
        console.log('[DialogManager] Notification button clicked:', notificationId, buttonIndex);

        if (notificationId.startsWith('zyph-protected-')) {
            if (buttonIndex === 0) {
                // "Got it!" button - just clear the notification
                chrome.notifications.clear(notificationId);
            } else if (buttonIndex === 1) {
                // "Open Extension" button - open side panel
                try {
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tabs[0]) {
                        await chrome.sidePanel.open({ windowId: tabs[0].windowId });
                    }
                    chrome.notifications.clear(notificationId);
                } catch (error) {
                    console.error('[DialogManager] Failed to open side panel from notification:', error);
                }
            }
        }
    }

    async handleNotificationClick(notificationId) {
        console.log('[DialogManager] Notification clicked:', notificationId);

        if (notificationId.startsWith('zyph-protected-')) {
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]) {
                    await chrome.sidePanel.open({ windowId: tabs[0].windowId });
                }
                chrome.notifications.clear(notificationId);
            } catch (error) {
                console.error('[DialogManager] Failed to open side panel from notification click:', error);
            }
        }
    }
}
