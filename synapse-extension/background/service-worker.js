class SynapseBackground {
  constructor() {
    console.log('🟢 Synapse: Background service worker starting...');
    this.init();
  }

  init() {
    console.log('🟢 Synapse: Setting up background script...');
    this.setupMessageListeners();
    this.setupStorageDefaults();
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });
  }

  async setupStorageDefaults() {
    try {
      const existing = await chrome.storage.local.get(['enabledDomains', 'conversations', 'summaries']);

      if (!existing.enabledDomains) {
        await chrome.storage.local.set({
          enabledDomains: {
            'chatgpt.com': true,
            'gemini.google.com': true,
            'claude.ai': true
          }
        });
      }

      if (!existing.conversations) {
        await chrome.storage.local.set({ conversations: {} });
      }

      if (!existing.summaries) {
        await chrome.storage.local.set({ summaries: {} });
      }
    } catch (error) {
      console.error('Failed to setup storage defaults:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.type) {
        case 'CONVERSATION_STARTED':
          await this.handleConversationStarted(message, sender);
          break;

        case 'CONVERSATION_UPDATED':
          await this.handleConversationUpdated(message, sender);
          break;

        case 'CONVERSATION_ENDED':
          await this.handleConversationEnded(message, sender);
          break;

        case 'REQUEST_CONTEXT':
          const context = await this.getRelevantContext(message.domain);
          sendResponse({ context });
          break;

        case 'DOMAIN_SETTING_CHANGED':
          console.log(`Domain ${message.domain} ${message.enabled ? 'enabled' : 'disabled'}`);
          break;

        case 'DATA_CLEARED':
          console.log('All data cleared');
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    }
  }

  async handleConversationStarted(message, sender) {
    const conversationId = message.conversationId;
    const conversations = await this.getConversations();

    // Check if this conversation already exists
    if (conversations[conversationId]) {
      console.log('🔄 Background: Resuming existing conversation:', conversationId);
      return; // Don't create a new one, just resume
    }

    const conversation = {
      id: conversationId,
      platform: message.platform,
      domain: message.domain,
      startTime: Date.now(),
      messages: [],
      status: 'active'
    };

    conversations[conversationId] = conversation;
    await chrome.storage.local.set({ conversations });

    console.log('🟢 Background: New conversation started:', conversationId);
  }

  async handleConversationUpdated(message) {
    console.log('🟢 Background: Conversation updated:', message.conversationId, 'Messages:', message.messages?.length || 0);

    const conversations = await this.getConversations();
    let conversation = conversations[message.conversationId];

    if (!conversation) {
      console.log('🟢 Background: Creating conversation from update');

      // Create conversation if it doesn't exist
      conversation = {
        id: message.conversationId,
        platform: message.platform || 'ChatGPT',
        domain: message.domain || 'chatgpt.com',
        startTime: Date.now(),
        messages: [],
        status: 'active'
      };
      conversations[message.conversationId] = conversation;
    }

    // Handle different types of updates
    if (message.contentUpdate) {
      console.log('🟢 Background: Updating message content (streaming response)');
      conversation.messages = message.messages; // Full replace for content updates
    } else if (message.incremental && message.newMessages && message.newMessages.length > 0) {
      console.log('🟢 Background: Appending', message.newMessages.length, 'new messages');

      // Ensure we're truly appending only NEW messages
      const existingMessageCount = conversation.messages.length;
      const newMessagesToAdd = message.newMessages.filter((newMsg, index) => {
        const globalIndex = existingMessageCount + index;
        return globalIndex >= existingMessageCount;
      });

      conversation.messages = [...(conversation.messages || []), ...newMessagesToAdd];
    } else {
      // Full update - but preserve existing messages if this is a partial load
      if (conversation.messages.length > 0 && message.messages.length >= conversation.messages.length) {
        console.log('🟢 Background: Full update with', message.messages.length, 'messages');
        conversation.messages = message.messages;
      } else if (conversation.messages.length === 0) {
        console.log('🟢 Background: Initial message load');
        conversation.messages = message.messages;
      }
    }

    conversation.lastUpdate = Date.now();
    await chrome.storage.local.set({ conversations });
    console.log('🟢 Background: Messages saved to storage, total:', conversation.messages.length);
  }

  async handleConversationEnded(message) {
    const conversations = await this.getConversations();
    const conversation = conversations[message.conversationId];

    if (conversation) {
      conversation.endTime = Date.now();
      conversation.status = 'completed';
      await chrome.storage.local.set({ conversations });

      this.processSummary(conversation);
    }
  }

  async processSummary(conversation) {
    try {
      if (conversation.messages.length === 0) {
        return;
      }

      const summary = await this.generateSummary(conversation);

      const summaries = await this.getSummaries();
      summaries[conversation.id] = {
        id: conversation.id,
        conversationId: conversation.id,
        platform: conversation.platform,
        domain: conversation.domain,
        summary: summary,
        timestamp: Date.now(),
        messageCount: conversation.messages.length
      };

      await chrome.storage.local.set({ summaries });
      console.log('Summary generated for conversation:', conversation.id);
    } catch (error) {
      console.error('Failed to generate summary:', error);
    }
  }

  async generateSummary(conversation) {
    const messages = conversation.messages;
    const conversationText = messages.map(msg =>
      `${msg.role}: ${msg.content}`
    ).join('\n\n');

    const prompt = `Please summarize this conversation between a user and an AI assistant. Focus on:
1. Main topics discussed
2. Key problems solved or questions answered
3. Important code snippets or technical details
4. Action items or next steps
5. Useful context for future conversations

Conversation:
${conversationText}

Summary:`;

    return this.callSummarizationAPI(prompt);
  }

  async callSummarizationAPI(prompt) {
    try {
      const apiKey = await this.getOpenAIApiKey();
      if (!apiKey) {
        return this.generateLocalSummary(prompt);
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 300,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('API summarization failed:', error);
      return this.generateLocalSummary(prompt);
    }
  }

  generateLocalSummary(prompt) {
    const conversationMatch = prompt.match(/Conversation:\n([\s\S]*)\n\nSummary:/);
    if (!conversationMatch) return 'Unable to generate summary';

    const conversation = conversationMatch[1];
    const lines = conversation.split('\n').filter(line => line.trim());

    const userMessages = lines.filter(line => line.startsWith('user:')).length;
    const assistantMessages = lines.filter(line => line.startsWith('assistant:')).length;

    const topics = this.extractTopics(conversation);

    return `Conversation with ${userMessages} user messages and ${assistantMessages} assistant responses. Main topics: ${topics.join(', ')}.`;
  }

  extractTopics(conversation) {
    const commonTopics = [
      'coding', 'programming', 'debugging', 'javascript', 'python', 'react', 'api',
      'database', 'frontend', 'backend', 'web development', 'mobile', 'testing'
    ];

    const foundTopics = commonTopics.filter(topic =>
      conversation.toLowerCase().includes(topic)
    );

    return foundTopics.length > 0 ? foundTopics.slice(0, 3) : ['general discussion'];
  }

  async getRelevantContext(domain) {
    try {
      const summaries = await this.getSummaries();
      const relevantSummaries = Object.values(summaries)
        .filter(summary => summary.domain === domain)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 3);

      return relevantSummaries.map(summary => ({
        platform: summary.platform,
        summary: summary.summary,
        timestamp: summary.timestamp
      }));
    } catch (error) {
      console.error('Failed to get relevant context:', error);
      return [];
    }
  }

  async getConversations() {
    const data = await chrome.storage.local.get(['conversations']);
    return data.conversations || {};
  }

  async getSummaries() {
    const data = await chrome.storage.local.get(['summaries']);
    return data.summaries || {};
  }

  async getOpenAIApiKey() {
    const data = await chrome.storage.local.get(['openaiApiKey']);
    return data.openaiApiKey || null;
  }

  generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  getPlatformFromUrl(url) {
    const hostname = new URL(url).hostname;
    if (hostname.includes('openai.com') || hostname.includes('chatgpt.com')) return 'ChatGPT';
    if (hostname.includes('google.com')) return 'Gemini';
    if (hostname.includes('claude.ai')) return 'Claude';
    return 'Unknown';
  }
}

new SynapseBackground();