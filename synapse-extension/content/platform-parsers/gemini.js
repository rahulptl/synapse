class GeminiParser {
  constructor() {
    this.selectors = {
      messageContainer: '.conversation-container, user-query, model-response',
      userMessage: 'user-query .query-text, user-query-content .query-text',
      assistantMessage: 'model-response response-container, model-response .response-container',
      inputField: 'rich-textarea[contenteditable="true"], textarea[placeholder*="Enter a prompt"], .ql-editor, .input-area textarea',
      sendButton: '[aria-label*="Send"], [data-test-id="send-button"], button[type="submit"]',
      conversationContainer: '.conversation-container, .chat-history, main',
      newChatButton: '[aria-label*="New chat"], [href="/app"]'
    };
  }

  extractMessages() {
    try {
      console.log('🔵 Synapse Gemini: Extracting messages...');
      const userMessages = this.extractUserMessages();
      const assistantMessages = this.extractAssistantMessages();

      const allMessages = [...userMessages, ...assistantMessages]
        .sort((a, b) => a.timestamp - b.timestamp);

      console.log(`🔵 Synapse Gemini: Found ${userMessages.length} user messages, ${assistantMessages.length} assistant messages`);
      if (allMessages.length > 0) {
        console.log('🔵 Synapse Gemini: Latest message:', allMessages[allMessages.length - 1]);
      }

      return allMessages;
    } catch (error) {
      console.error('🔴 Synapse Gemini parser error:', error);
      return [];
    }
  }

  extractUserMessages() {
    const messages = [];
    
    // Try multiple selectors to find user messages
    let userElements = document.querySelectorAll('user-query');
    console.log(`🔵 Synapse Gemini: Found ${userElements.length} user-query elements`);
    
    if (userElements.length === 0) {
      // Fallback to other possible selectors
      userElements = document.querySelectorAll('[data-test-id*="user"], .user-input, .user-message');
      console.log(`🔵 Synapse Gemini: Fallback found ${userElements.length} user elements`);
    }

    userElements.forEach((element, index) => {
      console.log(`🔵 Synapse Gemini: Processing user element ${index}:`, element.tagName, element.className);
      
      // Try multiple selectors for the text content
      const textSelectors = [
        '.query-text-line',
        '.query-text', 
        'p.query-text-line',
        '.user-query-bubble-with-background',
        '.horizontal-container .query-text',
        'div[role="heading"]'
      ];
      
      let queryTextElement = null;
      let content = '';
      
      for (const selector of textSelectors) {
        queryTextElement = element.querySelector(selector);
        if (queryTextElement) {
          content = this.extractTextContent(queryTextElement);
          console.log(`🔵 Synapse Gemini: Found text with selector "${selector}": "${content.slice(0, 50)}..."`);
          if (content.trim()) {
            break;
          }
        }
      }
      
      // If no specific text container, try extracting from entire element
      if (!content.trim()) {
        content = this.extractTextContent(element);
        console.log(`🔵 Synapse Gemini: Extracted from whole element: "${content.slice(0, 50)}..."`);
      }

      if (content.trim()) {
        messages.push({
          role: 'user',
          content: content.trim(),
          timestamp: Date.now() - (userElements.length - index) * 2000,
          index: index * 2
        });
      } else {
        console.log(`🔵 Synapse Gemini: No text content found in user element ${index}`);
      }
    });

    return messages;
  }

  extractAssistantMessages() {
    const messages = [];
    let assistantElements = document.querySelectorAll('model-response');
    console.log(`🔵 Synapse Gemini: Found ${assistantElements.length} model-response elements`);

    if (assistantElements.length === 0) {
      // Fallback to other possible selectors
      assistantElements = document.querySelectorAll('[data-test-id*="response"], .assistant-message, .model-response-text, message-content');
      console.log(`🔵 Synapse Gemini: Fallback found ${assistantElements.length} assistant elements`);
    }

    assistantElements.forEach((element, index) => {
      console.log(`🔵 Synapse Gemini: Processing assistant element ${index}:`, element.tagName, element.className);
      
      // Try multiple selectors for response content
      const contentSelectors = [
        'message-content.model-response-text .markdown',
        'message-content.model-response-text',
        'message-content .markdown p',
        'message-content .markdown',
        '.presented-response-container',
        'response-container',
        '.response-container',
        '.response-content',
        'message-content',
        '.markdown p',
        '.markdown'
      ];

      let content = '';
      let foundSelector = null;
      for (const selector of contentSelectors) {
        const contentElement = element.querySelector(selector);
        if (contentElement) {
          content = this.extractTextContent(contentElement);
          console.log(`🔵 Synapse Gemini: Trying selector "${selector}": "${content.slice(0, 50)}..."`);
          if (content.trim()) {
            foundSelector = selector;
            break;
          }
        }
      }

      // If no content found with selectors, try extracting from the entire element
      if (!content.trim()) {
        content = this.extractTextContent(element);
        foundSelector = 'entire element';
        console.log(`🔵 Synapse Gemini: Extracted from whole element: "${content.slice(0, 50)}..."`);
      }

      console.log(`🔵 Synapse Gemini: Assistant message ${index} (${foundSelector}): "${content.slice(0, 50)}..."`);

      if (content.trim()) {
        messages.push({
          role: 'assistant',
          content: content.trim(),
          timestamp: Date.now() - (assistantElements.length - index) * 2000 + 1000,
          index: index * 2 + 1
        });
      } else {
        console.log(`🔵 Synapse Gemini: No text content found in assistant element ${index}`);
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
      'textarea[placeholder*="Ask Gemini"]',
      '[data-test-id="input-field"]',
      'div[contenteditable="true"][role="textbox"]',
      '.input-area textarea',
      '.chat-input textarea'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) return element; // Check if visible
    }

    return null;
  }

  getSendButton() {
    const selectors = [
      '[aria-label*="Send"]',
      '[data-test-id="send-button"]',
      'button[type="submit"]',
      'button[aria-label*="submit"]',
      '.send-button',
      'button[data-test-id*="send"]',
      'button svg[data-test-id*="send"]',
      'button:has(svg[data-test-id*="send"])'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && !element.disabled && element.offsetParent !== null) return element;
    }

    return null;
  }

  isNewConversation() {
    const url = window.location.href;
    // Check if we're on the main Gemini page without a specific chat ID
    return url.includes('gemini.google.com') && 
           (url.includes('/app') || url.endsWith('gemini.google.com/') || url.endsWith('gemini.google.com')) && 
           !url.includes('/chat/');
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