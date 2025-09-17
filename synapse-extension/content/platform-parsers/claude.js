class ClaudeParser {
  constructor() {
    this.selectors = {
      messageContainer: '[data-testid*="message"], .conversation-turn, .message',
      userMessage: '[data-is-streaming="false"][data-testid*="user"], .human-message',
      assistantMessage: '[data-is-streaming="false"][data-testid*="assistant"], .assistant-message',
      inputField: 'div[contenteditable="true"][data-testid*="chat-input"], .ProseMirror',
      sendButton: '[aria-label*="Send"], [data-testid*="send"], button[type="submit"]',
      conversationContainer: 'main, .conversation-container',
      newChatButton: '[href="/"], [data-testid*="new-chat"]'
    };
  }

  extractMessages() {
    try {
      const allMessages = [];

      const messageElements = document.querySelectorAll(this.selectors.messageContainer);

      messageElements.forEach((element, index) => {
        const isUser = this.isUserMessage(element);
        const isAssistant = this.isAssistantMessage(element);

        if (isUser || isAssistant) {
          const content = this.extractTextContent(element);
          if (content.trim()) {
            allMessages.push({
              role: isUser ? 'user' : 'assistant',
              content: content.trim(),
              timestamp: Date.now() - (messageElements.length - index) * 1000,
              index: index
            });
          }
        }
      });

      return allMessages;
    } catch (error) {
      console.error('Claude parser error:', error);
      return [];
    }
  }

  isUserMessage(element) {
    return element.matches(this.selectors.userMessage) ||
           element.querySelector(this.selectors.userMessage) ||
           element.getAttribute('data-testid')?.includes('user') ||
           element.classList.contains('human-message');
  }

  isAssistantMessage(element) {
    return element.matches(this.selectors.assistantMessage) ||
           element.querySelector(this.selectors.assistantMessage) ||
           element.getAttribute('data-testid')?.includes('assistant') ||
           element.classList.contains('assistant-message');
  }

  extractTextContent(element) {
    if (!element) return '';

    let text = '';

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (parent && (
            parent.style.display === 'none' ||
            parent.style.visibility === 'hidden' ||
            parent.classList.contains('sr-only') ||
            parent.classList.contains('hidden')
          )) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    let node;
    while (node = walker.nextNode()) {
      text += node.textContent;
    }

    const codeElements = element.querySelectorAll('code, pre, .code-block, .language-');
    codeElements.forEach(codeEl => {
      const codeText = codeEl.textContent;
      if (codeText && !text.includes(codeText)) {
        text += '\n\n```\n' + codeText + '\n```\n';
      }
    });

    return text.replace(/\s+/g, ' ').trim();
  }

  getInputField() {
    const selectors = [
      'div[contenteditable="true"][data-testid*="chat-input"]',
      '.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      '[data-testid="chat-input"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.contentEditable === 'true') {
        return element;
      }
    }

    return null;
  }

  getSendButton() {
    const selectors = [
      '[aria-label*="Send message"]',
      '[data-testid*="send"]',
      'button[type="submit"]',
      'button[aria-label*="send"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && !element.disabled) {
        return element;
      }
    }

    return null;
  }

  isNewConversation() {
    const url = window.location.href;
    return url === 'https://claude.ai/' ||
           url.endsWith('/chat') ||
           url.includes('/chat/new');
  }

  injectContext(contextText) {
    try {
      const inputField = this.getInputField();
      if (!inputField) {
        console.warn('Claude input field not found');
        return false;
      }

      const currentValue = this.getInputValue(inputField);
      const newValue = currentValue.trim() ? `${contextText}\n\n${currentValue}` : contextText;

      this.setInputValue(inputField, newValue);

      const notification = this.createContextNotification();
      document.body.appendChild(notification);

      return true;
    } catch (error) {
      console.error('Claude context injection error:', error);
      return false;
    }
  }

  getInputValue(inputField) {
    return inputField.textContent || inputField.innerText || '';
  }

  setInputValue(inputField, value) {
    inputField.focus();

    inputField.textContent = value;

    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(inputField);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    const inputEvent = new Event('input', { bubbles: true });
    inputField.dispatchEvent(inputEvent);

    const changeEvent = new Event('change', { bubbles: true });
    inputField.dispatchEvent(changeEvent);

    const keydownEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'End'
    });
    inputField.dispatchEvent(keydownEvent);
  }

  createContextNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(45deg, #cc785c, #e4a572);
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
          (node.querySelector('main') || node.matches('main'))
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

window.ClaudeParser = ClaudeParser;