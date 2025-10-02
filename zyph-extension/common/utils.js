(function(global) {
    'use strict';

    // Common UI icons used across the extension
    const UI_ICONS = {
        CLOSE: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
        DOWNLOAD: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
        LOADING: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="loading-spin"><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/></svg>',
        RETRY: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>',
        DELETE: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 4l-1-1h-5l-1 1H5v2h14V4h-3.5zM7 20c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H7v12zm4-9h2v7h-2v-7z"/></svg>'
    };

    // Shared utility functions used across the extension
    class ZyphUtils {
        // ID Generation
        static generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substring(2);
        }

        // HTML Escaping
        static escapeHtml(text) {
            if (typeof text !== 'string') return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // URL utilities
        static getDefaultFavicon(url) {
            try {
                const urlObj = new URL(url);
                return `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
            } catch {
                return '';
            }
        }

        static getDomainFromUrl(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname;
            } catch {
                return null;
            }
        }

        // Tab validation
        static isValidTabForContentScript(tab) {
            if (!tab || !tab.url) return false;

            const invalidProtocols = ['chrome:', 'chrome-extension:', 'moz-extension:', 'edge:', 'about:', 'data:', 'file:'];
            const invalidUrls = ['chrome.google.com/webstore'];

            const url = tab.url.toLowerCase();

            if (invalidProtocols.some(protocol => url.startsWith(protocol))) {
                return false;
            }

            if (invalidUrls.some(invalidUrl => url.includes(invalidUrl))) {
                return false;
            }

            return true;
        }

        // Page type detection
        static getPageType(url) {
            if (!url) return 'Unknown page';

            const lowerUrl = url.toLowerCase();

            if (lowerUrl.startsWith('chrome://')) {
                return 'Chrome internal page';
            } else if (lowerUrl.startsWith('chrome-extension://')) {
                return 'Browser extension page';
            } else if (lowerUrl.startsWith('moz-extension://')) {
                return 'Firefox extension page';
            } else if (lowerUrl.startsWith('edge://')) {
                return 'Edge internal page';
            } else if (lowerUrl.startsWith('about:')) {
                return 'Browser about page';
            } else if (lowerUrl.startsWith('data:')) {
                return 'Data URL page';
            } else if (lowerUrl.startsWith('file://')) {
                return 'Local file';
            } else if (lowerUrl.includes('chrome.google.com/webstore')) {
                return 'Chrome Web Store';
            } else {
                return 'Protected page';
            }
        }

        // File size formatting
        static formatBytes(bytes) {
            if (!Number.isFinite(bytes) || bytes <= 0) {
                return '0 B';
            }

            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            let value = bytes;
            let unitIndex = 0;

            while (value >= 1024 && unitIndex < units.length - 1) {
                value /= 1024;
                unitIndex += 1;
            }

            const precision = value < 10 && unitIndex > 0 ? 1 : 0;
            return `${value.toFixed(precision)} ${units[unitIndex]}`;
        }

        // Notification helper
        static showNotification(message, type = 'info', duration = 3000) {
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
            }, duration);
        }

        // Storage helpers
        static async updateContentMetadata(contentId, updater) {
            if (!contentId || typeof updater !== 'function') {
                return false;
            }

            try {
                const result = await chrome.storage.local.get('zyphContent');
                const allContent = Array.isArray(result.zyphContent) ? result.zyphContent : [];
                const index = allContent.findIndex(item => item.id === contentId);

                if (index === -1) {
                    return false;
                }

                const metadata = allContent[index].metadata && typeof allContent[index].metadata === 'object'
                    ? { ...allContent[index].metadata }
                    : {};

                const updatedMetadata = updater(metadata) || metadata;
                allContent[index].metadata = updatedMetadata;
                await chrome.storage.local.set({ zyphContent: allContent });
                return true;
            } catch (error) {
                console.error('[Utils] Failed to update content metadata:', error);
                return false;
            }
        }

        // Content type mapping
        static mapContentType(type) {
            switch (type) {
                case 'page':
                case 'dropped-file':
                    return 'document';
                case 'selection':
                case 'dropped-text':
                    return 'text';
                case 'dropped-url':
                    return 'link';
                case 'image':
                case 'video':
                case 'audio':
                    return type;
                default:
                    return 'text';
            }
        }

        static mapRemoteContentType(contentType) {
            switch (contentType) {
                case 'document':
                    return 'page';
                case 'text':
                    return 'selection';
                case 'link':
                    return 'dropped-url';
                default:
                    return 'page';
            }
        }

        // Error checking
        static isQuotaError(error) {
            if (!error) return false;
            const message = (error.message || error.toString() || '').toLowerCase();
            return message.includes('quota') || message.includes('resource::kquotabytes');
        }
    }

    // Export to global namespace
    global.Zyph = global.Zyph || {};
    global.Zyph.Utils = ZyphUtils;
    global.Zyph.UI_ICONS = UI_ICONS;

})(typeof self !== 'undefined' ? self : this);