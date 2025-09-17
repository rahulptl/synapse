// Debug script - run this in browser console on ChatGPT page
// Copy and paste this entire script into the browser console

console.log('🔧 SYNAPSE DEBUG SCRIPT');
console.log('========================');

// Check if we're on the right domain
console.log('1. Current URL:', window.location.href);
console.log('2. Hostname:', window.location.hostname);

// Check if content scripts are loaded
console.log('3. StorageManager available:', typeof StorageManager);
console.log('4. ChatGPTParser available:', typeof ChatGPTParser);

// Check chrome.storage availability
console.log('5. Chrome storage available:', typeof chrome !== 'undefined' && chrome.storage);

// Test storage manually
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get(null, (data) => {
    console.log('6. Current storage data:', data);
  });
} else {
  console.log('6. ❌ Chrome storage not available');
}

// Check if platform parser works
if (typeof ChatGPTParser !== 'undefined') {
  try {
    const parser = new ChatGPTParser();
    const messages = parser.extractMessages();
    console.log('7. ✅ Parser working, found messages:', messages.length);
    if (messages.length > 0) {
      console.log('   First message:', messages[0]);
    }
  } catch (error) {
    console.log('7. ❌ Parser error:', error);
  }
} else {
  console.log('7. ❌ ChatGPTParser not loaded');
}

// Check conversation detector
console.log('8. Conversation detector instance:', typeof conversationDetector);

// Check extension in chrome://extensions
console.log('========================');
console.log('📋 NEXT STEPS:');
console.log('1. If you see ❌ errors above, the extension may not be loaded properly');
console.log('2. Check chrome://extensions/ - make sure Synapse is enabled');
console.log('3. Try reloading the extension from the Extensions page');
console.log('4. Make sure you granted permissions to chatgpt.com');
console.log('5. Check the service worker console in chrome://extensions/');