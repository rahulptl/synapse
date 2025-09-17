class SynapsePopup {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStats();
    this.setupEventListeners();
    this.updateStatus();
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
      const data = await chrome.storage.local.get(['conversations', 'summaries']);
      const conversations = data.conversations || {};
      const summaries = data.summaries || {};

      document.getElementById('conversationCount').textContent = Object.keys(conversations).length;
      document.getElementById('summaryCount').textContent = Object.keys(summaries).length;
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
      const data = await chrome.storage.local.get(['conversations', 'summaries']);
      const conversations = data.conversations || {};

      const popup = window.open('', 'SynapseData', 'width=800,height=600,scrollbars=yes');

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
              <div class="stats">${Object.keys(conversations).length} active conversations</div>
            </div>

            ${Object.keys(conversations).length === 0 ?
              '<div class="empty-state">No conversations recorded yet.</div>' :
              `<div class="conversation-table">
                ${Object.entries(conversations)
                  .sort(([,a], [,b]) => b.startTime - a.startTime)
                  .map(([id, conv]) => `
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
                  `).join('')}
              </div>`
            }
          </body>
        </html>
      `);
      
      popup.document.close();

      popup.document.addEventListener('click', (e) => {
        const row = e.target.closest('.conversation-row');
        if (row) {
          const conversationId = row.getAttribute('data-conversation-id');
          const panel = popup.document.getElementById('messages-' + conversationId);

          if (panel) {
            const isVisible = panel.style.display === 'block';
            popup.document.querySelectorAll('.messages-panel').forEach(p => p.style.display = 'none');
            panel.style.display = isVisible ? 'none' : 'block';
          }
        }
      });

    } catch (error) {
      console.error('Failed to view data:', error);
      this.showNotification('Failed to view data');
    }
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
}

document.addEventListener('DOMContentLoaded', () => {
  new SynapsePopup();
});