class GeminiParser {
  constructor() {
    this.selectors = {
      messageContainer: '.conversation-container .message, .model-response-text, .user-input',
      userMessage: '.user-input, [data-test-id="user-input"]',
      assistantMessage: '.model-response-text, [data-test-id="bot-response"]',
      inputField: 'rich-textarea[contenteditable="true"], textarea[placeholder*="Enter a prompt"], .ql-editor',
      sendButton: '[aria-label*="Send"], [data-test-id="send-button"], button[type="submit"]',
      conversationContainer: '.conversation-container, main',
      newChatButton: '[aria-label*="New chat"], [href="/app"]'
    };
  }

  extractMessages() {
    try {
      const userMessages = this.extractUserMessages();
      const assistantMessages = this.extractAssistantMessages();

      const allMessages = [...userMessages, ...assistantMessages]
        .sort((a, b) => a.timestamp - b.timestamp);

      return allMessages;
    } catch (error) {
      console.error('Gemini parser error:', error);
      return [];
    }
  }

  extractUserMessages() {
    const messages = [];
    const userElements = document.querySelectorAll(this.selectors.userMessage);

    userElements.forEach((element, index) => {
      const content = this.extractTextContent(element);
      if (content.trim()) {
        messages.push({
          role: 'user',
          content: content.trim(),
          timestamp: Date.now() - (userElements.length - index) * 2000,
          index: index * 2
        });
      }
    });

    return messages;
  }

  extractAssistantMessages() {
    const messages = [];
    const assistantElements = document.querySelectorAll(this.selectors.assistantMessage);

    assistantElements.forEach((element, index) => {
      const content = this.extractTextContent(element);
      if (content.trim()) {
        messages.push({
          role: 'assistant',
          content: content.trim(),
          timestamp: Date.now() - (assistantElements.length - index) * 2000 + 1000,
          index: index * 2 + 1
        });
      }
    });

    return messages;
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
            parent.classList.contains('sr-only')
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

    const codeElements = element.querySelectorAll('code, pre, .code-block');
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
      'rich-textarea[contenteditable="true"]',
      '.ql-editor[contenteditable="true"]',
      'textarea[placeholder*="Enter a prompt"]',
      '[data-test-id="input-field"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return null;
  }

  getSendButton() {
    const selectors = [
      '[aria-label*="Send"]',
      '[data-test-id="send-button"]',
      'button[type="submit"]',
      'button[aria-label*="submit"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && !element.disabled) return element;
    }

    return null;
  }

  isNewConversation() {
    const url = window.location.href;
    return url.includes('/app') && !url.includes('/chat/');
  }

  injectContext(contextText) {
    try {
      const inputField = this.getInputField();
      if (!inputField) {
        console.warn('Gemini input field not found');
        return false;
      }

      const currentValue = this.getInputValue(inputField);
      const newValue = currentValue.trim() ? `${contextText}\n\n${currentValue}` : contextText;

      this.setInputValue(inputField, newValue);

      const notification = this.createContextNotification();
      document.body.appendChild(notification);

      return true;
    } catch (error) {
      console.error('Gemini context injection error:', error);
      return false;
    }
  }

  getInputValue(inputField) {
    if (inputField.contentEditable === 'true') {
      return inputField.textContent || inputField.innerText || '';
    }
    return inputField.value || '';
  }

  setInputValue(inputField, value) {
    inputField.focus();

    if (inputField.contentEditable === 'true') {
      inputField.textContent = value;

      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(inputField);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      inputField.value = value;
    }

    const inputEvent = new Event('input', { bubbles: true });
    inputField.dispatchEvent(inputEvent);

    const changeEvent = new Event('change', { bubbles: true });
    inputField.dispatchEvent(changeEvent);

    if (inputField.style) {
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
      background: linear-gradient(45deg, #4285f4, #34a853);
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

window.GeminiParser = GeminiParser;