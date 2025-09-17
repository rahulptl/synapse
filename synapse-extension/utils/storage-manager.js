console.log('🔵 Synapse: StorageManager script loaded');

class StorageManager {
  static async get(keys) {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        console.warn('Chrome storage API not available');
        return {};
      }
      return await chrome.storage.local.get(keys);
    } catch (error) {
      console.error('Storage get error:', error);
      return {};
    }
  }

  static async set(data) {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        console.warn('Chrome storage API not available');
        return false;
      }
      await chrome.storage.local.set(data);
      return true;
    } catch (error) {
      console.error('Storage set error:', error);
      return false;
    }
  }

  static async remove(keys) {
    try {
      await chrome.storage.local.remove(keys);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  }

  static async clear() {
    try {
      await chrome.storage.local.clear();
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  }

  static async isEnabled(domain) {
    const data = await this.get(['enabledDomains']);
    const enabledDomains = data.enabledDomains || {};
    return enabledDomains[domain] !== false;
  }

  static async getConversation(conversationId) {
    const data = await this.get(['conversations']);
    const conversations = data.conversations || {};
    return conversations[conversationId] || null;
  }

  static async saveConversation(conversation) {
    const data = await this.get(['conversations']);
    const conversations = data.conversations || {};
    conversations[conversation.id] = conversation;
    return await this.set({ conversations });
  }

  static async getSummaries(domain = null) {
    const data = await this.get(['summaries']);
    const summaries = data.summaries || {};

    if (!domain) {
      return Object.values(summaries);
    }

    return Object.values(summaries).filter(summary => summary.domain === domain);
  }

  // Folder management methods
  static async getFolders() {
    const data = await this.get(['folders']);
    return data.folders || {};
  }

  static async saveFolder(folderId, folderData) {
    const data = await this.get(['folders']);
    const folders = data.folders || {};
    folders[folderId] = {
      ...folderData,
      updatedAt: Date.now()
    };
    return await this.set({ folders });
  }

  static async deleteFolder(folderId) {
    const data = await this.get(['folders', 'conversations']);
    const folders = data.folders || {};
    const conversations = data.conversations || {};

    // Remove folder
    delete folders[folderId];

    // Update conversations that were in this folder
    Object.values(conversations).forEach(conversation => {
      if (conversation.folderId === folderId) {
        delete conversation.folderId; // Remove folder assignment
      }
    });

    return await this.set({ folders, conversations });
  }

  static async getConversationsByFolder(folderId = null) {
    const data = await this.get(['conversations']);
    const conversations = data.conversations || {};

    if (folderId === null) {
      // Return conversations without folder assignment
      return Object.values(conversations).filter(conv => !conv.folderId);
    }

    return Object.values(conversations).filter(conv => conv.folderId === folderId);
  }

  static async getDefaultFolder(domain) {
    const data = await this.get(['defaultFolders']);
    const defaultFolders = data.defaultFolders || {};
    return defaultFolders[domain] || null;
  }

  static async setDefaultFolder(domain, folderId) {
    const data = await this.get(['defaultFolders']);
    const defaultFolders = data.defaultFolders || {};
    defaultFolders[domain] = folderId;
    return await this.set({ defaultFolders });
  }
}

if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}