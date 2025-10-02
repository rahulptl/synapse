class ContentSaver {
    constructor(dialogManager) {
        this.dialogManager = dialogManager;
        this.MAX_LOCAL_CONTENT_LENGTH = 100000;
        this.SESSION_CONTENT_THRESHOLD = 50000;
        this.REMOTE_QUEUE_KEY = 'zyphRemoteSyncQueue';
        this.REMOTE_QUEUE_ALARM = 'zyph-remote-sync';
        this.remoteQueueProcessing = false;
        this.cachedFolders = [];
        this.MAX_DROPPED_FILE_BYTES = 5 * 1024 * 1024; // 5 MB cap for stored binaries
    }

    async saveContentToFolder(folderId, info, tab) {
        try {
            const folder = await this.getFolderById(folderId);
            if (!folder) {
                console.error(`[ContentSaver] Folder ${folderId} not found`);
                return;
            }

            const isRestrictedTab = !Zyph.Utils.isValidTabForContentScript(tab);
            let contentData;

            if (isRestrictedTab) {
                await this.dialogManager.showRestrictedPageNotification(tab, info?.selectionText ? 'selection' : 'page');
                await this.showSaveError('Protected pages cannot be saved. Try capturing content from a different site.');
                return;
            }

            // Normal content extraction
            if (info.selectionText) {
                contentData = await this.saveSelectedText(info, tab, folder);
            } else {
                contentData = await this.saveEntirePage(tab, folder);
            }

            if (contentData) {
                const saveResult = await this.saveContentItem(contentData);

                if (!saveResult.success) {
                    await this.showSaveError('Chrome storage is full. Remove older Zyph items and try again.');
                    return;
                }

                if (saveResult.quotaFallback) {
                    await this.showSaveError('Chrome storage is almost full. Zyph saved a lightweight placeholder instead of the full content. Delete older items to free up space.');
                } else {
                    this.showSaveNotification(folder.name, saveResult.item.type);
                }

                await this.handleRemoteSync(folder, saveResult.item, contentData, {
                    quotaFallback: saveResult.quotaFallback
                });

            } else {
                console.error(`[ContentSaver] No content data generated`);
            }
        } catch (error) {
            console.error('Error saving content:', error);
            await this.showSaveError('Failed to save content. Please try again.');
        }
    }

    async saveDroppedContent(folderId, items, source = 'drag-drop') {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('No items supplied for drop import');
        }

        const folder = await this.getFolderById(folderId);
        if (!folder) {
            throw new Error(`Folder ${folderId} not found`);
        }

        const savedItems = [];
        const errors = [];

        for (const item of items) {
            try {
                const payload = await this.buildDroppedContentPayload(folder, item, source);
                if (!payload) {
                    errors.push({ item, error: 'Unsupported drop item' });
                    continue;
                }

                const saveResult = await this.saveContentItem(payload);

                if (!saveResult.success) {
                    errors.push({ item, error: saveResult.error || 'Failed to persist item' });
                    continue;
                }

                savedItems.push(saveResult.item);

                let shouldShowSuccess = true;

                if (saveResult.quotaFallback) {
                    await this.showSaveError('Chrome storage is almost full. Zyph saved a lightweight placeholder instead of embedding the dropped item. Delete older items to free up space.');
                    shouldShowSuccess = false;
                }

                if (payload.type === 'dropped-file') {
                    const storedMeta = saveResult.item.metadata || {};
                    if (storedMeta.fileStored === 'too-large') {
                        const sizeLabel = Zyph.Utils.formatBytes(storedMeta.fileSize || payload.metadata?.fileSize || item.size || 0);
                        const limitLabel = Zyph.Utils.formatBytes(this.MAX_DROPPED_FILE_BYTES);
                        await this.showSaveError(`File ${payload.title} (${sizeLabel}) exceeds the ${limitLabel} attachment limit. Zyph saved metadata only.`);
                        shouldShowSuccess = false;
                    } else if (storedMeta.fileStored === 'failed') {
                        await this.showSaveError(`Zyph could not attach the full file ${payload.title}. Only a preview was saved.`);
                        shouldShowSuccess = false;
                    }
                }

                if (shouldShowSuccess) {
                    this.showSaveNotification(folder.name, payload.type);
                }

                await this.handleRemoteSync(folder, saveResult.item, payload, {
                    quotaFallback: saveResult.quotaFallback
                });
            } catch (error) {
                console.error('[ContentSaver] Failed to store dropped item:', error);
                errors.push({ item, error: error?.message || 'Unexpected error' });
            }
        }

        return { savedItems, errors };
    }

    async attachDroppedFileBinary(item, dropItem, metadata) {
        console.log('[ContentSaver] attachDroppedFileBinary called:', {
            itemId: item.id,
            dropItemExists: !!dropItem,
            dropItemBinaryExists: !!dropItem?.binary,
            dropItemBinaryType: typeof dropItem?.binary,
            binaryTooLarge: dropItem?.binaryTooLarge,
            binaryStructure: dropItem?.binary ? Object.keys(dropItem.binary) : null,
            binaryConstructor: dropItem?.binary?.constructor?.name
        });

        const buffer = this.normalizeBinaryPayload(dropItem?.binary);

        console.log('[ContentSaver] normalizeBinaryPayload result:', {
            bufferExists: !!buffer,
            bufferType: typeof buffer,
            bufferByteLength: buffer?.byteLength
        });

        if (!buffer) {
            metadata.fileStored = dropItem?.binaryTooLarge ? 'too-large' : 'none';
            console.log('[ContentSaver] No buffer, fileStored set to:', metadata.fileStored);
            return;
        }

        if (this.MAX_DROPPED_FILE_BYTES && buffer.byteLength > this.MAX_DROPPED_FILE_BYTES) {
            metadata.fileStored = 'too-large';
            return;
        }

        const sessionKey = this.buildSessionKey(item.id, 'droppedFile');
        const storeResult = await this.storeSessionPayload(sessionKey, buffer);

        if (storeResult.success) {
            metadata.fileSessionKey = sessionKey;
            metadata.fileStored = 'session';
            metadata.fileBinaryEncoding = 'arraybuffer';
            metadata.fileSize = buffer.byteLength;
        } else {
            metadata.fileStored = 'failed';
            metadata.fileStoreError = storeResult.error;
        }
    }

    normalizeBinaryPayload(binary) {
        if (!binary) {
            return null;
        }

        if (binary instanceof ArrayBuffer) {
            return binary;
        }

        if (ArrayBuffer.isView(binary)) {
            return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
        }

        if (binary?.type === 'Uint8Array' && Array.isArray(binary?.data)) {
            try {
                return Uint8Array.from(binary.data).buffer;
            } catch (error) {
                console.warn('[ContentSaver] Failed to normalize Uint8Array binary payload:', error);
            }
        }

        if (binary?.type === 'Buffer' && Array.isArray(binary?.data)) {
            return Uint8Array.from(binary.data).buffer;
        }

        if (binary?.data && Array.isArray(binary.data) && typeof binary.byteLength === 'number') {
            try {
                return Uint8Array.from(binary.data).buffer;
            } catch (error) {
                console.warn('[ContentSaver] Failed to normalize binary payload from object data:', error);
            }
        }

        if (binary?.byteLength && typeof binary.byteLength === 'number' && typeof binary === 'object') {
            try {
                const view = new Uint8Array(binary.byteLength);
                for (let i = 0; i < view.length; i += 1) {
                    view[i] = binary[i] || 0;
                }
                return view.buffer;
            } catch (error) {
                console.warn('[ContentSaver] Failed to coerce binary-like object:', error);
            }
        }

        return null;
    }

    async buildDroppedContentPayload(folder, dropItem, source) {
        if (!dropItem || !dropItem.kind) {
            return null;
        }

        const timestamp = new Date().toISOString();
        const baseMetadata = {
            dropSource: source,
            dropKind: dropItem.kind
        };

        if (dropItem.kind === 'file') {
            const name = dropItem.name || 'Dropped file';
            const metadata = {
                ...baseMetadata,
                fileName: name,
                fileType: dropItem.mimeType || null,
                fileSize: dropItem.size || 0,
                fileLastModified: dropItem.lastModified || null,
                previewEncoding: dropItem.textContent ? 'text' : (dropItem.dataUrl ? 'data-url' : 'none'),
                previewTruncated: !!dropItem.textTruncated,
                binarySource: dropItem.binary ? 'captured' : 'none',
                binaryTooLarge: !!dropItem.binaryTooLarge
            };

            if (dropItem.dataUrl) {
                metadata.dataUrlLength = dropItem.dataUrl.length;
            }

            let content;
            if (dropItem.textContent) {
                content = dropItem.textContent;
                if (dropItem.textTruncated) {
                    content += '\n\n[Preview truncated due to size limit]';
                }
            } else if (dropItem.dataUrl) {
                content = `Data URL preview for ${name}:\n${dropItem.dataUrl}`;
            } else if (dropItem.binary) {
                const sizeLabel = Zyph.Utils.formatBytes(dropItem.size);
                content = `Binary file ${name} (${sizeLabel}) saved via drag-and-drop. Download the attachment from this item in Zyph.`;
            } else {
                const sizeLabel = Zyph.Utils.formatBytes(dropItem.size);
                content = `File ${name} (${sizeLabel}) saved via drag-and-drop. The original binary content exceeds the embedded size limit.`;
            }

            const item = {
                id: Zyph.Utils.generateId(),
                type: 'dropped-file',
                folderId: folder.id,
                title: name,
                content,
                url: null,
                favicon: '',
                domain: null,
                timestamp,
                metadata
            };
            await this.attachDroppedFileBinary(item, dropItem, metadata);
            return item;
        }

        if (dropItem.kind === 'url') {
            const url = dropItem.url;
            if (!url) {
                return null;
            }

            let domain = null;
            let title = dropItem.title || '';

            try {
                const parsed = new URL(url);
                domain = parsed.hostname;
                if (!title) {
                    title = parsed.hostname;
                }
            } catch (error) {
                if (!title) {
                    title = url;
                }
            }

            const metadata = {
                ...baseMetadata,
                url,
                title: dropItem.title || null
            };

            const lines = [];
            if (dropItem.title) {
                lines.push(`Title: ${dropItem.title}`);
            }
            lines.push(`URL: ${url}`);

            return {
                id: Zyph.Utils.generateId(),
                type: 'dropped-url',
                folderId: folder.id,
                title: title || url,
                content: lines.join('\n'),
                url,
                favicon: Zyph.Utils.getDefaultFavicon(url),
                domain,
                timestamp,
                metadata
            };
        }

        if (dropItem.kind === 'text') {
            const text = typeof dropItem.text === 'string' ? dropItem.text.trim() : '';
            if (!text) {
                return null;
            }

            const metadata = {
                ...baseMetadata,
                truncated: !!dropItem.truncated,
                originalLength: dropItem.originalLength || text.length
            };

            let content = text;
            if (dropItem.truncated) {
                content += '\n\n[Original text truncated during import]';
            }

            const preview = text.length > 80 ? `${text.slice(0, 80)}...` : text;

            return {
                id: Zyph.Utils.generateId(),
                type: 'dropped-text',
                folderId: folder.id,
                title: preview || 'Dropped text',
                content,
                url: null,
                favicon: '',
                domain: null,
                timestamp,
                metadata
            };
        }

        return null;
    }

    async saveSelectedText(info, tab, folder) {
        try {
            const response = await this.sendMessageWithTimeout(tab.id, {
                action: 'getPageContent'
            });

            return {
                id: Zyph.Utils.generateId(),
                type: 'selection',
                folderId: folder.id,
                title: `Selection from ${response.title || tab.title}`,
                content: info.selectionText,
                url: tab.url,
                favicon: response.favicon || Zyph.Utils.getDefaultFavicon(tab.url),
                domain: response.domain || new URL(tab.url).hostname,
                timestamp: new Date().toISOString(),
                metadata: {
                    pageTitle: response.title || tab.title,
                    selectedText: info.selectionText,
                    ...response.metadata
                }
            };
        } catch (error) {
            console.warn(`[ContentSaver] Content script not available for selection, using fallback:`, error.message);
            await this.dialogManager.showRestrictedPageNotification(tab, 'selection');
            return this.createFallbackContent(info, tab, folder, 'selection');
        }
    }

    async saveEntirePage(tab, folder) {
        try {
            const response = await this.sendMessageWithTimeout(tab.id, {
                action: 'getPageContent'
            });

            return {
                id: Zyph.Utils.generateId(),
                type: 'page',
                folderId: folder.id,
                title: response.title || tab.title,
                content: response.content || 'Content could not be extracted',
                rawHtml: response.rawHtml,
                url: tab.url,
                favicon: response.favicon || Zyph.Utils.getDefaultFavicon(tab.url),
                domain: response.domain || new URL(tab.url).hostname,
                timestamp: new Date().toISOString(),
                metadata: response.metadata || {}
            };
        } catch (error) {
            console.warn('Content script not available, using fallback for entire page');
            await this.dialogManager.showRestrictedPageNotification(tab, 'page');
            return this.createFallbackContent(null, tab, folder, 'page');
        }
    }

    createFallbackContent(info, tab, folder, type) {
        try {
            const domain = new URL(tab.url).hostname;

            if (type === 'selection' && info?.selectionText) {
                const fallbackContent = {
                    id: Zyph.Utils.generateId(),
                    type: 'selection',
                    folderId: folder.id,
                    title: `Selection from ${tab.title}`,
                    content: info.selectionText,
                    url: tab.url,
                    favicon: Zyph.Utils.getDefaultFavicon(tab.url),
                    domain: domain,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        pageTitle: tab.title,
                        selectedText: info.selectionText,
                        fallback: true
                    }
                };
                return fallbackContent;
            } else {
                const pageType = this.dialogManager.getPageType(tab.url);
                let instructions;

                if (pageType === 'Chrome internal page') {
                    instructions = 'This is a protected content page. To save content from this page:\n1) Select the text you want to save\n2) Right-click on the selection\n3) Choose "Save to Zyph" from the context menu';
                } else {
                    instructions = 'This page type doesn\'t allow automatic content extraction. To save content:\n1) Select the text you want to save\n2) Right-click on the selection\n3) Choose "Save to Zyph" from the context menu';
                }

                const fallbackPageContent = {
                    id: Zyph.Utils.generateId(),
                    type: 'page',
                    folderId: folder.id,
                    title: tab.title || 'Untitled Page',
                    content: `Page URL: ${tab.url}\nPage Title: ${tab.title}\nPage Type: ${pageType}\n\nNote: ${instructions}`,
                    url: tab.url,
                    favicon: Zyph.Utils.getDefaultFavicon(tab.url),
                    domain: domain,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        pageTitle: tab.title,
                        pageType: pageType,
                        fallback: true,
                        reason: 'Content script not allowed on this page type'
                    }
                };
                return fallbackPageContent;
            }
        } catch (error) {
            console.error(`[ContentSaver] Error creating fallback content:`, error);
            return null;
        }
    }

    async saveContentItem(contentData) {
        const { itemForLocal, sessionKeys } = await this.prepareItemForStorage(contentData);
        const result = await chrome.storage.local.get('zyphContent');
        const existingContent = result.zyphContent || [];
        const fullContentList = [...existingContent, itemForLocal];

        try {
            await chrome.storage.local.set({ zyphContent: fullContentList });
            this.scheduleContextRegeneration(itemForLocal.folderId);
            return { success: true, quotaFallback: false, item: itemForLocal };
        } catch (error) {
            if (!Zyph.Utils.isQuotaError(error)) {
                await this.removeSessionPayloads(sessionKeys);
                throw error;
            }

            console.warn('[ContentSaver] Storage quota exceeded while saving content, attempting placeholder save');
            await this.removeSessionPayloads(sessionKeys);

            const placeholderItem = this.createQuotaPlaceholder(itemForLocal);
            const placeholderList = [...existingContent, placeholderItem];

            try {
                await chrome.storage.local.set({ zyphContent: placeholderList });
                this.scheduleContextRegeneration(placeholderItem.folderId);
                return { success: true, quotaFallback: true, item: placeholderItem };
            } catch (innerError) {
                if (Zyph.Utils.isQuotaError(innerError)) {
                    console.error('[ContentSaver] Storage quota exceeded even after placeholder attempt');
                    return { success: false, quotaFallback: false, error: innerError };
                }
                throw innerError;
            }
        }
    }

    async prepareItemForStorage(contentData) {
        const optimized = { ...contentData };
        const metadata = optimized.metadata ? { ...optimized.metadata } : {};
        const sessionKeys = [];

        if (metadata.fileSessionKey) {
            sessionKeys.push(metadata.fileSessionKey);
        }

        // Offload raw HTML to session storage when available
        if (optimized.rawHtml) {
            const rawHtmlSize = optimized.rawHtml.size
                || optimized.rawHtml.fullSource?.length
                || optimized.rawHtml.bodyOnly?.length
                || 0;

            const rawHtmlKey = this.buildSessionKey(optimized.id, 'rawHtml');
            const rawHtmlStoreResult = await this.storeSessionPayload(rawHtmlKey, optimized.rawHtml);

            if (rawHtmlStoreResult.success) {
                metadata.rawHtmlStored = 'session';
                metadata.rawHtmlOriginalSize = rawHtmlSize;
                metadata.rawHtmlSessionKey = rawHtmlKey;
                sessionKeys.push(rawHtmlKey);
            } else {
                metadata.rawHtmlStored = false;
                metadata.rawHtmlStoreError = rawHtmlStoreResult.error;
                console.warn('[ContentSaver] Failed to store raw HTML in session storage:', rawHtmlStoreResult.error);
            }

            delete optimized.rawHtml;
        }

        if (typeof optimized.content === 'string') {
            const encoder = new TextEncoder();
            const originalContent = optimized.content;
            const contentBytes = encoder.encode(originalContent).length;

            metadata.originalContentBytes = contentBytes;

            if (contentBytes > this.SESSION_CONTENT_THRESHOLD) {
                const contentKey = this.buildSessionKey(optimized.id, 'content');
                const sessionStoreResult = await this.storeSessionPayload(contentKey, originalContent);

                if (sessionStoreResult.success) {
                    metadata.sessionContentStored = true;
                    metadata.sessionContentKey = contentKey;
                    metadata.sessionContentBytes = contentBytes;
                    sessionKeys.push(contentKey);
                } else {
                    metadata.sessionContentStored = false;
                    metadata.sessionContentError = sessionStoreResult.error;
                    console.warn('[ContentSaver] Failed to store full content in session storage:', sessionStoreResult.error);
                }
            }

            if (originalContent.length > this.MAX_LOCAL_CONTENT_LENGTH) {
                const truncatedContent = originalContent.slice(0, this.MAX_LOCAL_CONTENT_LENGTH);
                optimized.content = `${truncatedContent}\n\n[Content truncated to reduce storage size]`;
                metadata.truncatedForStorage = true;
                metadata.truncatedContentLength = this.MAX_LOCAL_CONTENT_LENGTH;
            }
        }

        if (sessionKeys.length > 0) {
            const combined = new Set([...(metadata.sessionPayloadKeys || []), ...sessionKeys]);
            metadata.sessionPayloadKeys = Array.from(combined);
        } else if (metadata.sessionPayloadKeys) {
            delete metadata.sessionPayloadKeys;
        }

        optimized.metadata = metadata;

        return { itemForLocal: optimized, sessionKeys };
    }

    buildSessionKey(itemId, payloadType) {
        return `zyph:${itemId}:${payloadType}`;
    }

    async storeSessionPayload(key, payload) {
        if (!chrome.storage?.session?.set) {
            return { success: false, error: 'Session storage API unavailable' };
        }
        try {
            await chrome.storage.session.set({ [key]: payload });
            return { success: true };
        } catch (error) {
            return { success: false, error: error?.message || 'Failed to store payload in session storage' };
        }
    }

    async getSessionPayload(key) {
        if (!key || !chrome.storage?.session?.get) {
            return null;
        }
        try {
            const result = await chrome.storage.session.get(key);
            return result ? result[key] ?? null : null;
        } catch (error) {
            console.warn('[ContentSaver] Failed to read session payload:', error?.message || error);
            return null;
        }
    }

    arrayBufferToBase64(buffer) {
        if (!(buffer instanceof ArrayBuffer)) {
            return null;
        }
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    }

    async removeSessionPayloads(keys) {
        if (!keys || keys.length === 0) {
            return;
        }

        try {
            if (!chrome.storage?.session?.remove) {
                return;
            }
            await chrome.storage.session.remove(keys);
        } catch (error) {
            console.warn('[ContentSaver] Failed to remove session payloads:', error?.message || error);
        }
    }

    createQuotaPlaceholder(originalItem) {
        const placeholderMessage = 'Chrome storage is full, so Zyph saved this lightweight placeholder instead of the captured content. Delete older items in the side panel and try again.';
        const placeholderContent = `Page URL: ${originalItem.url}\n\n${placeholderMessage}`;
        const originalSize = this.estimateItemSize(originalItem);
        const truncatedTitle = originalItem.title && originalItem.title.length > 80
            ? `${originalItem.title.slice(0, 77)}...`
            : originalItem.title;

        const metadata = originalItem.metadata ? { ...originalItem.metadata } : {};
        delete metadata.sessionContentKey;
        delete metadata.sessionContentBytes;
        delete metadata.sessionContentStored;
        delete metadata.sessionPayloadKeys;
        delete metadata.sessionContentError;
        delete metadata.rawHtmlSessionKey;
        delete metadata.rawHtmlStored;
        delete metadata.rawHtmlStoreError;
        metadata.quotaFallback = true;
        metadata.quotaOriginalItemId = originalItem.id;
        metadata.quotaOriginalSize = originalSize;
        metadata.quotaRecordedAt = new Date().toISOString();

        return {
            ...originalItem,
            id: this.generateId(),
            title: truncatedTitle ? `[Storage limited] ${truncatedTitle}` : '[Storage limited] Untitled',
            content: placeholderContent,
            metadata,
            timestamp: new Date().toISOString()
        };
    }

    estimateItemSize(item) {
        try {
            const json = JSON.stringify(item);
            return new TextEncoder().encode(json).length;
        } catch (error) {
            console.warn('[ContentSaver] Failed to estimate item size:', error);
            return 0;
        }
    }


    scheduleContextRegeneration(folderId) {
        console.log(`[ContentSaver] Scheduling context regeneration for folder ${folderId}`);

        chrome.runtime.sendMessage({
            action: 'regenerateContext',
            folderId: folderId
        }).then((response) => {
            if (response) {
                console.log(`[ContentSaver] Context regeneration response:`, response);
            } else {
                console.log(`[ContentSaver] Context regeneration message sent (no response expected)`);
            }
        }).catch((error) => {
            console.log(`[ContentSaver] Could not send context regeneration message:`, error.message);
        });
    }

    async handleRemoteSync(folder, savedItem, originalContent, options = {}) {
        try {
            if (!folder?.remote?.id) {
                console.log('[ContentSaver] Folder not linked to Zyph.com - skipping remote sync');
                return;
            }

            const metadata = savedItem.metadata || {};
            const isDroppedFile = savedItem.type === 'dropped-file';
            const canUploadFile = isDroppedFile
                && metadata.fileSessionKey
                && metadata.fileStored === 'session'
                && typeof metadata.fileSessionKey === 'string'
                && self?.Zyph?.Api?.uploadFile;

            console.log('[ContentSaver] File upload check:', {
                hasRemoteId: !!folder?.remote?.id,
                isDroppedFile: isDroppedFile,
                hasSessionKey: !!metadata.fileSessionKey,
                fileStored: metadata.fileStored,
                hasUploadApi: !!self?.Zyph?.Api?.uploadFile,
                canUploadFile: canUploadFile,
                savedItemType: savedItem.type
            });

            if (canUploadFile) {
                const uploadTask = {
                    taskId: Zyph.Utils.generateId(),
                    taskType: 'file-upload',
                    localContentId: savedItem.id,
                    remoteFolderId: folder.remote.id,
                    folderName: folder.remote.name || null,
                    folderPath: folder.remote.path || null,
                    fileSessionKey: metadata.fileSessionKey,
                    fileName: metadata.fileName || savedItem.title || 'Uploaded file',
                    fileType: metadata.fileType || 'application/octet-stream',
                    fileSize: metadata.fileSize || null,
                    title: savedItem.title || metadata.fileName || 'Uploaded file',
                    description: (savedItem.content && typeof savedItem.content === 'string')
                        ? savedItem.content.slice(0, 2000)
                        : '',
                    attempts: 0,
                    createdAt: new Date().toISOString(),
                    nextAttemptAt: Date.now()
                };

                await this.markRemoteStatus(savedItem.id, {
                    state: 'pending',
                    folderId: folder.remote.id,
                    folderName: folder.remote.name || null,
                    folderPath: folder.remote.path || null,
                    uploadType: 'file',
                    lastAttemptAt: null,
                    attempts: 0,
                    quotaFallback: !!options.quotaFallback
                });

                await this.enqueueRemoteTask(uploadTask);
                await this.processRemoteQueue();
                return;
            }

            const payload = await this.buildRemotePayload(folder, originalContent, savedItem, options);
            if (!payload) {
                console.warn('[ContentSaver] Remote payload could not be built, skipping sync');
                return;
            }

            const task = {
                taskId: Zyph.Utils.generateId(),
                taskType: 'ingest',
                localContentId: savedItem.id,
                remoteFolderId: folder.remote.id,
                folderName: folder.remote.name || null,
                folderPath: folder.remote.path || null,
                payload,
                attempts: 0,
                createdAt: new Date().toISOString(),
                nextAttemptAt: Date.now()
            };

            await this.markRemoteStatus(savedItem.id, {
                state: 'pending',
                folderId: folder.remote.id,
                folderName: folder.remote.name || null,
                folderPath: folder.remote.path || null,
                lastAttemptAt: null,
                attempts: 0,
                quotaFallback: !!options.quotaFallback
            });

            await this.enqueueRemoteTask(task);
            await this.processRemoteQueue();
        } catch (error) {
            console.error('[ContentSaver] Failed to enqueue remote sync task:', error);
        }
    }

    async buildRemotePayload(folder, originalContent, savedItem, options = {}) {
        if (!originalContent || !folder?.remote?.id) {
            return null;
        }

        const baseMetadata = (originalContent.metadata && typeof originalContent.metadata === 'object')
            ? { ...originalContent.metadata }
            : {};

        const metadata = {
            ...baseMetadata,
            local_content_id: savedItem.id,
            saved_at: savedItem.timestamp,
            local_type: originalContent.type,
            folder_name: folder.name,
            folder_path: folder.remote?.path || null,
            folder_remote_id: folder.remote?.id,
            synced_from: 'zyph-extension',
            quota_fallback: !!options.quotaFallback
        };

        if (baseMetadata.fileSessionKey) {
            const binaryPayload = await this.getSessionPayload(baseMetadata.fileSessionKey);
            if (binaryPayload instanceof ArrayBuffer) {
                const base64 = this.arrayBufferToBase64(binaryPayload);
                if (base64) {
                    metadata.dropped_file_payload = {
                        encoding: 'base64',
                        name: baseMetadata.fileName || originalContent.title || savedItem.title || 'Dropped file',
                        size: baseMetadata.fileSize || binaryPayload.byteLength || null,
                        mime_type: baseMetadata.fileType || null,
                        base64
                    };
                }
            } else if (baseMetadata.fileStored === 'session') {
                metadata.dropped_file_payload = {
                    encoding: 'missing',
                    reason: 'session-unavailable'
                };
            }
        }

        const content = typeof originalContent.content === 'string'
            ? originalContent.content
            : (typeof savedItem.content === 'string' ? savedItem.content : null);

        if (!content) {
            console.warn('[ContentSaver] No textual content available for remote sync');
            return null;
        }

        return {
            title: originalContent.title || savedItem.title || 'Untitled capture',
            content,
            folder_id: folder.remote.id,
            content_type: this.mapContentType(originalContent.type),
            source_url: originalContent.url || savedItem.url || null,
            metadata
        };
    }

    mapContentType(type) {
        return Zyph.Utils.mapContentType(type);
    }

    async enqueueRemoteTask(task) {
        const queue = await this.loadRemoteQueue();
        queue.push(task);
        queue.sort((a, b) => (a.nextAttemptAt || 0) - (b.nextAttemptAt || 0));
        await this.saveRemoteQueue(queue);
    }

    async loadRemoteQueue() {
        try {
            const result = await chrome.storage.local.get(this.REMOTE_QUEUE_KEY);
            const queue = Array.isArray(result[this.REMOTE_QUEUE_KEY]) ? result[this.REMOTE_QUEUE_KEY] : [];
            queue.sort((a, b) => (a.nextAttemptAt || 0) - (b.nextAttemptAt || 0));
            return queue;
        } catch (error) {
            console.warn('[ContentSaver] Failed to load remote sync queue:', error);
            return [];
        }
    }

    async saveRemoteQueue(queue) {
        try {
            await chrome.storage.local.set({ [this.REMOTE_QUEUE_KEY]: queue });
            await this.scheduleRemoteQueue(queue);
        } catch (error) {
            console.error('[ContentSaver] Failed to persist remote sync queue:', error);
        }
    }

    async scheduleRemoteQueue(queue) {
        if (!chrome?.alarms) {
            return;
        }

        if (!Array.isArray(queue) || queue.length === 0) {
            await chrome.alarms.clear(this.REMOTE_QUEUE_ALARM);
            return;
        }

        const nextTask = queue[0];
        const when = nextTask.nextAttemptAt && nextTask.nextAttemptAt > Date.now()
            ? nextTask.nextAttemptAt
            : Date.now() + 1000;

        chrome.alarms.create(this.REMOTE_QUEUE_ALARM, { when });
    }

    async processRemoteQueue() {
        if (this.remoteQueueProcessing) {
            return;
        }

        if (!self?.Zyph?.Api) {
            console.warn('[ContentSaver] Zyph API module unavailable, cannot process remote queue');
            return;
        }

        this.remoteQueueProcessing = true;

        try {
            let queue = await this.loadRemoteQueue();

            while (queue.length > 0) {
                queue.sort((a, b) => (a.nextAttemptAt || 0) - (b.nextAttemptAt || 0));
                const task = queue[0];
                const now = Date.now();

                if (task.nextAttemptAt && task.nextAttemptAt > now) {
                    break;
                }

                const taskType = task.taskType || 'ingest';

                if (taskType === 'file-upload') {
                    const result = await this.processFileUploadQueueTask(task);
                    if (result.success) {
                        queue.shift();
                        await this.removeSessionPayloads([task.fileSessionKey]);

                        await this.updateContentMetadata(task.localContentId, (metadata) => {
                            const updated = { ...metadata };
                            if (Array.isArray(updated.sessionPayloadKeys)) {
                                updated.sessionPayloadKeys = updated.sessionPayloadKeys.filter(key => key !== task.fileSessionKey);
                                if (updated.sessionPayloadKeys.length === 0) {
                                    delete updated.sessionPayloadKeys;
                                }
                            }
                            if (updated.fileSessionKey === task.fileSessionKey) {
                                delete updated.fileSessionKey;
                            }
                            updated.fileStored = 'uploaded';
                            updated.fileUploadedAt = new Date().toISOString();
                            return updated;
                        });

                        await this.markRemoteStatus(task.localContentId, {
                            state: 'synced',
                            folderId: task.remoteFolderId,
                            folderName: task.folderName || null,
                            folderPath: task.folderPath || null,
                            remoteContentId: result.response?.content?.id || null,
                            fileUrl: result.response?.content?.file_url || null,
                            filePath: result.response?.content?.file_path || null,
                            uploadType: 'file',
                            syncedAt: new Date().toISOString(),
                            attempts: (task.attempts || 0) + 1,
                            lastAttemptAt: new Date().toISOString()
                        });

                        await this.saveRemoteQueue(queue);
                        continue;
                    }

                    const retryable = result.retryable;
                    const attempts = (task.attempts || 0) + 1;
                    const message = result.error?.message || 'Failed to upload file to Zyph.com';
                    const code = result.error?.code || null;

                    await this.markRemoteStatus(task.localContentId, {
                        state: retryable ? 'pending' : 'error',
                        folderId: task.remoteFolderId,
                        folderName: task.folderName || null,
                        folderPath: task.folderPath || null,
                        uploadType: 'file',
                        errorMessage: message,
                        errorCode: code,
                        lastAttemptAt: new Date().toISOString(),
                        attempts
                    });

                    if (!retryable) {
                        await this.removeSessionPayloads([task.fileSessionKey]);
                        queue.shift();
                        await this.saveRemoteQueue(queue);
                        continue;
                    }

                    task.attempts = attempts;
                    task.lastError = {
                        message,
                        code,
                        at: new Date().toISOString()
                    };
                    task.nextAttemptAt = Date.now() + this.getBackoffDelay(task.attempts);
                    queue[0] = task;
                    await this.saveRemoteQueue(queue);
                    break;
                }

                try {
                    const response = await self.Zyph.Api.ingestContent(task.payload);
                    queue.shift();

                    await this.markRemoteStatus(task.localContentId, {
                        state: 'synced',
                        folderId: task.remoteFolderId,
                        folderName: task.folderName || task.payload.metadata?.folder_name || null,
                        folderPath: task.folderPath || task.payload.metadata?.folder_path || null,
                        remoteContentId: response?.content_id || response?.id || null,
                        syncedAt: new Date().toISOString(),
                        attempts: (task.attempts || 0) + 1,
                        lastAttemptAt: new Date().toISOString()
                    });

                    // Notify the side panel to refresh and show the newly synced item
                    this.notifyContentSynced(task.remoteFolderId, task.localContentId);

                    await this.saveRemoteQueue(queue);
                } catch (error) {
                    const retryable = this.isRetryableRemoteError(error);
                    const attempts = (task.attempts || 0) + 1;
                    const message = error?.message || 'Failed to sync with Zyph.com';
                    const code = error?.code || null;

                    await this.markRemoteStatus(task.localContentId, {
                        state: retryable ? 'pending' : 'error',
                        folderId: task.remoteFolderId,
                        folderName: task.folderName || task.payload.metadata?.folder_name || null,
                        folderPath: task.folderPath || task.payload.metadata?.folder_path || null,
                        errorMessage: message,
                        errorCode: code,
                        lastAttemptAt: new Date().toISOString(),
                        attempts
                    });

                    if (!retryable) {
                        queue.shift();
                        await this.saveRemoteQueue(queue);
                        continue;
                    }

                    task.attempts = attempts;
                    task.lastError = {
                        message,
                        code,
                        at: new Date().toISOString()
                    };
                    task.nextAttemptAt = Date.now() + this.getBackoffDelay(task.attempts);
                    queue[0] = task;
                    await this.saveRemoteQueue(queue);
                    break;
                }
            }
        } catch (error) {
            console.error('[ContentSaver] Failed to process remote sync queue:', error);
        } finally {
            this.remoteQueueProcessing = false;
        }
    }

    async processFileUploadQueueTask(task) {
        try {
            if (!task.fileSessionKey) {
                const error = new Error('Missing session key for file upload');
                error.code = 'MISSING_SESSION_KEY';
                return { success: false, retryable: false, error };
            }

            const binary = await this.getSessionPayload(task.fileSessionKey);
            if (!(binary instanceof ArrayBuffer)) {
                const error = new Error('File data unavailable for upload');
                error.code = 'MISSING_FILE_DATA';
                return { success: false, retryable: false, error };
            }

            const blob = new Blob([binary], { type: task.fileType || 'application/octet-stream' });
            const uploadResponse = await self.Zyph.Api.uploadFile({
                file: blob,
                fileName: task.fileName || 'upload.bin',
                folderId: task.remoteFolderId,
                title: task.title || task.fileName || 'Uploaded file',
                description: task.description || ''
            });

            if (uploadResponse && uploadResponse.success === false) {
                const error = new Error(uploadResponse.message || 'File upload failed');
                error.code = uploadResponse.code || 'UPLOAD_FAILED';
                return { success: false, retryable: false, error };
            }

            return { success: true, response: uploadResponse };
        } catch (error) {
            const retryable = this.isRetryableRemoteError(error);
            return { success: false, retryable, error };
        }
    }

    getBackoffDelay(attempt) {
        const base = Math.min(60, Math.pow(2, attempt)) * 1000; // cap exponential growth
        const jitter = Math.floor(Math.random() * 1000);
        return base + jitter;
    }

    isRetryableRemoteError(error) {
        const code = error?.code;
        if (!code) {
            return true;
        }
        if (code === 'BAD_PAYLOAD') {
            return false;
        }
        if (code === 'AUTH_REJECTED' || code === 'UNAUTHORIZED' || code === 'INVALID_KEY') {
            return false;
        }
        if (code === 'UPLOAD_FAILED' || code === 'MISSING_FILE_DATA' || code === 'MISSING_SESSION_KEY') {
            return false;
        }
        return true;
    }

    async markRemoteStatus(contentId, status) {
        await this.updateContentMetadata(contentId, (metadata) => {
            const existing = metadata.remoteSync || {};
            const updated = {
                ...existing,
                ...status,
                updatedAt: new Date().toISOString()
            };
            return {
                ...metadata,
                remoteSync: updated
            };
        });
    }

    async updateContentMetadata(contentId, updater) {
        if (!contentId || typeof updater !== 'function') {
            return false;
        }

        try {
            const result = await chrome.storage.local.get('zyphContent');
            const allContent = Array.isArray(result.zyphContent) ? result.zyphContent : [];
            const index = allContent.findIndex(item => item.id === contentId);

            if (index === -1) {
                console.warn(`[ContentSaver] Content item ${contentId} not found for metadata update`);
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
            console.error('[ContentSaver] Failed to update content metadata:', error);
            return false;
        }
    }

    showSaveNotification(folderName, type) {
        chrome.action.setBadgeText({ text: 'OK' });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

        console.log(`[ContentSaver] ${type} saved to "${folderName}"`);

        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
        }, 2000);
    }

    async showSaveError(message) {
        console.error('Save error:', message);
        chrome.action.setBadgeText({ text: 'ERR' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff9800' });

        try {
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: this.dialogManager.getNotificationIconUrl(),
                title: 'Zyph Save Error',
                message: message,
                priority: 2
            });
        } catch (error) {
            console.error('[ContentSaver] Failed to show save error notification:', error);
        }

        setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
        }, 3000);
    }


    async sendMessageWithTimeout(tabId, message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Content script communication timeout'));
            }, timeout);

            chrome.tabs.sendMessage(tabId, message, (response) => {
                clearTimeout(timeoutId);

                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    async getFolders({ forceRefresh = false } = {}) {
        if (self?.Zyph?.Api) {
            try {
                const remoteFolders = await self.Zyph.Api.fetchFolders({ forceRefresh });
                this.cachedFolders = this.flattenRemoteFolders(remoteFolders);
                return this.cachedFolders;
            } catch (error) {
                console.warn('[ContentSaver] Failed to fetch folders from Zyph.com:', error);
            }
        }

        if (!forceRefresh && this.cachedFolders.length > 0) {
            return this.cachedFolders;
        }

        try {
            const cached = await chrome.storage.local.get('zyphRemoteFolders');
            const flat = cached?.zyphRemoteFolders?.flat;
            if (Array.isArray(flat)) {
                this.cachedFolders = flat.map(folder => ({
                    id: folder.id,
                    name: folder.name,
                    parentId: folder.parentId || null,
                    remote: {
                        id: folder.id,
                        name: folder.name,
                        path: folder.path,
                        description: folder.description || null
                    }
                }));
                return this.cachedFolders;
            }
        } catch (error) {
            console.warn('[ContentSaver] Failed to read cached remote folders:', error);
        }

        return [];
    }

    async getFolderById(folderId) {
        const folders = await this.getFolders();
        return folders.find(f => f.id === folderId);
    }

    flattenRemoteFolders(nodes, parentId = null, parentPath = '') {
        if (!Array.isArray(nodes)) {
            return [];
        }

        const list = [];
        nodes.forEach(node => {
            const path = node.path || (parentPath ? `${parentPath}/${node.name}` : node.name);
            const folder = {
                id: node.id,
                name: node.name,
                parentId,
                remote: {
                    id: node.id,
                    name: node.name,
                    path,
                    description: node.description || null
                }
            };

            list.push(folder);

            if (Array.isArray(node.children) && node.children.length > 0) {
                list.push(...this.flattenRemoteFolders(node.children, node.id, path));
            }
        });

        return list;
    }


    notifyContentSynced(folderId, contentId) {
        // Send message to side panel to refresh content after sync
        try {
            chrome.runtime.sendMessage({
                action: 'contentSynced',
                folderId: folderId,
                contentId: contentId
            }).then((response) => {
                console.log(`[ContentSaver] Content sync notification sent for ${contentId}`);
            }).catch((error) => {
                console.log(`[ContentSaver] Could not send content sync notification:`, error.message);
            });
        } catch (error) {
            console.log(`[ContentSaver] Failed to send content sync notification:`, error.message);
        }
    }
}
