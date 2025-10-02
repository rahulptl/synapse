// Initialize the Zyph Extension when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('[Zyph] Starting initialization...');
        
        // Verify all modules are loaded
        if (!window.Zyph || !window.Zyph.SidePanelApp) {
            throw new Error('Zyph modules not loaded properly');
        }
        
        // Get the app instance and initialize
        const app = window.Zyph.getApp();
        await app.initialize();
        
        // Make app available globally for debugging
        window.zyphApp = app;
        
        console.log('[Zyph] Initialization complete');
        
    } catch (error) {
        console.error('[Zyph] Initialization failed:', error);
        
        // Show error to user
        const errorHTML = `
            <div class="init-error" style="padding: 20px; text-align: center; color: #f44336;">
                <h3>Extension Error</h3>
                <p>The Zyph Extension failed to load.</p>
                <p><strong>Error:</strong> ${error.message}</p>
                <p>Try reloading the extension in chrome://extensions/</p>
                <button onclick="location.reload()" style="padding: 8px 16px; margin: 10px;">Reload Page</button>
            </div>
        `;
        
        document.body.innerHTML = errorHTML;
    }
});