# Synapse - LLM Context Manager POC Implementation Plan

## Overview
A Chrome extension that captures, summarizes, and shares conversation context across different LLM platforms (ChatGPT, Gemini, Claude, etc.).

## Core Features for POC
1. **Domain Configuration**: User specifies which domains to monitor
2. **Conversation Detection**: Detect when user starts/ends LLM conversations
3. **Content Extraction**: Capture conversation text from supported LLM platforms
4. **Summarization**: Generate concise summaries of conversations
5. **Context Injection**: Inject relevant context into new LLM conversations

## Technical Architecture

### Chrome Extension Structure
```
synapse-extension/
├── manifest.json
├── background/
│   ├── service-worker.js
│   └── storage.js
├── content/
│   ├── conversation-detector.js
│   ├── platform-parsers/
│   │   ├── chatgpt.js
│   │   ├── gemini.js
│   │   └── claude.js
│   └── context-injector.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── settings.js
└── utils/
    ├── summarizer.js
    └── storage-manager.js
```

### Data Flow
1. **Monitoring Phase**
   - Content script monitors DOM changes on configured domains
   - Detects conversation start/end based on platform-specific patterns
   - Extracts conversation data in real-time

2. **Processing Phase**
   - Sends conversation to background script
   - Calls summarization API (OpenAI/local model)
   - Stores summary with metadata in local storage

3. **Injection Phase**
   - Detects new conversation start
   - Retrieves relevant context summaries
   - Injects context as initial prompt

## Implementation Phases

### Phase 1: Basic Extension Setup (Week 1)
- [ ] Chrome extension boilerplate with manifest v3
- [ ] Basic popup UI for domain configuration
- [ ] Content script injection system
- [ ] Local storage setup

### Phase 2: Single Platform Support (Week 2)
- [ ] ChatGPT conversation detection
- [ ] Basic text extraction from chat interface
- [ ] Simple conversation boundary detection
- [ ] Local storage of raw conversations

### Phase 3: Summarization Integration (Week 3)
- [ ] OpenAI API integration for summarization
- [ ] Background service for processing conversations
- [ ] Summary storage with metadata (timestamp, domain, etc.)
- [ ] Basic context retrieval system

### Phase 4: Context Injection (Week 4)
- [ ] Context injection into new ChatGPT conversations
- [ ] Smart context selection based on relevance
- [ ] User controls for context management

### Phase 5: Multi-Platform Support (Week 5-6)
- [ ] Gemini platform support
- [ ] Claude platform support
- [ ] Unified parser interface
- [ ] Cross-platform context sharing

## Technical Implementation Details

### Conversation Detection Strategy
```javascript
// Platform-specific selectors and patterns
const PLATFORMS = {
  'chat.openai.com': {
    messageSelector: '[data-message-author-role]',
    inputSelector: '#prompt-textarea',
    conversationContainer: 'main'
  },
  'gemini.google.com': {
    messageSelector: '.model-response-text',
    inputSelector: 'rich-textarea',
    conversationContainer: '.conversation-container'
  }
};
```

### Storage Schema
```javascript
const ConversationSchema = {
  id: 'string',
  platform: 'string',
  domain: 'string',
  timestamp: 'number',
  messages: [
    {
      role: 'user|assistant',
      content: 'string',
      timestamp: 'number'
    }
  ],
  summary: 'string',
  tags: ['string'],
  context_injected: 'boolean'
};
```

### Context Injection Strategy
```javascript
// Inject context as system message or prepended user message
function injectContext(relevantSummaries) {
  const contextPrompt = `
Previous conversation context:
${relevantSummaries.map(s => `- ${s.summary}`).join('\n')}

Current request: `;

  // Platform-specific injection logic
  injectIntoInputField(contextPrompt);
}
```

## Privacy & Security Considerations
- All data stored locally (no cloud storage for POC)
- Conversation content never leaves user's machine except for summarization
- Optional local LLM for summarization to avoid API calls
- Clear data management and deletion options

## Testing Strategy
1. **Unit Tests**: Core functions (parsing, storage, injection)
2. **Integration Tests**: End-to-end conversation flow
3. **Manual Testing**: Real usage across platforms
4. **Performance Testing**: Memory usage and DOM monitoring impact

## Success Metrics for POC
- Successfully captures 90%+ of conversations on supported platforms
- Context injection works reliably
- <2 second delay for context retrieval and injection
- <10MB memory footprint
- User can successfully manage context across 2+ platforms

## Potential Challenges & Mitigations

### Challenge 1: Platform UI Changes
- **Mitigation**: Modular parser design, regular updates, fallback detection methods

### Challenge 2: Performance Impact
- **Mitigation**: Debounced DOM observation, efficient data structures, background processing

### Challenge 3: Context Relevance
- **Mitigation**: Simple keyword matching for POC, semantic similarity for v2

### Challenge 4: User Privacy Concerns
- **Mitigation**: Local-first approach, clear data controls, optional features

## Technology Stack
- **Extension**: JavaScript (ES6+), Chrome Extension APIs
- **UI**: HTML/CSS, Chrome Extension Popup API
- **Storage**: Chrome Storage API
- **Summarization**: OpenAI API (with fallback to local options)
- **Build**: Webpack/Vite for bundling
- **Testing**: Jest for unit tests

## Next Steps
1. Set up development environment
2. Create basic extension structure
3. Implement ChatGPT conversation detection
4. Build summarization pipeline
5. Create context injection mechanism

## Estimated Timeline: 6 weeks for complete POC