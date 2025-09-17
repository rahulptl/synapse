// Folder Selector Component for Synapse Extension
// Shows a small popup when entering AI websites to select conversation folder

class FolderSelector {
  constructor() {
    this.isVisible = false;
    this.currentConversationId = null;
    this.selectedFolderId = null;
    this.folders = {};
    this.init();
  }

  async init() {
    console.log('🔵 Synapse FolderSelector: Initializing...');
    await this.loadFolders();
    await this.ensureDefaultFolders();
    this.setupEventListeners();
    this.addFloatingButton();
    
    // Show folder selector when conversation is detected
    if (window.conversationDetector) {
      this.setupConversationListener();
    } else {
      // Wait for conversation detector to load
      setTimeout(() => this.init(), 1000);
    }
  }

  async ensureDefaultFolders() {
    // Check if we have any folders, if not create defaults
    if (Object.keys(this.folders).length === 0) {
      console.log('🔵 Synapse FolderSelector: Creating default folders...');
      this.folders = await this.getDefaultFolders();
    }
  }

  async loadFolders() {
    try {
      const data = await StorageManager.get(['folders']);
      if (data.folders && Object.keys(data.folders).length > 0) {
        this.folders = data.folders;
        console.log('🔵 Synapse FolderSelector: Loaded existing folders:', Object.keys(this.folders));
      } else {
        console.log('🔵 Synapse FolderSelector: No folders found, creating defaults...');
        this.folders = await this.getDefaultFolders();
      }
    } catch (error) {
      console.error('🔴 Synapse FolderSelector: Failed to load folders:', error);
      this.folders = await this.getDefaultFolders();
    }
  }

  async getDefaultFolders() {
    const defaultFolders = {
      'personal': { 
        name: 'Personal', 
        color: '#667eea', 
        icon: '👤',
        createdAt: Date.now() 
      },
      'work': { 
        name: 'Work', 
        color: '#28a745', 
        icon: '💼',
        createdAt: Date.now() 
      },
      'random': { 
        name: 'Random', 
        color: '#ffc107', 
        icon: '🎲',
        createdAt: Date.now() 
      }
    };

    // Save default folders
    await StorageManager.set({ folders: defaultFolders });
    return defaultFolders;
  }

  setupConversationListener() {
    // Listen for new conversations
    const originalStartConversation = window.conversationDetector.startConversation;
    window.conversationDetector.startConversation = async (...args) => {
      const result = await originalStartConversation.apply(window.conversationDetector, args);
      this.showFolderSelector(window.conversationDetector.currentConversationId);
      return result;
    };
  }

  setupEventListeners() {
    // Listen for URL changes (for single-page apps)
    let currentUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        this.handleUrlChange();
      }
    }, 1000);

    // Listen for new conversation messages
    document.addEventListener('synapseNewConversation', (event) => {
      this.showFolderSelector(event.detail.conversationId);
    });
  }

  handleUrlChange() {
    // Check if we're on a new conversation page
    const isNewConversation = this.detectNewConversation();
    if (isNewConversation && !this.isVisible) {
      // Small delay to let the page load
      setTimeout(() => {
        this.showFolderSelector();
      }, 3000);
    }
  }

  detectNewConversation() {
    const url = window.location.href;
    
    // ChatGPT new conversation detection
    if (url.includes('chatgpt.com') && (url.endsWith('/') || url.includes('/?'))) {
      return true;
    }
    
    // Gemini new conversation detection  
    if (url.includes('gemini.google.com') && (url.includes('/app') && !url.includes('/chat/'))) {
      return true;
    }
    
    // Claude new conversation detection
    if (url.includes('claude.ai') && (url.endsWith('/') || url.includes('/chat'))) {
      return true;
    }
    
    return false;
  }

  async showFolderSelector(conversationId = null) {
    if (this.isVisible) return;

    console.log('🔵 Synapse FolderSelector: Showing folder selector');
    this.currentConversationId = conversationId;
    this.isVisible = true;

    // Create overlay
    const overlay = this.createOverlay();
    document.body.appendChild(overlay);

    // Auto-hide after 15 seconds if no selection
    setTimeout(() => {
      if (this.isVisible) {
        this.hideFolderSelector();
      }
    }, 15000);
  }

  createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'synapse-folder-selector-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.1);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding-top: 100px;
      backdrop-filter: blur(2px);
      animation: synapseFadeIn 0.3s ease-out;
    `;

    const popup = this.createPopup();
    overlay.appendChild(popup);

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.hideFolderSelector();
      }
    });

    // Add CSS animations
    this.injectStyles();

    return overlay;
  }

  createPopup() {
    const popup = document.createElement('div');
    popup.style.cssText = `
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
      padding: 24px;
      min-width: 320px;
      max-width: 400px;
      position: relative;
      animation: synapseSlideIn 0.4s ease-out;
      border: 1px solid rgba(0, 0, 0, 0.05);
    `;

    popup.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 20px;">
        <div style="
          width: 32px; height: 32px; 
          background: linear-gradient(45deg, #667eea, #764ba2); 
          border-radius: 8px; 
          margin-right: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 16px;
        ">S</div>
        <div>
          <h3 style="margin: 0; font-size: 18px; color: #333; font-weight: 600;">
            Choose Conversation Folder
          </h3>
          <p style="margin: 4px 0 0 0; font-size: 14px; color: #666;">
            Organize your AI conversations
          </p>
        </div>
        <button id="synapse-close-btn" style="
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          font-size: 20px;
          color: #999;
          cursor: pointer;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        " title="Close">×</button>
      </div>

      <div id="folder-options" style="margin-bottom: 20px;">
        ${Object.entries(this.folders).map(([id, folder]) => `
          <div class="folder-option" data-folder-id="${id}" style="
            display: flex;
            align-items: center;
            padding: 12px;
            border: 2px solid #f0f0f0;
            border-radius: 8px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            background: white;
          ">
            <div style="
              width: 32px;
              height: 32px;
              background: ${folder.color};
              border-radius: 6px;
              margin-right: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
            ">${folder.icon}</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; color: #333; font-size: 14px;">${folder.name}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div style="display: flex; gap: 12px;">
        <button id="synapse-skip-btn" style="
          flex: 1;
          padding: 10px;
          border: 2px solid #e0e0e0;
          border-radius: 6px;
          background: white;
          color: #666;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        ">Skip</button>
        <button id="synapse-confirm-btn" style="
          flex: 2;
          padding: 10px;
          border: none;
          border-radius: 6px;
          background: #667eea;
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          opacity: 0.5;
        " disabled>Select Folder</button>
      </div>
    `;

    this.setupPopupEventListeners(popup);
    return popup;
  }

  setupPopupEventListeners(popup) {
    // Close button
    popup.querySelector('#synapse-close-btn').addEventListener('click', () => {
      this.hideFolderSelector();
    });

    // Skip button
    popup.querySelector('#synapse-skip-btn').addEventListener('click', () => {
      this.hideFolderSelector();
    });

    // Confirm button
    const confirmBtn = popup.querySelector('#synapse-confirm-btn');
    confirmBtn.addEventListener('click', () => {
      if (this.selectedFolderId) {
        this.assignFolderToConversation(this.selectedFolderId);
      }
    });

    // Folder selection
    popup.querySelectorAll('.folder-option').forEach(option => {
      option.addEventListener('click', () => {
        // Clear previous selection
        popup.querySelectorAll('.folder-option').forEach(opt => {
          opt.style.border = '2px solid #f0f0f0';
          opt.style.background = 'white';
        });

        // Select current option
        option.style.border = `2px solid ${this.folders[option.dataset.folderId].color}`;
        option.style.background = `${this.folders[option.dataset.folderId].color}10`;
        
        this.selectedFolderId = option.dataset.folderId;
        
        // Enable confirm button
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
      });

      // Hover effects
      option.addEventListener('mouseenter', () => {
        if (option.dataset.folderId !== this.selectedFolderId) {
          option.style.border = `2px solid ${this.folders[option.dataset.folderId].color}40`;
        }
      });

      option.addEventListener('mouseleave', () => {
        if (option.dataset.folderId !== this.selectedFolderId) {
          option.style.border = '2px solid #f0f0f0';
        }
      });
    });
  }

  async assignFolderToConversation(folderId) {
    console.log('🔵 Synapse FolderSelector: Assigning folder', folderId, 'to conversation', this.currentConversationId);
    
    try {
      // Store the folder selection for the current session
      if (this.currentConversationId) {
        const conversation = await StorageManager.getConversation(this.currentConversationId);
        if (conversation) {
          conversation.folderId = folderId;
          await StorageManager.saveConversation(conversation);
        }
      }

      // Store as default folder for this domain
      const domain = window.location.hostname;
      const settings = await StorageManager.get(['defaultFolders']) || {};
      const defaultFolders = settings.defaultFolders || {};
      defaultFolders[domain] = folderId;
      await StorageManager.set({ defaultFolders });

      // Show success message
      this.showSuccessMessage(this.folders[folderId].name);
      
    } catch (error) {
      console.error('Failed to assign folder:', error);
    }

    this.hideFolderSelector();
  }

  showSuccessMessage(folderName) {
    const message = document.createElement('div');
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #28a745;
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: synapseSlideIn 0.3s ease-out;
    `;
    message.textContent = `📁 Assigned to ${folderName}`;
    
    document.body.appendChild(message);
    
    setTimeout(() => {
      message.remove();
    }, 3000);
  }

  hideFolderSelector() {
    const overlay = document.getElementById('synapse-folder-selector-overlay');
    if (overlay) {
      overlay.style.animation = 'synapseFadeOut 0.2s ease-out forwards';
      setTimeout(() => {
        overlay.remove();
      }, 200);
    }
    
    this.isVisible = false;
    this.selectedFolderId = null;
  }

  addFloatingButton() {
    // Don't add multiple buttons
    if (document.getElementById('synapse-floating-folder-btn')) return;

    const button = document.createElement('div');
    button.id = 'synapse-floating-folder-btn';
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      background: linear-gradient(45deg, #667eea, #764ba2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
      transition: all 0.3s ease;
      font-size: 24px;
      color: white;
      user-select: none;
    `;
    button.innerHTML = '📁';
    button.title = 'Select conversation folder';

    // Hover effects
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.1)';
      button.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.4)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '0 4px 20px rgba(102, 126, 234, 0.3)';
    });

    // Click to show folder selector
    button.addEventListener('click', () => {
      this.showFolderSelector();
    });

    document.body.appendChild(button);
  }

  injectStyles() {
    if (document.getElementById('synapse-folder-selector-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'synapse-folder-selector-styles';
    styles.textContent = `
      @keyframes synapseFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes synapseFadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      
      @keyframes synapseSlideIn {
        from { 
          opacity: 0; 
          transform: translateY(-20px) scale(0.95); 
        }
        to { 
          opacity: 1; 
          transform: translateY(0) scale(1); 
        }
      }
      
      #synapse-close-btn:hover {
        background: #f0f0f0 !important;
      }
      
      #synapse-skip-btn:hover {
        border-color: #ccc !important;
        background: #f8f8f8 !important;
      }
      
      #synapse-confirm-btn:hover:not(:disabled) {
        background: #5a6fd8 !important;
      }
    `;
    
    document.head.appendChild(styles);
  }
}

// Initialize folder selector when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new FolderSelector();
  });
} else {
  new FolderSelector();
}

// Make it globally available
window.SynapseFolderSelector = FolderSelector;