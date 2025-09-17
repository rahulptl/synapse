class ConversationDetector {
  constructor() {
    this.currentConversationId = null;
    this.isActive = false;
    this.messages = [];
    this.platform = this.detectPlatform();
    this.domain = window.location.hostname;
    this.lastMessageCount = 0;
    this.observer = null;

    this.init();
  }

  async init() {
    console.log('🔵 Synapse: ConversationDetector.init() called');
    console.log('🔵 Synapse: Platform detected:', this.platform);
    console.log('🔵 Synapse: Domain:', this.domain);

    // Check if Chrome APIs are available
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.warn('⚠️ Synapse: Chrome APIs not available, extension may not be properly loaded');
      return;
    }

    const isEnabled = await StorageManager.isEnabled(this.domain);
    console.log('🔵 Synapse: Domain enabled check result:', isEnabled);

    if (!isEnabled) {
      console.log('❌ Synapse: Domain not enabled for monitoring');
      return;
    }

    console.log('✅ Synapse: Initializing conversation detector for', this.platform);

    // Check if this is an existing conversation
    const potentialConversationId = this.generateConversationId();
    const existingConversation = await this.getExistingConversation(potentialConversationId);

    if (existingConversation) {
      console.log('🔄 Synapse: Resuming existing conversation:', potentialConversationId);
      this.currentConversationId = potentialConversationId;
      this.isActive = true;
      this.messages = existingConversation.messages || [];
      this.lastMessageCount = this.messages.length;
    }

    this.setupConversationMonitoring();

    // Add global data viewer function
    window.viewSynapseData = async () => {
      try {
        const data = await StorageManager.get(['conversations', 'summaries']);
        console.log('📊 Synapse Data:', data);
        console.log('📝 Conversations:', data.conversations || {});
        console.log('📋 Summaries:', data.summaries || {});
        return data;
      } catch (error) {
        console.error('Error viewing Synapse data:', error);
      }
    };
  }

  async getExistingConversation(conversationId) {
    try {
      const data = await StorageManager.get(['conversations']);
      const conversations = data.conversations || {};
      return conversations[conversationId] || null;
    } catch (error) {
      console.error('Error checking existing conversation:', error);
      return null;
    }
  }

  detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('openai.com') || hostname.includes('chatgpt.com')) return 'ChatGPT';
    if (hostname.includes('google.com')) return 'Gemini';
    if (hostname.includes('claude.ai')) return 'Claude';
    return 'Unknown';
  }

  setupConversationMonitoring() {
    this.observer = new MutationObserver((mutations) => {
      this.handleDOMChanges(mutations);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-scroll-anchor'] // ChatGPT updates this during typing
    });

    this.startMessageDetection();
    this.setupRealTimeCapture();
  }

  setupRealTimeCapture() {
    // More frequent checks during active periods
    let lastActivity = Date.now();
    let fastInterval = null;

    const checkForActivity = () => {
      const now = Date.now();
      if (now - lastActivity < 10000) { // 10 seconds after last activity
        // Fast polling when there's recent activity
        if (!fastInterval) {
          fastInterval = setInterval(() => {
            this.detectMessages();
          }, 500); // Check every 500ms during active periods
        }
      } else {
        // Slow down when inactive
        if (fastInterval) {
          clearInterval(fastInterval);
          fastInterval = null;
        }
      }
    };

    // Monitor for typing indicators and new content
    this.typingObserver = new MutationObserver((mutations) => {
      const hasTypingActivity = mutations.some(mutation => {
        return Array.from(mutation.addedNodes).some(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Look for streaming content or typing indicators
            return node.textContent ||
                   node.querySelector?.('[data-message-author-role="assistant"]') ||
                   node.matches?.('[data-scroll-anchor="true"]');
          }
          return false;
        });
      });

      if (hasTypingActivity) {
        lastActivity = Date.now();
        this.detectMessages(); // Immediate check when typing detected
      }
    });

    this.typingObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Check activity level every 2 seconds
    setInterval(checkForActivity, 2000);
  }

  handleDOMChanges(mutations) {
    const hasNewContent = mutations.some(mutation =>
      mutation.addedNodes.length > 0 &&
      Array.from(mutation.addedNodes).some(node =>
        node.nodeType === Node.ELEMENT_NODE &&
        this.isMessageContainer(node)
      )
    );

    if (hasNewContent) {
      setTimeout(() => this.detectMessages(), 100);
    }
  }

  isMessageContainer(element) {
    if (!element.tagName) return false;

    const commonMessageSelectors = [
      '[data-message-author-role]',
      '[data-testid*="message"]',
      '.message',
      '.conversation-turn',
      '.model-response',
      '.user-message'
    ];

    return commonMessageSelectors.some(selector => {
      try {
        return element.matches(selector) || element.querySelector(selector);
      } catch (e) {
        return false;
      }
    });
  }

  startMessageDetection() {
    setInterval(() => {
      this.detectMessages();
    }, 2000);

    this.detectMessages();
  }

  detectMessages() {
    const parser = this.getPlatformParser();
    if (!parser) {
      console.warn('Synapse: No parser available for', this.platform);
      return;
    }

    const messages = parser.extractMessages();
    if (!messages || messages.length === 0) {
      return;
    }

    // Check if messages have actually changed (not just count)
    const hasChanged = this.hasMessagesChanged(messages);

    if (hasChanged) {
      console.log('🔍 Synapse: Messages changed, count:', messages.length);
      this.lastMessageCount = messages.length;

      if (!this.isActive && messages.length > 0) {
        this.startConversation();
      }

      if (this.isActive) {
        this.updateConversation(messages);
      }
    }
  }

  hasMessagesChanged(newMessages) {
    // Always check for new messages
    if (newMessages.length !== this.lastMessageCount) {
      return true;
    }

    // Check if any existing message content has changed (streaming responses)
    if (this.messages.length > 0 && newMessages.length > 0) {
      const minLength = Math.min(this.messages.length, newMessages.length);

      for (let i = 0; i < minLength; i++) {
        const oldMsg = this.messages[i];
        const newMsg = newMessages[i];

        if (oldMsg && newMsg && oldMsg.content !== newMsg.content) {
          console.log('🔄 Synapse: Message content updated at index', i);
          return true;
        }
      }
    }

    return false;
  }

  getNewMessages(currentMessages) {
    // If no existing messages, all are new
    if (this.messages.length === 0) {
      return currentMessages;
    }

    // Return only messages that weren't in the previous state
    return currentMessages.slice(this.messages.length);
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

  startConversation() {
    this.currentConversationId = this.generateConversationId();
    this.isActive = true;

    chrome.runtime.sendMessage({
      type: 'CONVERSATION_STARTED',
      conversationId: this.currentConversationId,
      platform: this.platform,
      domain: this.domain
    });

    console.log('Synapse: Conversation started', this.currentConversationId);

    this.setupPageUnloadHandler();
  }

  updateConversation(messages) {
    const newMessages = this.getNewMessages(messages);
    const hasContentUpdates = this.hasContentUpdates(messages);
    const isIncremental = newMessages.length < messages.length && !hasContentUpdates;

    this.messages = messages;

    chrome.runtime.sendMessage({
      type: 'CONVERSATION_UPDATED',
      conversationId: this.currentConversationId,
      platform: this.platform,
      domain: this.domain,
      messages: messages,
      incremental: isIncremental,
      newMessages: newMessages,
      contentUpdate: hasContentUpdates
    });

    if (isIncremental && newMessages.length > 0) {
      console.log('📝 Synapse: Added', newMessages.length, 'new messages to conversation');
    } else if (hasContentUpdates) {
      console.log('🔄 Synapse: Updated message content');
    }
  }

  hasContentUpdates(newMessages) {
    if (this.messages.length === 0 || newMessages.length === 0) {
      return false;
    }

    const minLength = Math.min(this.messages.length, newMessages.length);
    for (let i = 0; i < minLength; i++) {
      if (this.messages[i].content !== newMessages[i].content) {
        return true;
      }
    }
    return false;
  }

  endConversation() {
    if (!this.isActive) return;

    this.isActive = false;

    chrome.runtime.sendMessage({
      type: 'CONVERSATION_ENDED',
      conversationId: this.currentConversationId,
      messages: this.messages
    });

    console.log('Synapse: Conversation ended', this.currentConversationId);

    this.currentConversationId = null;
    this.messages = [];
    this.lastMessageCount = 0;
  }

  setupPageUnloadHandler() {
    const handleUnload = () => {
      this.endConversation();
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    setTimeout(() => {
      const urlObserver = new MutationObserver(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== this.currentUrl) {
          this.currentUrl = currentUrl;
          this.endConversation();
        }
      });

      urlObserver.observe(document.body, { childList: true, subtree: true });
      this.currentUrl = window.location.href;
    }, 1000);
  }

  generateConversationId() {
    // For ChatGPT, extract conversation ID from URL
    if (this.platform === 'ChatGPT') {
      const urlMatch = window.location.pathname.match(/\/c\/([a-f0-9-]+)/);
      if (urlMatch) {
        return `chatgpt_${urlMatch[1]}`;
      }
    }

    // Fallback for other platforms or new conversations
    return `conv_${this.platform.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.typingObserver) {
      this.typingObserver.disconnect();
    }
    this.endConversation();
  }
}

let conversationDetector;

console.log('🔵 Synapse: Content script loaded on', window.location.hostname);

if (document.readyState === 'loading') {
  console.log('🔵 Synapse: Document still loading, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('🔵 Synapse: DOMContentLoaded fired, initializing detector...');
    setTimeout(() => {
      conversationDetector = new ConversationDetector();
    }, 1000);
  });
} else {
  console.log('🔵 Synapse: Document ready, initializing detector...');
  setTimeout(() => {
    conversationDetector = new ConversationDetector();
  }, 1000);
}

window.addEventListener('beforeunload', () => {
  if (conversationDetector) {
    conversationDetector.destroy();
  }
});