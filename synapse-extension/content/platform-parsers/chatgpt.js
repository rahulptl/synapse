console.log('🔵 Synapse: ChatGPTParser script loaded');

class ChatGPTParser {
  constructor() {
    this.selectors = {
      messageContainer: '[data-message-author-role]',
      userMessage: '[data-message-author-role="user"]',
      assistantMessage: '[data-message-author-role="assistant"]',
      messageContent: '.whitespace-pre-wrap',
      userMessageBubble: '.user-message-bubble-color',
      assistantMarkdown: '.markdown.prose',
      inputField: '#prompt-textarea, [contenteditable="true"][data-testid*="chat-input"]',
      sendButton: '[data-testid="send-button"], [aria-label*="Send"]',
      conversationContainer: 'main',
      conversationTurn: '[data-testid^="conversation-turn"]',
      newChatButton: '[href="/"]'
    };
  }

  extractMessages() {
    try {
      const messages = [];

      // Try new structure first (conversation turns)
      const conversationTurns = document.querySelectorAll(this.selectors.conversationTurn);

      if (conversationTurns.length > 0) {
        conversationTurns.forEach((turn, index) => {
          const messageElement = turn.querySelector(this.selectors.messageContainer);

          if (messageElement) {
            const role = messageElement.getAttribute('data-message-author-role');

            let content = '';
            if (role === 'user') {
              // Try multiple selectors for user content
              const userSelectors = [
                this.selectors.userMessageBubble + ' ' + this.selectors.messageContent,
                this.selectors.messageContent,
                '.whitespace-pre-wrap',
                'div[data-message-author-role="user"] .whitespace-pre-wrap',
                'div[data-message-author-role="user"] p'
              ];

              for (const selector of userSelectors) {
                const element = turn.querySelector(selector);
                if (element) {
                  content = this.extractTextContent(element);
                  break;
                }
              }
            } else if (role === 'assistant') {
              // Try multiple selectors for assistant content
              const assistantSelectors = [
                this.selectors.assistantMarkdown,
                '.markdown.prose',
                '.markdown',
                '.prose',
                'div[data-message-author-role="assistant"] .whitespace-pre-wrap',
                'div[data-message-author-role="assistant"] .markdown',
                'div[data-message-author-role="assistant"] p'
              ];

              for (const selector of assistantSelectors) {
                const element = turn.querySelector(selector);
                if (element) {
                  content = this.extractTextContent(element);
                  break;
                }
              }
            }

            if (content.trim()) {
              messages.push({
                role: role,
                content: content.trim(),
                timestamp: Date.now() - (conversationTurns.length - index) * 1000,
                index: index
              });
            }
          }
        });
      } else {
        // Fallback to old structure
        const messageElements = document.querySelectorAll(this.selectors.messageContainer);

        messageElements.forEach((element, index) => {
          const role = element.getAttribute('data-message-author-role');
          const contentElement = element.querySelector(this.selectors.messageContent);

          if (contentElement && role) {
            const content = this.extractTextContent(contentElement);
            if (content.trim()) {
              messages.push({
                role: role,
                content: content.trim(),
                timestamp: Date.now() - (messageElements.length - index) * 1000,
                index: index
              });
            }
          }
        });
      }

      return messages;
    } catch (error) {
      console.error('ChatGPT parser error:', error);
      return [];
    }
  }

  extractTextContent(element) {
    let text = '';

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      text += node.textContent;
    }

    const codeBlocks = element.querySelectorAll('pre code, .code-block');
    codeBlocks.forEach(block => {
      const codeText = block.textContent;
      if (codeText && !text.includes(codeText)) {
        text += '\n\n```\n' + codeText + '\n```\n';
      }
    });

    return text;
  }

  getInputField() {
    // Try multiple possible input field selectors
    const selectors = [
      '#prompt-textarea',
      '[contenteditable="true"][data-testid*="chat-input"]',
      '[contenteditable="true"][role="textbox"]',
      'textarea[data-id="root"]',
      '.ProseMirror[contenteditable="true"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    return null;
  }

  getSendButton() {
    return document.querySelector(this.selectors.sendButton);
  }

  isNewConversation() {
    const url = window.location.href;
    return url === 'https://chatgpt.com/' ||
           url === 'https://chat.openai.com/' ||
           url.endsWith('/chat') ||
           url.includes('chatgpt.com') && !url.includes('/c/');
  }

  injectContext(contextText) {
    try {
      const inputField = this.getInputField();
      if (!inputField) {
        console.warn('ChatGPT input field not found');
        return false;
      }

      const currentValue = inputField.value || '';
      const newValue = currentValue.trim() ? `${contextText}\n\n${currentValue}` : contextText;

      this.setInputValue(inputField, newValue);

      const notification = this.createContextNotification();
      document.body.appendChild(notification);

      return true;
    } catch (error) {
      console.error('ChatGPT context injection error:', error);
      return false;
    }
  }

  setInputValue(inputField, value) {
    inputField.focus();

    if (inputField.contentEditable === 'true') {
      // Handle contenteditable input
      inputField.textContent = value;

      // Set cursor to end
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(inputField);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // Handle textarea input
      inputField.value = value;
    }

    // Trigger events
    const inputEvent = new Event('input', { bubbles: true });
    inputField.dispatchEvent(inputEvent);

    const changeEvent = new Event('change', { bubbles: true });
    inputField.dispatchEvent(changeEvent);

    // Handle auto-resize for textarea
    if (inputField.style && inputField.tagName === 'TEXTAREA') {
      inputField.style.height = 'auto';
      inputField.style.height = `${inputField.scrollHeight}px`;
    }
  }

  createContextNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(45deg, #667eea, #764ba2);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center;">
        <div style="width: 6px; height: 6px; background: white; border-radius: 50%; margin-right: 8px;"></div>
        Synapse: Context injected
      </div>
    `;

    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 100);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 3000);

    return notification;
  }

  waitForInput() {
    return new Promise((resolve) => {
      const checkInput = () => {
        const inputField = this.getInputField();
        if (inputField) {
          resolve(inputField);
        } else {
          setTimeout(checkInput, 500);
        }
      };
      checkInput();
    });
  }

  isConversationActive() {
    const messages = this.extractMessages();
    return messages.length > 0;
  }

  detectConversationEnd() {
    const observer = new MutationObserver((mutations) => {
      const isNavigating = mutations.some(mutation =>
        Array.from(mutation.addedNodes).some(node =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.querySelector('[role="main"]') || node.matches('[role="main"]'))
        )
      );

      if (isNavigating || this.isNewConversation()) {
        observer.disconnect();
        return true;
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }
}

console.log('🔵 Synapse: Making ChatGPTParser globally available');
window.ChatGPTParser = ChatGPTParser;