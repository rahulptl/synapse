# Synapse Chrome Extension Implementation Plan

## Overview
A Chrome extension that allows users to collect, organize, and contextualize web content for LLM-friendly prompts. The extension features a collapsible side panel, folder-based organization, and AI-powered summarization.

## Core Features

### 1. Content Collection
- **Mouse Selection**: Select text/elements and add to context via right-click menu
- **Drag & Drop**: Drag content directly into the side panel
- **File Upload**: Upload files as context through the side panel
- **Context Menu Integration**: Right-click option "Add to Synapse Context"

### 2. Organization System
- **Folder Structure**: Create nested folders for different topics/projects
- **Contextual Grouping**: Organize content by persona, customer, project, etc.
- **File Management**: Rename, move, delete folders and context items

### 3. Side Panel UI
- **Collapsible Panel**: Right-side panel that can expand/collapse
- **Minimal Design**: Clean, uncluttered interface
- **Smooth Animations**: Fluid transitions and interactions
- **Responsive Layout**: Adapts to different screen sizes

### 4. AI Integration
- **Summarize Button**: Process collected context with LLM
- **LLM-Friendly Output**: Format context for optimal prompt engineering
- **Export Options**: Download context as various formats (JSON, TXT, MD)

## Technical Architecture

### Manifest V3 Structure
```
synapse-extension/
├── manifest.json (MV3)
├── background/
│   └── service-worker.js
├── content/
│   ├── side-panel.js
│   ├── content-collector.js
│   └── context-menu.js
├── sidepanel/
│   ├── panel.html
│   ├── panel.js
│   └── panel.css
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── utils/
    ├── storage.js
    ├── api.js
    └── helpers.js
```

### Key Components

#### 1. Service Worker (background/service-worker.js)
- Handle context menu creation
- Manage storage operations
- Coordinate between content scripts and side panel
- Handle API calls to LLM services

#### 2. Content Scripts (content/)
- **side-panel.js**: Inject and manage the side panel UI
- **content-collector.js**: Handle content selection and drag/drop
- **context-menu.js**: Process right-click menu interactions

#### 3. Side Panel (sidepanel/)
- **panel.html**: Side panel interface structure
- **panel.js**: Folder management, content display, summarization
- **panel.css**: Styling for minimal, smooth UI

#### 4. Storage System (utils/storage.js)
- Chrome storage API integration
- Folder structure management
- Context item persistence
- Export/import functionality

### Implementation Phases

#### Phase 1: Core Extension Setup
1. **Manifest Configuration**
   - Set up Manifest V3 with required permissions
   - Configure content scripts and service worker
   - Define host permissions for web access

2. **Basic Side Panel**
   - Create collapsible side panel UI
   - Implement smooth expand/collapse animations
   - Basic folder creation and management

3. **Content Collection**
   - Text selection and right-click integration
   - Basic drag and drop functionality
   - Store selected content in Chrome storage

#### Phase 2: Advanced Features
1. **Enhanced Organization**
   - Nested folder support
   - Folder rename/delete operations
   - Content item management (edit, delete, move)

2. **File Upload Support**
   - File picker integration
   - Support for common file types (TXT, PDF, DOC)
   - File content extraction and storage

3. **UI Polish**
   - Implement smooth animations
   - Add visual feedback for user actions
   - Optimize for different screen sizes

#### Phase 3: AI Integration
1. **LLM API Integration**
   - Connect to OpenAI/Anthropic APIs
   - Implement summarization functionality
   - Context formatting for optimal prompts

2. **Export System**
   - Multiple export formats (JSON, TXT, MD)
   - Download functionality
   - Sharing capabilities

3. **Advanced Features**
   - Search within collected context
   - Tagging system
   - Context templates

## UI/UX Design Principles

### Side Panel Design
- **Width**: 350-400px when expanded, 40px when collapsed
- **Position**: Fixed right side of viewport
- **Toggle**: Smooth slide animation (300ms)
- **Z-index**: High enough to overlay all content

### Visual Hierarchy
- **Folders**: Tree-like structure with expand/collapse
- **Content Items**: Card-based layout with preview
- **Actions**: Contextual buttons (edit, delete, move)
- **Search**: Prominent search bar at top

### Color Scheme
- **Primary**: Clean blues/grays for professional look
- **Accent**: Subtle green for positive actions
- **Background**: Light gray/white for readability
- **Text**: High contrast for accessibility

### Interaction Patterns
- **Hover States**: Subtle highlighting for interactive elements
- **Loading States**: Spinner/skeleton screens for API calls
- **Error States**: Clear error messages with recovery options
- **Success States**: Toast notifications for completed actions

## Storage Schema

### Folder Structure
```json
{
  "folders": {
    "id1": {
      "name": "Sales Prospects",
      "parentId": null,
      "children": ["id2", "id3"],
      "created": "timestamp"
    }
  },
  "contexts": {
    "ctx1": {
      "content": "Selected text content",
      "url": "source URL",
      "folderId": "id1",
      "type": "text|file|image",
      "created": "timestamp"
    }
  }
}
```

### Settings
```json
{
  "settings": {
    "panelWidth": 350,
    "autoCollapse": true,
    "apiKey": "encrypted_key",
    "defaultModel": "gpt-4"
  }
}
```

## Browser Permissions

### Required Permissions
- `activeTab`: Access current tab content
- `contextMenus`: Right-click menu integration
- `storage`: Data persistence
- `sidePanel`: Side panel API (Chrome 114+)
- `scripting`: Content script injection

### Host Permissions
- `https://*/*`: Access all HTTPS sites
- `http://*/*`: Access all HTTP sites (if needed)

## Performance Considerations

### Memory Management
- Implement content cleanup for large collections
- Use efficient storage patterns
- Lazy load folder contents

### Network Optimization
- Cache API responses
- Implement request debouncing
- Use compression for large context exports

### UI Performance
- Virtual scrolling for large lists
- Efficient DOM updates
- CSS animations over JavaScript

## Security & Privacy

### Data Protection
- Local storage only (no external servers by default)
- Encrypted API key storage
- User consent for data collection

### Content Security
- Sanitize user input
- Validate file uploads
- Prevent XSS attacks

## Future Enhancements

### Advanced AI Features
- Multiple LLM provider support
- Custom prompt templates
- Conversation history

### Collaboration
- Shared context folders
- Team workspaces
- Export sharing

### Integration
- Popular productivity tools
- Note-taking apps
- CRM systems

This implementation plan provides a comprehensive roadmap for building the Synapse Chrome extension with Chrome-first optimization and modern web extension best practices.