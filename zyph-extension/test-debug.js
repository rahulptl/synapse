// Debug script to test the extension functionality
// Run this in the browser console to check the state

console.log('=== Zyph Extension Debug Info ===');

// Check if the content script is loaded
if (window.zyphContentCapture) {
    console.log('✅ Content script loaded');
    console.log('Current selection:', window.getSelection().toString());
} else {
    console.log('❌ Content script not loaded');
}

// Check extension storage
chrome.storage.local.get(['zyphFolders', 'zyphContent', 'openaiApiKey'], (result) => {
    console.log('📂 Folders:', result.zyphFolders?.length || 0);
    console.log('📄 Content items:', result.zyphContent?.length || 0);
    console.log('🔑 API key set:', !!result.openaiApiKey);
    
    if (result.zyphFolders) {
        console.log('Folder details:', result.zyphFolders.map(f => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId
        })));
    }
});

// Test message sending
chrome.runtime.sendMessage({action: 'updateContextMenus'}, (response) => {
    console.log('📡 Message response:', response);
});