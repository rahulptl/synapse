window.Zyph = window.Zyph || {};

window.Zyph.SidePanelApp = class SidePanelApp {
    constructor() {
        this.folderManager = null;
        this.promptManager = null;
        this.contextGenerator = null;
        this.uiManager = null;
        this.initialized = false;
    }

    async initialize() {
        try {
            console.log('[SidePanelApp] Initializing application...');
            
            // Initialize managers in dependency order
            this.folderManager = new window.Zyph.FolderManager();
            this.promptManager = new window.Zyph.PromptManager();
            this.contextGenerator = new window.Zyph.ContextGenerator(this.folderManager, this.promptManager);
            this.uiManager = new window.Zyph.UIManager(this.folderManager, this.contextGenerator);

            // Load initial data
            await this.loadInitialData();

            this.initialized = true;
            console.log('[SidePanelApp] Application initialized successfully');
            
            // Dispatch initialization complete event
            this.dispatchEvent('app:initialized');
            
        } catch (error) {
            console.error('[SidePanelApp] Failed to initialize application:', error);
            this.handleInitializationError(error);
        }
    }

    async loadInitialData() {
        console.log('[SidePanelApp] Loading initial data...');
        
        try {
            // Load folders and render initial UI
            await this.uiManager.renderFolders();
            
            // Validate prompt system
            const promptValidation = await this.promptManager.validatePrompt();
            if (!promptValidation.isValid) {
                console.warn('[SidePanelApp] Prompt validation failed:', promptValidation);
            }
            
        } catch (error) {
            console.error('[SidePanelApp] Error loading initial data:', error);
            throw error;
        }
    }

    handleInitializationError(error) {
        // Show user-friendly error message
        const errorHTML = `
            <div class="init-error">
                <h3>⚠️ Initialization Error</h3>
                <p>The Zyph Extension failed to initialize properly.</p>
                <p><strong>Error:</strong> ${error.message}</p>
                <button onclick="location.reload()" class="btn primary">Reload Extension</button>
            </div>
        `;
        
        document.body.innerHTML = errorHTML;
    }

    dispatchEvent(eventName, data = {}) {
        const event = new CustomEvent(eventName, { detail: data });
        document.dispatchEvent(event);
    }

    // Public API methods for external access
    getFolderManager() {
        return this.folderManager;
    }

    getContextGenerator() {
        return this.contextGenerator;
    }

    getPromptManager() {
        return this.promptManager;
    }

    getUIManager() {
        return this.uiManager;
    }

    // Health check methods
    isInitialized() {
        return this.initialized;
    }

    async healthCheck() {
        const health = {
            app: this.initialized,
            folderManager: !!this.folderManager,
            contextGenerator: !!this.contextGenerator,
            promptManager: !!this.promptManager,
            uiManager: !!this.uiManager,
            storage: false,
            apiKey: false
        };

        try {
            // Test storage access
            const testData = await chrome.storage.local.get('zyphFolders');
            health.storage = true;

            // Test API key
            const apiKeyData = await chrome.storage.local.get('openaiApiKey');
            health.apiKey = !!apiKeyData.openaiApiKey;

        } catch (error) {
            console.error('[SidePanelApp] Health check failed:', error);
        }

        return health;
    }

    // Development/debugging methods
    async getDebugInfo() {
        return {
            initialized: this.initialized,
            folderCount: this.folderManager?.folders?.length || 0,
            selectedFolder: this.folderManager?.selectedFolder?.name || 'None',
            promptInfo: await this.promptManager?.getPromptInfo() || {},
            health: await this.healthCheck()
        };
    }

    // Error recovery methods
    async restart() {
        console.log('[SidePanelApp] Restarting application...');
        
        try {
            // Reset all managers
            this.folderManager = null;
            this.contextGenerator = null;
            this.promptManager = null;
            this.uiManager = null;
            this.initialized = false;

            // Clear any existing UI
            document.querySelectorAll('.folder-content-panel, .modal.show').forEach(el => el.remove());

            // Reinitialize
            await this.initialize();
            
        } catch (error) {
            console.error('[SidePanelApp] Restart failed:', error);
            this.handleInitializationError(error);
        }
    }

    // Cleanup method
    destroy() {
        console.log('[SidePanelApp] Destroying application...');
        
        // Remove event listeners and clean up UI
        document.querySelectorAll('.folder-content-panel, .modal.show').forEach(el => el.remove());
        
        // Reset state
        this.folderManager = null;
        this.contextGenerator = null;
        this.promptManager = null;
        this.uiManager = null;
        this.initialized = false;
        
        this.dispatchEvent('app:destroyed');
    }
};

// Global app instance and factory function
window.Zyph.appInstance = null;

window.Zyph.getApp = function() {
    if (!window.Zyph.appInstance) {
        window.Zyph.appInstance = new window.Zyph.SidePanelApp();
    }
    return window.Zyph.appInstance;
};