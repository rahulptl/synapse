// Debug script to test Gemini parser functionality
// Run this in the browser console on a Gemini chat page

console.log('🔍 Testing Gemini Parser...');

// First, test basic DOM elements
console.log('🏗️ Testing DOM structure...');
const userElements = document.querySelectorAll('user-query');
console.log('Found user-query elements:', userElements.length);
if (userElements.length > 0) {
  console.log('First user-query element:', userElements[0]);
  console.log('User element HTML sample:', userElements[0].outerHTML.slice(0, 200) + '...');
}

const modelElements = document.querySelectorAll('model-response');
console.log('Found model-response elements:', modelElements.length);
if (modelElements.length > 0) {
  console.log('First model-response element:', modelElements[0]);
  console.log('Model element HTML sample:', modelElements[0].outerHTML.slice(0, 200) + '...');
}

const conversationContainers = document.querySelectorAll('.conversation-container');
console.log('Found conversation containers:', conversationContainers.length);

// Test query text elements
const queryTexts = document.querySelectorAll('.query-text-line');
console.log('Found query-text-line elements:', queryTexts.length);
queryTexts.forEach((el, i) => {
  console.log(`Query text ${i}:`, el.textContent.trim());
});

// Test message content elements
const messageContents = document.querySelectorAll('message-content');
console.log('Found message-content elements:', messageContents.length);
messageContents.forEach((el, i) => {
  console.log(`Message content ${i}:`, el.textContent.trim().slice(0, 100));
});

// Test if GeminiParser is available
if (window.GeminiParser) {
  console.log('✅ GeminiParser is loaded');
  
  const parser = new window.GeminiParser();
  
  // Test individual extraction methods
  console.log('👤 Testing user message extraction...');
  const userMessages = parser.extractUserMessages();
  console.log('User messages found:', userMessages.length, userMessages);
  
  console.log('🤖 Testing assistant message extraction...');
  const assistantMessages = parser.extractAssistantMessages();
  console.log('Assistant messages found:', assistantMessages.length, assistantMessages);
  
  // Test combined message extraction
  console.log('📝 Testing combined message extraction...');
  const allMessages = parser.extractMessages();
  console.log('All messages found:', allMessages.length, allMessages);
  
  // Test UI element detection
  console.log('🔧 Testing UI element detection...');
  const inputField = parser.getInputField();
  console.log('Input field found:', inputField);
  
  const sendButton = parser.getSendButton();
  console.log('Send button found:', sendButton);
  
  console.log('🆕 Testing conversation detection...');
  const isNew = parser.isNewConversation();
  console.log('Is new conversation:', isNew);
  
  const isActive = parser.isConversationActive();
  console.log('Is conversation active:', isActive);
  
} else {
  console.error('❌ GeminiParser not found! Make sure the extension is loaded.');
  console.log('Available window objects:', Object.keys(window).filter(k => k.includes('emini') || k.includes('ynapse')));
}

// Also test the conversation detector
if (window.conversationDetector) {
  console.log('✅ ConversationDetector is available');
  console.log('Platform detected:', window.conversationDetector.platform);
  console.log('Is active:', window.conversationDetector.isActive);
  console.log('Current messages:', window.conversationDetector.messages);
} else {
  console.log('ℹ️ ConversationDetector not yet initialized or not available');
}

console.log('🎯 Gemini Parser test completed. Check the logs above for results.');