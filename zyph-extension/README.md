# Zyph Extension

A Chrome browser extension that transforms how you organize and manage web content through intelligent folder-based organization with AI-powered context generation.

## What is Zyph?

Zyph is a browser extension that allows you to create custom folders and save web content (entire pages or selected text) directly from any website using right-click context menus. Each folder can automatically generate AI-powered summaries and context overviews, turning your saved content into searchable knowledge bases.

## Key Features

- **One-Click Content Saving**: Right-click on any page or selected text to save to folders via context menus
- **Nested Folder Organization**: Create unlimited nested folders with custom icons
- **AI-Powered Context Generation**: Automatically generate comprehensive summaries and knowledge bases for each folder using OpenAI GPT
- **Side Panel Interface**: Clean, intuitive management interface accessible from any tab
- **Smart Content Extraction**: Automatically extracts page titles, URLs, favicons, and metadata
- **Cross-Platform Compatibility**: Works on all websites (with fallback for restricted pages)
- **Search Functionality**: Quickly find folders with real-time search
- **Persistent Storage**: All data saved locally using Chrome's storage API

## Use Cases

### Research & Information Management
- **Academic Research**: Organize papers, articles, and references by topic or project
- **Market Research**: Collect competitor analysis, industry reports, and market data
- **Content Curation**: Build topical knowledge bases for blogs, newsletters, or publications

### Professional Workflows
- **Client Management**: Organize client-related articles, resources, and references
- **Project Documentation**: Collect relevant resources, tutorials, and documentation for projects
- **Lead Generation**: Save and organize prospect information, company research, and industry insights

### Personal Knowledge Building
- **Learning & Development**: Organize tutorials, courses, and educational content by skill
- **Hobby Projects**: Collect recipes, DIY guides, or hobby-related resources
- **Travel Planning**: Save destination guides, reviews, and travel resources

## Target Customers

### Primary Markets

**1. Knowledge Workers & Researchers**
- Academic researchers and students
- Market researchers and analysts
- Content creators and journalists
- Consultants and strategists

**2. Sales & Marketing Professionals**
- Account executives managing multiple clients
- Content marketers building resource libraries
- Business development professionals tracking prospects
- Marketing researchers analyzing competitors

**3. Project Managers & Teams**
- Software development teams collecting documentation
- Product managers organizing feature research
- Consultants managing client resources
- Agency teams organizing campaign materials

### Secondary Markets

**4. Educators & Students**
- Teachers organizing curriculum resources
- Students managing research for papers and projects
- Online course creators collecting reference materials

**5. Personal Productivity Enthusiasts**
- Lifelong learners building knowledge bases
- Professionals pursuing skill development
- Individuals organizing personal interests and hobbies

## Competitive Advantages

- **AI-Enhanced Organization**: Unlike simple bookmark managers, Zyph generates intelligent summaries
- **Contextual Saving**: Save content directly from browsing without breaking workflow
- **Flexible Structure**: Unlimited nested folders vs. flat bookmark structures
- **Rich Metadata**: Captures more than just URLs - full content, context, and metadata
- **Cross-Site Compatibility**: Works on restricted pages where other extensions fail

## Monetization Opportunities

1. **Freemium Model**: Basic folder management free, AI features premium
2. **Team Plans**: Shared folders and collaboration features for organizations
3. **API Integration**: Connect with popular tools like Notion, Obsidian, or CRM systems
4. **Enterprise Features**: Advanced search, analytics, and admin controls

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `zyph-extension` folder
5. The extension icon will appear in your Chrome toolbar

## Quick Start Guide

### 1. Setting Up AI Features (Optional)
1. Click the extension icon to open the side panel
2. Click the settings gear icon
3. Enter your OpenAI API key to enable AI-powered context generation
4. Save settings

### 2. Creating Folders
1. In the side panel, click the "+" button to create a new folder
2. Choose a name, icon, and parent folder (optional)
3. Click "Create Folder"

### 3. Saving Content
1. Right-click on any webpage or selected text
2. Choose "Save to Zyph" from the context menu
3. Select the destination folder
4. Content is automatically saved with metadata

### 4. Managing Content
- **View Content**: Click on any folder to see saved items
- **Generate Context**: Click the refresh button to generate AI summaries
- **Search**: Use the search box to filter folders
- **Organize**: Rename, delete, or create subfolders as needed

## Zyph.com Sync

Zyph can now sync captured items with your workspace on **zyph.com**.

1. **Connect**: Open the side panel settings and add your Zyph.com API key (and optional user ID). Use *Validate Connection* to confirm the key.
2. **Link Folders**: When creating or renaming a folder, choose the matching Zyph.com folder from the dropdown. A cloud badge indicates that the folder is linked.
3. **Capture**: Any new pages or selections saved into a linked folder are queued and ingested through the Zyph API. Sync status is shown next to each item (pending, synced, or needs attention).
4. **Query**: Linked folders include a "Zyph.com Search" panel so you can run semantic queries against your hosted knowledge base without leaving the extension.
5. **Monitor**: Connection health is displayed in settings, and you can disconnect or re-validate at any time.

If the browser is offline or Zyph.com is unavailable, items remain queued locally and will retry with progressive backoff once connectivity is restored.

The side-panel folder tree now mirrors the structure returned by the Zyph.com folders API so any changes made on the web instantly reflect inside the extension.

### Folder Icons
Choose from these icon types:
- 📁 **Folder**: General purpose folders
- 💼 **Work**: Professional or work-related topics
- 👤 **Person**: Customer or contact information
- 🏠 **Home**: Personal or home-related items
- ⭐ **Star**: Important or favorite items
- 🔖 **Bookmark**: Reference or bookmark collections

## Technical Details

### File Structure
```
zyph-extension/
├── manifest.json               # Extension configuration
├── background/
│   └── background.js          # Service worker with context menu handling
├── content/
│   └── content.js             # Content script for page content extraction
├── sidepanel/
│   ├── sidepanel.html         # Main side panel interface
│   ├── sidepanel.css          # Styling for side panel
│   ├── sidepanel-init.js      # Initialization script
│   └── modules/               # Modular architecture
│       ├── FolderManager.js   # Folder storage and management
│       ├── PromptManager.js   # System prompt handling
│       ├── ContextGenerator.js # AI context generation
│       ├── UIManager.js       # UI management and events
│       └── SidePanelApp.js    # Main application coordinator
├── popup/
│   ├── popup.html             # Extension popup interface
│   ├── popup.css              # Popup styling
│   └── popup.js               # Popup functionality
├── prompts/
│   └── system-prompt.txt      # AI system prompt template
├── icons/
│   ├── create-icons.html      # Icon generator utility
│   ├── icon16.png             # 16x16 extension icon
│   ├── icon48.png             # 48x48 extension icon
│   └── icon128.png            # 128x128 extension icon
└── README.md                  # This documentation
```

### Data Storage
- Uses Chrome's `chrome.storage.local` API for local folders and content
- Optional Zyph.com sync enqueues captures for remote ingestion when an API key is provided
- All secrets stay on-device; Zyph and OpenAI keys are saved only in browser storage
- Data persists across browser sessions and retries remote sync if it was previously queued
- Exported context prompts can be used with any AI tool

### Permissions
- `storage`: For saving folder and content data locally
- `sidePanel`: For the side panel interface
- `contextMenus`: For right-click save functionality
- `activeTab`: For content extraction from web pages
- `notifications`: For save confirmation messages
- `alarms`: For background scheduling of Zyph.com sync retries
- `host_permissions`: Access to `https://euabvloqnbuxffrwmljk.supabase.co/functions/v1/*` (Zyph API)

### AI Integration
- Uses OpenAI GPT-4o-mini model for context generation
- Requires user-provided API key (stored locally)
- Generates comprehensive knowledge base summaries
- Supports custom system prompts for different use cases
- Operates independently from Zyph.com sync (you can enable either or both features)

## Development

To modify or extend the extension:

1. Make changes to the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh button on the Zyph extension card
4. Test your changes

### Generating Icons
Open `icons/create-icons.html` in a browser and click the download buttons to generate new icon files if needed.

---

*Zyph transforms scattered web browsing into organized knowledge building, making it an essential tool for anyone who researches, learns, or manages information online.*

## License

This project is open source and available under the MIT License.
