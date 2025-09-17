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
}

if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}