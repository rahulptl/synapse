// Initialize the Memory Bay Extension when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('[Memory Bay] Starting initialization...');
        
        // Verify all modules are loaded
        if (!window.MemoryBay || !window.MemoryBay.SidePanelApp) {
            throw new Error('Memory Bay modules not loaded properly');
        }
        
        // Get the app instance and initialize
        const app = window.MemoryBay.getApp();
        await app.initialize();
        
        // Make app available globally for debugging
        window.memoryBayApp = app;
        
        console.log('[Memory Bay] Initialization complete');
        
    } catch (error) {
        console.error('[Memory Bay] Initialization failed:', error);
        
        // Show error to user
        const errorHTML = `
            <div class="init-error" style="padding: 20px; text-align: center; color: #f44336;">
                <h3>Extension Error</h3>
                <p>The Memory Bay Extension failed to load.</p>
                <p><strong>Error:</strong> ${error.message}</p>
                <p>Try reloading the extension in chrome://extensions/</p>
                <button onclick="location.reload()" style="padding: 8px 16px; margin: 10px;">Reload Page</button>
            </div>
        `;
        
        document.body.innerHTML = errorHTML;
    }
});