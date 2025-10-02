# Zyph Extension Troubleshooting

## Issue: Can't save selected text to folders

### Step-by-Step Debugging:

#### 1. **Reload the Extension** (Most Important!)
After the modular refactoring, the extension needs to be reloaded:
- Go to `chrome://extensions/`
- Find "Zyph Folder Manager"
- Click the reload button (🔄)
- Try again

#### 2. **Check if Folders Exist**
- Click the extension icon or open the side panel
- Verify you have folders created
- If no folders, create one first

#### 3. **Test Context Menu**
- Right-click on any webpage
- Look for "Save to Zyph" in the context menu
- Check if your folders appear in the submenu

#### 4. **Check Browser Console**
Open DevTools Console and look for:
- `[Background]` messages when right-clicking
- `[OpenAI API]` messages when generating context
- Any error messages

#### 5. **Test Selected Text**
- Select some text on a webpage
- Right-click on the selection
- Choose "Save to Zyph" → Your Folder
- Check console for `[Background] Saving content...` messages

#### 6. **Check Extension Storage**
In the console, run:
```javascript
chrome.storage.local.get(['zyphRemoteFolders', 'zyphContent'], (result) => {
    console.log('Remote folders:', result.zyphRemoteFolders?.folders);
    console.log('Content:', result.zyphContent);
});
```

#### 7. **Verify Content Script**
On any webpage, check console:
```javascript
console.log('Content script loaded:', !!window.zyphContentCapture);
console.log('Current selection:', window.getSelection().toString());
```

### Common Issues & Solutions:

#### ❌ **"No folders available" in context menu**
- **Solution**: Create folders in the side panel first
- Check that folders are being saved to Chrome storage

#### ❌ **Context menu not appearing**
- **Solution**: Reload the extension completely
- Check if extension permissions are granted

#### ❌ **Content not saving**
- **Solution**: Check browser console for error messages
- Verify the background script is running

#### ❌ **"Content script not available" errors**
- **Solution**: Some pages (chrome://, extension pages) don't allow content scripts
- This is normal for Chrome internal pages

### Debug Logs to Look For:

✅ **Good logs:**
```
[Background] Creating context menus...
[Background] Found 2 folders: [{id: "123", name: "My Folder"}]
[Background] Saving content to folder 123
[Background] Content saved successfully to My Folder
```

❌ **Problem logs:**
```
[Background] Folder 123 not found
Error saving content: ...
Could not send context menu update message
```

### Manual Test Steps:

1. **Create a test folder** in the side panel
2. **Go to any news website** (e.g., BBC, CNN)
3. **Select a paragraph of text**
4. **Right-click** → "Save to Zyph" → Your folder
5. **Check the side panel** - content should appear
6. **Look at console** for success/error messages

## Issue: Zyph.com Sync Stuck on "Syncing…"

1. **Verify your API key**
   - Open settings and press *Validate Connection*
   - If validation fails, the status message will include the error from Zyph.com

2. **Check the remote queue**
   - In DevTools console, run:
     ```javascript
     chrome.storage.local.get('zyphRemoteSyncQueue', data => console.log(data.zyphRemoteSyncQueue));
     ```
   - Each task includes `attempts`, `lastError`, and `nextAttemptAt` timestamps

3. **Look for background errors**
   - `[ContentSaver] Zyph remote query failed` messages indicate API issues
   - `[ContentSaver] Remote payload could not be built` usually means the item had no textual content

4. **Common resolutions**
   - Revalidate the API key if the error code is `NO_AUTH`
   - Ensure the local folder is still linked to an existing Zyph.com folder
   - Leave Chrome open for a few minutes so the retry backoff alarm can fire

5. **Force a retry**
   - After fixing the underlying issue, open DevTools and run:
     ```javascript
     chrome.runtime.sendMessage({ action: 'processRemoteQueue' });
     ```
   - The queue will process immediately instead of waiting for the scheduled alarm

### If Still Not Working:

1. **Clear extension data**: Remove and reinstall the extension
2. **Check permissions**: Ensure extension has access to all sites
3. **Try different websites**: Some sites block extensions
4. **Check Chrome version**: Ensure you're on a recent version

### Getting More Help:

If the issue persists, share:
- Browser console logs (especially `[Background]` messages)
- Steps you followed
- What happens vs. what you expected
- Chrome version and OS

---

**Note**: After the modular refactoring, the extension MUST be reloaded for changes to take effect!
