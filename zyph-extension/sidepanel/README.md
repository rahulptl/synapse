# Zyph Extension - Modular Architecture

The sidepanel has been refactored from a large monolithic file into a clean modular structure for better maintainability and organization.

## File Structure

```
sidepanel/
- modules/
  - FolderManager.js      # Folder operations & data management
  - ContextGenerator.js   # AI context generation & OpenAI API
  - PromptManager.js      # System prompt loading & management
  - UIManager.js          # DOM manipulation & event handling
  - SidePanelApp.js       # Main coordinator & initialization
- sidepanel.html            # Updated to import modular structure
- sidepanel.css             # Unchanged UI styles
```

## Module Responsibilities

### FolderManager.js
- **Purpose**: Core folder data operations
- **Responsibilities**:
  - CRUD operations (create, read, update, delete folders)
  - Folder hierarchy management
  - Chrome storage integration
  - Context state management
- **Key Methods**: `loadFolders()`, `createFolder()`, `deleteFolder()`, `loadFolderContent()`

### ContextGenerator.js  
- **Purpose**: AI-powered context generation
- **Responsibilities**:
  - OpenAI API integration
  - Context prompt generation
  - Knowledge base formatting
  - Content analysis and summarization
- **Key Methods**: `generateFolderContext()`, `callOpenAIAPI()`, `createFormattedPrompt()`

### PromptManager.js
- **Purpose**: System prompt management
- **Responsibilities**:
  - Loading prompts from external files
  - Template variable substitution
  - Prompt caching and validation
  - Fallback prompt handling
- **Key Methods**: `loadSystemPrompt()`, `validatePrompt()`, `reloadPrompt()`

### UIManager.js
- **Purpose**: User interface and interactions
- **Responsibilities**:
  - DOM manipulation and rendering
  - Event handling and user interactions
  - Modal management
  - Folder content display
- **Key Methods**: `renderFolders()`, `displayFolderContent()`, `showContextPromptModal()`

### SidePanelApp.js
- **Purpose**: Application coordinator
- **Responsibilities**:
  - Module initialization and coordination
  - Dependency injection
  - Error handling and recovery
  - Health checks and debugging
- **Key Methods**: `initialize()`, `healthCheck()`, `restart()`

## Key Benefits

### **Maintainability**
- Each module has a single responsibility
- Easy to locate and modify specific functionality
- Reduced code complexity

### **Testability**
- Modules can be tested independently
- Clear dependencies between components
- Easier to mock and stub dependencies

### **Scalability**
- New features can be added as separate modules
- Existing modules can be extended without affecting others
- Better code organization for team development

### **Debugging**
- Errors are isolated to specific modules
- Better logging and error tracking
- Health check system for diagnosing issues

## Usage

The modular structure is automatically loaded when the sidepanel opens:

```javascript
// Access the app instance globally (for debugging)
const app = window.zyphApp;

// Get specific managers
const folderManager = app.getFolderManager();
const contextGenerator = app.getContextGenerator();

// Health check
const health = await app.healthCheck();
console.log('App Health:', health);
```

## Migration Notes

- **No breaking changes**: All existing functionality preserved
- **Performance**: Improved due to better code organization
- **Dependencies**: Uses ES6 modules (supported in Chrome extensions)

## Development

### Adding New Features
1. Identify the appropriate module or create a new one
2. Follow the existing pattern of constructor injection
3. Update `SidePanelApp.js` if new dependencies are needed
4. Add proper error handling and logging

### Debugging
- Use `window.zyphApp.getDebugInfo()` for application state
- Check `window.zyphApp.healthCheck()` for system status
- Use browser DevTools with module support for debugging

## File Sizes (Before/After)

- **Before**: `sidepanel.js` ~1,400 lines (monolithic)
- **After**: 5 focused modules averaging ~200-400 lines each
- **Total reduction**: Better organization with same functionality
