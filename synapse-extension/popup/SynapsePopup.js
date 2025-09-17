class SynapsePopup {
  constructor() {
    this.init();
  }

  async init() {
    await this.ensureDefaultFolders();
    await this.loadSettings();
    await this.loadStats();
    this.setupEventListeners();
    this.updateStatus();
  }

  async ensureDefaultFolders() {
    try {
      const data = await chrome.storage.local.get(['folders']);
      if (!data.folders || Object.keys(data.folders).length === 0) {
        console.log('🔵 Synapse Popup: Creating default folders...');
        
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

        await chrome.storage.local.set({ folders: defaultFolders });
        console.log('✅ Synapse Popup: Default folders created successfully');
      } else {
        console.log('🔵 Synapse Popup: Folders already exist:', Object.keys(data.folders));
      }
    } catch (error) {
      console.error('🔴 Synapse Popup: Failed to ensure default folders:', error);
    }
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.local.get(['enabledDomains']);
      const enabledDomains = settings.enabledDomains || {
        'chatgpt.com': true,
        'gemini.google.com': true,
        'claude.ai': true
      };

      document.getElementById('chatgpt-toggle').checked = enabledDomains['chatgpt.com'];
      document.getElementById('gemini-toggle').checked = enabledDomains['gemini.google.com'];
      document.getElementById('claude-toggle').checked = enabledDomains['claude.ai'];
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async loadStats() {
    try {
      const data = await chrome.storage.local.get(['conversations', 'summaries', 'folders']);
      const conversations = data.conversations || {};
      const summaries = data.summaries || {};
      const folders = data.folders || {};

      // Safely update conversation count
      const conversationCountElement = document.getElementById('conversationCount');
      if (conversationCountElement) {
        conversationCountElement.textContent = Object.keys(conversations).length;
      }

      // Safely update summary count  
      const summaryCountElement = document.getElementById('summaryCount');
      if (summaryCountElement) {
        summaryCountElement.textContent = Object.keys(summaries).length;
      }
      
      // Safely update folder count
      const folderCountElement = document.getElementById('folderCount');
      if (folderCountElement) {
        folderCountElement.textContent = Object.keys(folders).length;
      }

      console.log('📊 Synapse Popup: Stats loaded -', {
        conversations: Object.keys(conversations).length,
        summaries: Object.keys(summaries).length, 
        folders: Object.keys(folders).length
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  setupEventListeners() {
    const toggles = ['chatgpt-toggle', 'gemini-toggle', 'claude-toggle'];
    const domains = ['chatgpt.com', 'gemini.google.com', 'claude.ai'];

    toggles.forEach((toggleId, index) => {
      document.getElementById(toggleId).addEventListener('change', async (e) => {
        await this.updateDomainSetting(domains[index], e.target.checked);
      });
    });

    document.getElementById('clearDataBtn').addEventListener('click', () => {
      this.clearAllData();
    });

    document.getElementById('viewDataBtn').addEventListener('click', () => {
      this.viewStoredData();
    });

    document.getElementById('manageFoldersBtn').addEventListener('click', () => {
      this.manageFolders();
    });
  }

  async updateDomainSetting(domain, enabled) {
    try {
      const settings = await chrome.storage.local.get(['enabledDomains']);
      const enabledDomains = settings.enabledDomains || {};
      enabledDomains[domain] = enabled;

      await chrome.storage.local.set({ enabledDomains });

      chrome.runtime.sendMessage({
        type: 'DOMAIN_SETTING_CHANGED',
        domain,
        enabled
      });

      this.updateStatus();
    } catch (error) {
      console.error('Failed to update domain setting:', error);
    }
  }

  async clearAllData() {
    if (confirm('Are you sure you want to clear all conversation data? This cannot be undone.')) {
      try {
        await chrome.storage.local.clear();
        await this.loadStats();

        chrome.runtime.sendMessage({
          type: 'DATA_CLEARED'
        });

        this.showNotification('All data cleared successfully');
      } catch (error) {
        console.error('Failed to clear data:', error);
        this.showNotification('Failed to clear data');
      }
    }
  }

  async updateStatus() {
    try {
      const settings = await chrome.storage.local.get(['enabledDomains']);
      const enabledDomains = settings.enabledDomains || {};
      const hasEnabledDomains = Object.values(enabledDomains).some(enabled => enabled);

      const statusElement = document.getElementById('status');
      const logoElement = document.querySelector('.logo');

      if (hasEnabledDomains) {
        statusElement.className = 'status active';
        statusElement.innerHTML = '<div class="status-dot"></div><span>🤖 AI Context Syncing...</span>';
        logoElement.classList.add('recording');
      } else {
        statusElement.className = 'status inactive';
        statusElement.innerHTML = '<div class="status-dot"></div><span>No domains enabled</span>';
        logoElement.classList.remove('recording');
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  }

  async viewStoredData() {
    try {
      const data = await chrome.storage.local.get(['conversations', 'summaries', 'folders']);
      const conversations = data.conversations || {};
      const folders = data.folders || {};

      const popup = window.open('', 'SynapseData', 'width=900,height=700,scrollbars=yes');

      if (!popup) {
        this.showNotification('Failed to open data viewer');
        return;
      }
      
      popup.document.write(`
        <html>
          <head>
            <title>Synapse Data Viewer</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #fafafa; color: #333; }
              .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
              h1 { margin: 0 0 10px 0; font-size: 24px; color: #333; }
              .stats { color: #666; font-size: 14px; }
              .conversation-table { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
              .conversation-row { padding: 16px 20px; border-bottom: 1px solid #f0f0f0; cursor: pointer; transition: background-color 0.2s ease; display: flex; justify-content: space-between; align-items: center; }
              .conversation-row:hover { background-color: #f8f9fa; }
              .conversation-row:last-child { border-bottom: none; }
              .conversation-info { flex: 1; }
              .conversation-title { font-weight: 600; margin-bottom: 4px; color: #333; }
              .conversation-meta { font-size: 13px; color: #666; }
              .message-count { background: #667eea; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
              .messages-panel { display: none; padding: 20px; background: #f8f9fa; border-top: 1px solid #e0e0e0; max-height: 400px; overflow-y: auto; }
              .message { margin-bottom: 12px; padding: 12px; border-radius: 6px; font-size: 14px; line-height: 1.4; }
              .message.user { background: #e3f2fd; border-left: 3px solid #2196f3; }
              .message.assistant { background: #f3e5f5; border-left: 3px solid #9c27b0; }
              .message-role { font-weight: 600; font-size: 12px; text-transform: uppercase; margin-bottom: 6px; opacity: 0.7; }
              .message-content { white-space: pre-wrap; word-wrap: break-word; }
              .empty-state { text-align: center; padding: 40px; color: #666; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Synapse Data Viewer</h1>
              <div class="stats">${Object.keys(conversations).length} conversations • ${Object.keys(folders).length} folders</div>
            </div>

            ${Object.keys(conversations).length === 0 ?
              '<div class="empty-state">No conversations recorded yet.</div>' :
              this.generateFolderView(conversations, folders)
            }
            <script src="dataViewer.js"></script>
          </body>
        </html>
      `);
      
      popup.document.close();
    } catch (error) {
      console.error('Failed to view data:', error);
      this.showNotification('Failed to view data');
    }
  }

  generateFolderView(conversations, folders) {
    const conversationsByFolder = {};
    const unfoldered = [];

    Object.entries(conversations).forEach(([id, conv]) => {
      if (conv.folderId && folders[conv.folderId]) {
        if (!conversationsByFolder[conv.folderId]) {
          conversationsByFolder[conv.folderId] = [];
        }
        conversationsByFolder[conv.folderId].push([id, conv]);
      } else {
        unfoldered.push([id, conv]);
      }
    });

    let html = '';

    Object.entries(folders).forEach(([folderId, folder]) => {
      const folderConversations = conversationsByFolder[folderId] || [];
      html += `
        <div class="folder-section" style="margin-bottom: 30px;">
          <div style="
            display: flex; 
            align-items: center; 
            margin-bottom: 12px; 
            padding: 12px; 
            background: ${folder.color}15; 
            border-radius: 8px;
            border-left: 4px solid ${folder.color};
          ">
            <div style="
              width: 24px; 
              height: 24px; 
              background: ${folder.color}; 
              border-radius: 4px; 
              margin-right: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 12px;
            ">${folder.icon || '📁'}</div>
            <h2 style="margin: 0; font-size: 16px; color: #333;">${folder.name}</h2>
            <span style="margin-left: auto; color: #666; font-size: 13px;">${folderConversations.length} conversations</span>
          </div>
          
          ${folderConversations.length === 0 ? 
            '<div style="text-align: center; padding: 20px; color: #999; font-style: italic;">No conversations in this folder yet</div>' :
            `<div class="conversation-table">
              ${folderConversations
                .sort(([,a], [,b]) => b.startTime - a.startTime)
                .map(([id, conv]) => this.generateConversationRow(id, conv))
                .join('')}
            </div>`
          }
        </div>
      `;
    });

    if (unfoldered.length > 0) {
      html += `
        <div class="folder-section" style="margin-bottom: 30px;">
          <div style="
            display: flex; 
            align-items: center; 
            margin-bottom: 12px; 
            padding: 12px; 
            background: #f8f9fa; 
            border-radius: 8px;
            border-left: 4px solid #dee2e6;
          ">
            <div style="
              width: 24px; 
              height: 24px; 
              background: #dee2e6; 
              border-radius: 4px; 
              margin-right: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #6c757d;
              font-size: 12px;
            ">📄</div>
            <h2 style="margin: 0; font-size: 16px; color: #333;">Unorganized</h2>
            <span style="margin-left: auto; color: #666; font-size: 13px;">${unfoldered.length} conversations</span>
          </div>
          
          <div class="conversation-table">
            ${unfoldered
              .sort(([,a], [,b]) => b.startTime - a.startTime)
              .map(([id, conv]) => this.generateConversationRow(id, conv))
              .join('')}
          </div>
        </div>
      `;
    }

    return html;
  }

  generateConversationRow(id, conv) {
    return `
      <div class="conversation-item">
        <div class="conversation-row" data-conversation-id="${id}">
          <div class="conversation-info">
            <div class="conversation-title">${conv.platform} • ${id.split('_').pop()}</div>
            <div class="conversation-meta">${new Date(conv.startTime).toLocaleString()}</div>
          </div>
          <div class="message-count">${conv.messages ? conv.messages.length : 0}</div>
        </div>
        <div class="messages-panel" id="messages-${id}">
          ${conv.messages ? conv.messages.map(msg => `
            <div class="message ${msg.role}">
              <div class="message-role">${msg.role}</div>
              <div class="message-content">${this.escapeHtml(msg.content)}</div>
            </div>
          `).join('') : ''}
        </div>
      </div>
    `;
  }
  
  escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 2000);
  }

  async manageFolders() {
    try {
      const data = await chrome.storage.local.get(['folders']);
      const folders = data.folders || {};

      const popup = window.open('', 'SynapseFolders', 'width=600,height=500,scrollbars=yes');

      if (!popup) {
        this.showNotification('Failed to open folder manager');
        return;
      }
      
      popup.document.write(`
        <html>
          <head>
            <title>Manage Folders</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #fafafa; color: #333; }
              .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
              h1 { margin: 0 0 10px 0; font-size: 24px; color: #333; }
              .folder-list { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
              .folder-item { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f0f0f0; }
              .folder-item:last-child { border-bottom: none; }
              .folder-icon { width: 32px; height: 32px; border-radius: 6px; margin-right: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; }
              .folder-info { flex: 1; }
              .folder-name { font-weight: 600; margin-bottom: 4px; color: #333; }
              .folder-meta { font-size: 13px; color: #666; }
              .folder-actions { display: flex; gap: 8px; }
              .btn { padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
              .btn-edit { background: #667eea; color: white; }
              .btn-edit:hover { background: #5a6fd8; }
              .btn-delete { background: #dc3545; color: white; }
              .btn-delete:hover { background: #c82333; }
              .btn-primary { background: #28a745; color: white; padding: 10px 20px; border-radius: 6px; font-size: 14px; }
              .btn-primary:hover { background: #218838; }
              .add-folder { text-align: center; }
              .empty-state { text-align: center; padding: 40px; color: #666; }
              .form-group { margin-bottom: 16px; }
              .form-group label { display: block; margin-bottom: 4px; font-weight: 500; }
              .form-group input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
              .color-picker { display: flex; gap: 8px; margin-top: 8px; }
              .color-option { width: 24px; height: 24px; border-radius: 4px; cursor: pointer; border: 2px solid transparent; }
              .color-option.selected { border-color: #333; }
              .icon-picker { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
              .icon-option { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 2px solid transparent; border-radius: 4px; cursor: pointer; font-size: 16px; }
              .icon-option.selected { border-color: #667eea; background: #667eea10; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Manage Folders</h1>
              <p style="margin: 0; color: #666;">Organize your AI conversations</p>
            </div>

            ${Object.keys(folders).length === 0 ?
              '<div class="empty-state">No folders created yet. Add your first folder below!</div>' :
              `<div class="folder-list">
                ${Object.entries(folders)
                  .sort(([,a], [,b]) => a.createdAt - b.createdAt)
                  .map(([id, folder]) => `
                    <div class="folder-item">
                      <div class="folder-icon" style="background: ${folder.color};">${folder.icon || '📁'}</div>
                      <div class="folder-info">
                        <div class="folder-name">${folder.name}</div>
                        <div class="folder-meta">Created ${new Date(folder.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div class="folder-actions">
                        <button class="btn btn-edit" data-action="edit" data-folder-id="${id}" data-folder-name="${folder.name}" data-folder-color="${folder.color}" data-folder-icon="${folder.icon}">Edit</button>
                        <button class="btn btn-delete" data-action="delete" data-folder-id="${id}">Delete</button>
                      </div>
                    </div>
                  `).join('')}
              </div>`
            }

            <div class="add-folder">
              <button class="btn btn-primary" id="add-folder-btn">Add New Folder</button>
            </div>
            <script src="folderManager.js"></script>
          </body>
        </html>
      `);
      
      popup.document.close();

      window.addEventListener('message', async (event) => {
        if (event.data.type === 'SAVE_FOLDER') {
          await chrome.storage.local.get(['folders']).then(async (data) => {
            const folders = data.folders || {};
            folders[event.data.folderId] = event.data.folderData;
            await chrome.storage.local.set({ folders });
          });
          this.loadStats();
        } else if (event.data.type === 'DELETE_FOLDER') {
          await chrome.storage.local.get(['folders', 'conversations']).then(async (data) => {
            const folders = data.folders || {};
            const conversations = data.conversations || {};
            
            delete folders[event.data.folderId];
            
            Object.values(conversations).forEach(conv => {
              if (conv.folderId === event.data.folderId) {
                delete conv.folderId;
              }
            });
            
            await chrome.storage.local.set({ folders, conversations });
          });
          this.loadStats();
        }
      });

    } catch (error) {
      console.error('Failed to manage folders:', error);
      this.showNotification('Failed to manage folders');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SynapsePopup();
});