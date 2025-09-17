class ContextInjector {
  constructor() {
    this.platform = this.detectPlatform();
    this.domain = window.location.hostname;
    this.hasInjectedContext = false;
    this.contextCheckInterval = null;

    this.init();
  }

  async init() {
    // Check if Chrome context is valid before proceeding
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.warn('Synapse: Chrome context invalid, context injector disabled');
      return;
    }

    try {
      const isEnabled = await StorageManager.isEnabled(this.domain);
      if (!isEnabled) {
        return;
      }

      console.log('Synapse: Context injector initialized for', this.platform);
      this.setupContextInjection();
    } catch (error) {
      console.warn('Synapse: Context injector initialization failed:', error.message);
    }
  }

  detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('openai.com') || hostname.includes('chatgpt.com')) return 'ChatGPT';
    if (hostname.includes('google.com')) return 'Gemini';
    if (hostname.includes('claude.ai')) return 'Claude';
    return 'Unknown';
  }

  setupContextInjection() {
    this.checkForNewConversation();

    this.contextCheckInterval = setInterval(() => {
      this.checkForNewConversation();
    }, 3000);

    const observer = new MutationObserver(() => {
      setTimeout(() => this.checkForNewConversation(), 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
  }

  async checkForNewConversation() {
    const parser = this.getPlatformParser();
    if (!parser) return;

    const isNewConversation = parser.isNewConversation();
    const hasActiveConversation = parser.isConversationActive();

    if (isNewConversation && !hasActiveConversation && !this.hasInjectedContext) {
      const inputField = parser.getInputField();
      if (inputField && this.isInputEmpty(inputField)) {
        await this.injectRelevantContext();
      }
    }

    if (hasActiveConversation && this.hasInjectedContext) {
      this.hasInjectedContext = false;
    }
  }

  isInputEmpty(inputField) {
    if (!inputField) return false;

    if (inputField.contentEditable === 'true') {
      const text = inputField.textContent || inputField.innerText || '';
      return text.trim().length === 0;
    }

    return (inputField.value || '').trim().length === 0;
  }

  async injectRelevantContext() {
    try {
      const context = await this.getRelevantContext();
      if (!context || context.length === 0) {
        console.log('Synapse: No relevant context found');
        return;
      }

      const contextText = this.formatContextForInjection(context);
      const parser = this.getPlatformParser();

      if (parser && parser.injectContext(contextText)) {
        this.hasInjectedContext = true;
        console.log('Synapse: Context injected successfully');

        // Only send message if Chrome context is valid
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          try {
            chrome.runtime.sendMessage({
              type: 'CONTEXT_INJECTED',
              platform: this.platform,
              domain: this.domain,
              contextCount: context.length
            });
          } catch (error) {
            console.warn('Synapse: Failed to send context injection notification:', error.message);
          }
        }
      }
    } catch (error) {
      console.error('Synapse: Context injection failed:', error);
    }
  }

  async getRelevantContext() {
    return new Promise((resolve) => {
      // Check if Chrome context is still valid
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        console.warn('Synapse: Chrome context invalidated, skipping context injection');
        resolve([]);
        return;
      }

      try {
        chrome.runtime.sendMessage({
          type: 'REQUEST_CONTEXT',
          domain: this.domain,
          platform: this.platform
        }, (response) => {
          // Check for Chrome runtime errors
          if (chrome.runtime.lastError) {
            console.warn('Synapse: Context request failed:', chrome.runtime.lastError.message);
            resolve([]);
            return;
          }

          if (response && response.context) {
            resolve(response.context);
          } else {
            resolve([]);
          }
        });
      } catch (error) {
        console.warn('Synapse: Failed to request context:', error.message);
        resolve([]);
      }
    });
  }

  formatContextForInjection(contextSummaries) {
    if (!contextSummaries || contextSummaries.length === 0) {
      return '';
    }

    const contextLines = contextSummaries.map((summary, index) => {
      const timeAgo = this.getTimeAgo(summary.timestamp);
      return `${index + 1}. [${summary.platform} - ${timeAgo}] ${summary.summary}`;
    });

    return `📋 **Previous Conversation Context:**

${contextLines.join('\n\n')}

---

**Current request:** `;
  }

  getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }

  getPlatformParser() {
    switch (this.platform) {
      case 'ChatGPT':
        return window.ChatGPTParser ? new window.ChatGPTParser() : null;
      case 'Gemini':
        return window.GeminiParser ? new window.GeminiParser() : null;
      case 'Claude':
        return window.ClaudeParser ? new window.ClaudeParser() : null;
      default:
        return null;
    }
  }

  destroy() {
    if (this.contextCheckInterval) {
      clearInterval(this.contextCheckInterval);
    }
  }
}

let contextInjector;

const initContextInjector = () => {
  if (contextInjector) {
    contextInjector.destroy();
  }
  contextInjector = new ContextInjector();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initContextInjector, 2000);
  });
} else {
  setTimeout(initContextInjector, 2000);
}

window.addEventListener('beforeunload', () => {
  if (contextInjector) {
    contextInjector.destroy();
  }
});