# Synapse - LLM Context Manager

A Chrome extension that captures, summarizes, and shares conversation context across different LLM platforms (ChatGPT, Gemini, Claude).

## Features

- **Context Capture**: Automatically detects and captures conversations from supported LLM platforms
- **Smart Summarization**: Generates concise summaries of conversations using AI
- **Context Injection**: Automatically injects relevant context when starting new conversations
- **Multi-Platform Support**: Works across ChatGPT, Gemini, and Claude
- **Privacy-First**: All data stored locally on your device
- **Configurable**: Enable/disable monitoring for specific platforms

## Supported Platforms

- ✅ **ChatGPT** (chat.openai.com)
- ✅ **Gemini** (gemini.google.com)
- ✅ **Claude** (claude.ai)

## Installation

### Option 1: Load as Unpacked Extension (Development)

1. **Download or Clone**
   ```bash
   git clone <repository-url>
   cd synapse-extension
   ```

2. **Generate Icons** (Optional)
   - Open `icons/create-icons.html` in your browser
   - Download the generated icon files and place them in the `icons/` folder

3. **Load Extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `synapse-extension` folder

4. **Verify Installation**
   - The Synapse icon should appear in your Chrome toolbar
   - Click the icon to open the settings popup

### Option 2: Install from Chrome Web Store (Coming Soon)

The extension will be available on the Chrome Web Store after initial testing.

## Setup

### Basic Configuration

1. **Open Extension Popup**
   - Click the Synapse icon in your Chrome toolbar

2. **Configure Platforms**
   - Toggle on/off monitoring for each supported platform
   - All platforms are enabled by default

3. **Optional: API Configuration**
   - For enhanced summarization, you can add your OpenAI API key
   - Go to popup settings and add your API key
   - Without an API key, the extension uses local summarization

### API Key Setup (Optional)

To use OpenAI for conversation summarization:

1. Get an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Open the Synapse popup
3. Click "Settings" and enter your API key
4. Save the configuration

**Note**: API keys are stored locally and never shared.

## How It Works

1. **Conversation Detection**
   - Extension monitors DOM changes on enabled LLM platforms
   - Detects when conversations start and end
   - Captures message content in real-time

2. **Summarization**
   - When a conversation ends, it's sent for summarization
   - Uses OpenAI API (if configured) or local summarization
   - Summaries focus on key topics, solutions, and context

3. **Context Injection**
   - When starting a new conversation, retrieves relevant past summaries
   - Automatically injects context into the input field
   - Shows a notification when context is injected

## Usage

### Starting a New Conversation

1. Navigate to any supported LLM platform
2. Start a new chat/conversation
3. If relevant context exists, it will be automatically injected
4. You'll see a notification confirming context injection

### Managing Your Data

- **View Statistics**: Check the popup for conversation and summary counts
- **Clear Data**: Use the "Clear All Data" button to remove all stored conversations
- **Platform Settings**: Enable/disable monitoring per platform

## File Structure

```
synapse-extension/
├── manifest.json              # Extension configuration
├── background/
│   └── service-worker.js      # Background processing
├── content/
│   ├── conversation-detector.js   # Detects conversations
│   ├── context-injector.js       # Injects context
│   └── platform-parsers/
│       ├── chatgpt.js            # ChatGPT-specific parsing
│       ├── gemini.js             # Gemini-specific parsing
│       └── claude.js             # Claude-specific parsing
├── popup/
│   ├── popup.html            # Settings interface
│   └── popup.js              # Popup functionality
├── utils/
│   └── storage-manager.js    # Data storage utilities
└── icons/                    # Extension icons
```

## Privacy & Security

- **Local Storage**: All conversation data is stored locally on your device
- **No Cloud Sync**: Data never leaves your device except for optional API summarization
- **API Usage**: Only conversation text is sent to OpenAI API for summarization (if enabled)
- **No Tracking**: Extension doesn't track or collect any personal information
- **Clear Data**: You can delete all stored data at any time

## Troubleshooting

### Context Not Injecting

1. Check that the platform is enabled in settings
2. Ensure you're starting a new conversation (not continuing an existing one)
3. Verify the input field is empty when navigation occurs
4. Check browser console for any error messages

### Conversations Not Being Detected

1. Refresh the page and try again
2. Check that the extension has proper permissions
3. Verify you're on a supported platform URL
4. Some platform UI updates may require extension updates

### Summaries Not Generating

1. Check if you have an OpenAI API key configured
2. Verify API key has sufficient credits
3. Extension will fall back to local summarization if API fails

### Performance Issues

1. Clear old conversation data if storage is getting large
2. Disable monitoring for platforms you don't use
3. Check Chrome's extension memory usage

## Development

### Prerequisites

- Chrome browser with Developer mode enabled
- Basic knowledge of JavaScript and Chrome Extensions

### Local Development

1. Clone the repository
2. Make your changes
3. Reload the extension in `chrome://extensions/`
4. Test on target platforms

### Platform Parser Development

To add support for new platforms:

1. Create a new parser in `content/platform-parsers/`
2. Implement the required methods:
   - `extractMessages()`
   - `getInputField()`
   - `injectContext(contextText)`
   - `isNewConversation()`
3. Add the parser to the manifest and conversation detector

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on all supported platforms
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Changelog

### v0.1.0 (Initial Release)
- Basic conversation detection and capture
- Context summarization and injection
- Support for ChatGPT, Gemini, and Claude
- Local storage and privacy-first approach
- Configurable platform settings

## Support

For issues, feature requests, or questions:
- Open an issue on GitHub
- Check the troubleshooting section above
- Review browser console for error messages