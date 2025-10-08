# User Experience Issues - Detailed Implementation Plan

**Created:** October 8, 2025
**Status:** Ready for Implementation
**Priority:** High - Core UX Issues

---

## Executive Summary

This document provides a comprehensive implementation plan for 8 critical user experience issues affecting the Synapse knowledge base application:

1. **Add Chat Response to Context** - Save AI responses to knowledge base with a button
2. **Download Folder as Zip** - Export entire folder contents
3. **Download Individual Files as Zip** - Export single files
4. **Initiate Chat from Knowledge Base** - Quick-start chat from file/folder selection
5. **Real-time UI Updates** - Files/folders not showing immediately after upload
6. **Folder Interaction Issues** - Folder clicks not working until refresh
7. **Processing Status Stuck** - Status shows "queued" even after completion
8. **Multi-file Upload Naming Bug** - Second/third files get first file's name appended

---

## Table of Contents

1. [Issue 1: Add Chat Response to Context](#issue-1-add-chat-response-to-context)
2. [Issue 2: Download Folder as Zip](#issue-2-download-folder-as-zip)
3. [Issue 3: Download Individual Files as Zip](#issue-3-download-individual-files-as-zip)
4. [Issue 4: Initiate Chat from Knowledge Base](#issue-4-initiate-chat-from-knowledge-base)
5. [Issue 5: Real-time UI Updates](#issue-5-real-time-ui-updates)
6. [Issue 6: Folder Interaction Issues](#issue-6-folder-interaction-issues)
7. [Issue 7: Processing Status Stuck](#issue-7-processing-status-stuck)
8. [Issue 8: Multi-file Upload Naming Bug](#issue-8-multi-file-upload-naming-bug)
9. [Implementation Priority & Timeline](#implementation-priority--timeline)

---

## Issue 1: Add Chat Response to Context

### Problem Statement

Users want to save helpful AI chat responses back to their knowledge base for future reference. Currently, there's no easy way to add a chat response to the context window/knowledge base.

### UX Design Analysis

**Options for Button Placement:**

1. **After each AI response** (Recommended ✅)
   - **Pros:** Contextual, immediate action, clear association
   - **Cons:** May clutter chat if many responses
   - **Design:** Small icon button next to response

2. **In message hover menu**
   - **Pros:** Cleaner default view
   - **Cons:** Less discoverable, requires hover
   - **Design:** Hover reveals action menu

3. **At message footer**
   - **Pros:** Grouped with other actions (copy, regenerate)
   - **Cons:** May be overlooked
   - **Design:** Action bar below response

**Recommended Design:** Combination approach
- Small "Add to Knowledge Base" icon button in message footer
- Appears on hover (desktop) or always visible (mobile)
- Icon: Bookmark or "+" with folder icon

### Implementation Plan

#### Phase 1: Backend API (2-3 hours)

**Task 1.1: Create "Add Response to Knowledge Base" Endpoint**

File: `backend/app/api/v1/endpoints/chat.py`

```python
class AddResponseToKnowledgeBaseRequest(BaseModel):
    """Request to save a chat response to knowledge base."""
    conversation_id: UUID
    message_id: UUID
    folder_id: UUID
    title: Optional[str] = None  # Auto-generate if not provided
    add_context: bool = True  # Include user query for context

@router.post("/messages/{message_id}/save-to-knowledge-base")
async def save_message_to_knowledge_base(
    message_id: UUID,
    request: AddResponseToKnowledgeBaseRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Save a chat response to the knowledge base.

    Creates a new knowledge item from the message content.
    Optionally includes the user query for better context.
    """
    user_id = UUID(auth_data["user_id"])

    # Get the message
    message = await chat_service.get_message(db, message_id, user_id)
    if not message or message.role != 'assistant':
        raise HTTPException(status_code=400, detail="Invalid message")

    # Get conversation for context
    conversation = await chat_service.get_conversation(
        db, request.conversation_id, user_id
    )

    # Build content
    content_parts = []

    if request.add_context:
        # Get the preceding user message for context
        previous_message = await chat_service.get_previous_user_message(
            db, message_id
        )
        if previous_message:
            content_parts.append(f"**Query:** {previous_message.content}\n")

    content_parts.append(f"**Response:**\n{message.content}")

    # Generate title if not provided
    title = request.title
    if not title:
        # Use first line or truncated content
        first_line = message.content.split('\n')[0][:100]
        title = f"Chat Response: {first_line}"

    # Create knowledge item
    from app.services.content_service import content_service

    knowledge_item_data = KnowledgeItemCreate(
        folder_id=request.folder_id,
        title=title,
        content='\n\n'.join(content_parts),
        content_type=ContentType.TEXT,
        source_url=None,
        item_metadata={
            "source": "chat_response",
            "conversation_id": str(request.conversation_id),
            "message_id": str(message_id),
            "conversation_title": conversation.title,
            "saved_at": datetime.now(timezone.utc).isoformat()
        }
    )

    knowledge_item = await content_service.create_knowledge_item(
        db=db,
        user_id=user_id,
        item_data=knowledge_item_data
    )

    # Queue for processing
    from app.api.v1.endpoints.files import process_knowledge_item_background
    background_tasks.add_task(process_knowledge_item_background, knowledge_item.id)

    return {
        "success": True,
        "knowledge_item_id": knowledge_item.id,
        "title": knowledge_item.title,
        "message": "Response added to knowledge base"
    }
```

**Task 1.2: Add Helper Method in Chat Service**

File: `backend/app/services/chat_service.py`

```python
async def get_message(
    self,
    db: AsyncSession,
    message_id: UUID,
    user_id: UUID
) -> Optional[Message]:
    """Get a specific message by ID."""
    from app.models.database import Message as DBMessage

    result = await db.execute(
        select(DBMessage)
        .join(Conversation)
        .where(
            DBMessage.id == message_id,
            Conversation.user_id == user_id
        )
    )
    return result.scalar_one_or_none()

async def get_previous_user_message(
    self,
    db: AsyncSession,
    message_id: UUID
) -> Optional[Message]:
    """Get the user message that preceded this assistant message."""
    from app.models.database import Message as DBMessage

    # Get the target message to find its conversation and created_at
    target = await db.execute(
        select(DBMessage).where(DBMessage.id == message_id)
    )
    target_msg = target.scalar_one_or_none()
    if not target_msg:
        return None

    # Find the most recent user message before this one
    result = await db.execute(
        select(DBMessage)
        .where(
            DBMessage.conversation_id == target_msg.conversation_id,
            DBMessage.role == 'user',
            DBMessage.created_at < target_msg.created_at
        )
        .order_by(desc(DBMessage.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()
```

#### Phase 2: Frontend UI - Extension (3-4 hours)

**Task 2.1: Add Button to Chat Interface**

File: `zyph-extension/sidepanel/modules/ContentRenderer.js`

```javascript
renderChatMessage(message, index) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${message.role}`;

    // ... existing message rendering ...

    // Add action buttons for assistant messages
    if (message.role === 'assistant') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        // Add to Knowledge Base button
        const saveBtn = document.createElement('button');
        saveBtn.className = 'action-btn save-to-kb-btn';
        saveBtn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
            </svg>
            <span>Save to Knowledge Base</span>
        `;
        saveBtn.title = 'Add this response to your knowledge base';
        saveBtn.onclick = () => this.handleSaveToKnowledgeBase(message, index);

        actionsDiv.appendChild(saveBtn);
        messageDiv.appendChild(actionsDiv);
    }

    return messageDiv;
}

async handleSaveToKnowledgeBase(message, messageIndex) {
    try {
        // Show folder selection modal
        const folderSelector = new FolderSelectorModal(
            this.folderManager,
            async (selectedFolderId) => {
                // Show title input modal
                const title = await this.promptForTitle(message.content);

                // Call API to save
                const response = await ZyphAPI.saveMessageToKnowledgeBase({
                    conversation_id: this.currentConversationId,
                    message_id: message.id,
                    folder_id: selectedFolderId,
                    title: title,
                    add_context: true
                });

                if (response.success) {
                    this.showNotification(
                        'Success!',
                        'Response added to knowledge base',
                        'success'
                    );

                    // Update UI to show it's been saved
                    this.markMessageAsSaved(messageIndex);
                } else {
                    throw new Error(response.message || 'Failed to save');
                }
            }
        );

        folderSelector.show();
    } catch (error) {
        console.error('Failed to save to knowledge base:', error);
        this.showNotification(
            'Error',
            'Failed to save response to knowledge base',
            'error'
        );
    }
}

async promptForTitle(messageContent) {
    // Auto-generate title from first line
    const firstLine = messageContent.split('\n')[0];
    const suggestedTitle = firstLine.length > 100
        ? firstLine.substring(0, 100) + '...'
        : firstLine;

    return new Promise((resolve) => {
        const modal = new PromptModal({
            title: 'Save to Knowledge Base',
            message: 'Enter a title for this response:',
            defaultValue: `Chat: ${suggestedTitle}`,
            placeholder: 'Response title...',
            onConfirm: (title) => resolve(title),
            onCancel: () => resolve(null)
        });
        modal.show();
    });
}

markMessageAsSaved(messageIndex) {
    // Add visual indicator that message has been saved
    const messageEl = document.querySelector(
        `.chat-message:nth-child(${messageIndex + 1})`
    );
    if (messageEl) {
        const saveBtn = messageEl.querySelector('.save-to-kb-btn');
        if (saveBtn) {
            saveBtn.classList.add('saved');
            saveBtn.innerHTML = `
                <svg class="icon" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <span>Saved</span>
            `;
            saveBtn.disabled = true;
        }
    }
}
```

**Task 2.2: Create Folder Selector Modal**

File: `zyph-extension/sidepanel/components/FolderSelectorModal.js` (new)

```javascript
window.Zyph = window.Zyph || {};

window.Zyph.FolderSelectorModal = class FolderSelectorModal {
    constructor(folderManager, onSelect) {
        this.folderManager = folderManager;
        this.onSelect = onSelect;
        this.selectedFolderId = null;
    }

    async show() {
        const modal = document.createElement('div');
        modal.className = 'modal folder-selector-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Select Folder</h3>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Choose where to save this response:</p>
                    <div class="folder-list">
                        <!-- Folders will be rendered here -->
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary cancel-btn">Cancel</button>
                    <button class="btn btn-primary select-btn" disabled>
                        Add to Folder
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Render folders
        await this.renderFolders(modal);

        // Bind events
        this.bindEvents(modal);

        // Show modal
        setTimeout(() => modal.classList.add('show'), 10);
    }

    async renderFolders(modal) {
        const folderList = modal.querySelector('.folder-list');
        const folders = await this.folderManager.loadFolders();

        folders.forEach(folder => {
            const folderItem = document.createElement('div');
            folderItem.className = 'folder-item';
            folderItem.dataset.folderId = folder.id;
            folderItem.innerHTML = `
                <span class="folder-icon">${this.getFolderIcon(folder)}</span>
                <span class="folder-name">${folder.name}</span>
            `;

            folderItem.onclick = () => this.selectFolder(modal, folder.id);
            folderList.appendChild(folderItem);
        });
    }

    selectFolder(modal, folderId) {
        // Update selection
        modal.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('selected');
        });

        const selectedItem = modal.querySelector(
            `.folder-item[data-folder-id="${folderId}"]`
        );
        if (selectedItem) {
            selectedItem.classList.add('selected');
            this.selectedFolderId = folderId;

            // Enable select button
            modal.querySelector('.select-btn').disabled = false;
        }
    }

    bindEvents(modal) {
        const closeBtn = modal.querySelector('.close-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');
        const selectBtn = modal.querySelector('.select-btn');

        const close = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };

        closeBtn.onclick = close;
        cancelBtn.onclick = close;

        selectBtn.onclick = async () => {
            if (this.selectedFolderId) {
                close();
                await this.onSelect(this.selectedFolderId);
            }
        };
    }

    getFolderIcon(folder) {
        // Return appropriate icon based on folder metadata
        return folder.icon || '📁';
    }
};
```

**Task 2.3: Add API Method**

File: `zyph-extension/common/zyph-api.js`

```javascript
async saveMessageToKnowledgeBase(data) {
    const endpoint = `/v1/chat/messages/${data.message_id}/save-to-knowledge-base`;

    try {
        const response = await this.fetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({
                conversation_id: data.conversation_id,
                folder_id: data.folder_id,
                title: data.title,
                add_context: data.add_context !== false
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to save message: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error saving message to knowledge base:', error);
        throw error;
    }
}
```

**Task 2.4: Add Styling**

File: `zyph-extension/sidepanel/sidepanel.css`

```css
/* Message Actions */
.message-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color);
    opacity: 0;
    transition: opacity 0.2s;
}

.chat-message:hover .message-actions {
    opacity: 1;
}

.action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 13px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--primary-color);
}

.action-btn .icon {
    width: 16px;
    height: 16px;
    fill: currentColor;
}

.action-btn.saved {
    background: var(--success-bg);
    color: var(--success-color);
    border-color: var(--success-color);
    cursor: default;
}

.action-btn.saved:hover {
    background: var(--success-bg);
    border-color: var(--success-color);
}

/* Folder Selector Modal */
.folder-selector-modal .folder-list {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    margin-top: 12px;
}

.folder-selector-modal .folder-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    cursor: pointer;
    transition: background 0.2s;
    border-bottom: 1px solid var(--border-color);
}

.folder-selector-modal .folder-item:last-child {
    border-bottom: none;
}

.folder-selector-modal .folder-item:hover {
    background: var(--bg-hover);
}

.folder-selector-modal .folder-item.selected {
    background: var(--primary-bg);
    color: var(--primary-color);
}

.folder-selector-modal .folder-icon {
    font-size: 18px;
}

.folder-selector-modal .folder-name {
    flex: 1;
    font-size: 14px;
}
```

#### Phase 3: Testing & Refinement (2 hours)

**Task 3.1: Test Save Functionality**
- Send chat message and get AI response
- Click "Save to Knowledge Base"
- Select folder
- Verify item appears in knowledge base
- Verify it includes both query and response

**Task 3.2: Test Edge Cases**
- Very long responses (>100KB)
- Responses with code blocks
- Responses with special characters
- Multiple saves of same response

**Task 3.3: UX Polish**
- Add loading state during save
- Add success animation
- Prevent duplicate saves
- Show folder name in success message

### Deliverables

1. ✅ Backend API endpoint for saving messages
2. ✅ Frontend button on assistant messages
3. ✅ Folder selection modal
4. ✅ Title customization
5. ✅ Context inclusion (query + response)
6. ✅ Visual feedback (saved state)

### Success Metrics

- Users can save any AI response with 2 clicks
- Saved items include original context
- 100% save success rate
- < 500ms save operation (excluding processing)

---

## Issue 2: Download Folder as Zip

### Problem Statement

Users want to download entire folders from their knowledge base as zip files for backup, sharing, or offline access.

### Technical Design

**Approach:**
1. Backend generates zip file on-demand
2. Streams zip to client (for large folders)
3. Includes all knowledge items in folder
4. Preserves folder structure if nested
5. Includes metadata file (JSON manifest)

### Implementation Plan

#### Phase 1: Backend Zip Generation (3-4 hours)

**Task 1.1: Install Dependencies**

File: `backend/requirements.txt`

```txt
# Add if not present
zipfile36==0.1.3  # Better zip support
aiofiles==23.2.1  # Async file operations
```

**Task 1.2: Create Zip Generation Service**

File: `backend/app/services/export_service.py` (new)

```python
"""
Export service for downloading knowledge base content.
"""
import zipfile
import io
import json
import logging
from typing import List, BinaryIO
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.database import KnowledgeItem, Folder
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)


class ExportService:
    """Service for exporting knowledge base content."""

    async def export_folder_as_zip(
        self,
        db: AsyncSession,
        folder_id: UUID,
        user_id: UUID,
        include_subfolders: bool = True
    ) -> io.BytesIO:
        """
        Export a folder and its contents as a zip file.

        Args:
            db: Database session
            folder_id: Folder to export
            user_id: User ID for access control
            include_subfolders: Whether to include nested folders

        Returns:
            BytesIO buffer containing zip file
        """
        # Get folder
        folder_result = await db.execute(
            select(Folder).where(
                Folder.id == folder_id,
                Folder.user_id == user_id
            )
        )
        folder = folder_result.scalar_one_or_none()
        if not folder:
            raise ValueError("Folder not found")

        # Create zip in memory
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add folder manifest
            manifest = await self._create_folder_manifest(db, folder, user_id)
            zip_file.writestr(
                'manifest.json',
                json.dumps(manifest, indent=2, default=str)
            )

            # Add knowledge items
            items = await self._get_folder_items(db, folder_id, user_id)

            for item in items:
                await self._add_item_to_zip(zip_file, item, folder.name)

            # Add subfolder items if requested
            if include_subfolders:
                subfolders = await self._get_subfolders(db, folder_id, user_id)
                for subfolder in subfolders:
                    subfolder_items = await self._get_folder_items(
                        db, subfolder.id, user_id
                    )
                    for item in subfolder_items:
                        await self._add_item_to_zip(
                            zip_file,
                            item,
                            f"{folder.name}/{subfolder.name}"
                        )

        zip_buffer.seek(0)
        return zip_buffer

    async def export_item_as_zip(
        self,
        db: AsyncSession,
        item_id: UUID,
        user_id: UUID
    ) -> io.BytesIO:
        """
        Export a single knowledge item as a zip file.

        Includes the item content and metadata.
        """
        # Get item
        item_result = await db.execute(
            select(KnowledgeItem).where(
                KnowledgeItem.id == item_id,
                KnowledgeItem.user_id == user_id
            )
        )
        item = item_result.scalar_one_or_none()
        if not item:
            raise ValueError("Knowledge item not found")

        # Create zip in memory
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Add item manifest
            manifest = self._create_item_manifest(item)
            zip_file.writestr(
                'manifest.json',
                json.dumps(manifest, indent=2, default=str)
            )

            # Add item content
            await self._add_item_to_zip(zip_file, item, '')

        zip_buffer.seek(0)
        return zip_buffer

    async def _create_folder_manifest(
        self,
        db: AsyncSession,
        folder: Folder,
        user_id: UUID
    ) -> dict:
        """Create manifest with folder metadata."""
        items_count = await self._count_folder_items(db, folder.id, user_id)

        return {
            "export_type": "folder",
            "folder_id": str(folder.id),
            "folder_name": folder.name,
            "folder_description": folder.description,
            "item_count": items_count,
            "exported_at": datetime.utcnow().isoformat(),
            "format_version": "1.0"
        }

    def _create_item_manifest(self, item: KnowledgeItem) -> dict:
        """Create manifest for single item."""
        return {
            "export_type": "item",
            "item_id": str(item.id),
            "title": item.title,
            "content_type": item.content_type,
            "source_url": item.source_url,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "exported_at": datetime.utcnow().isoformat(),
            "format_version": "1.0"
        }

    async def _add_item_to_zip(
        self,
        zip_file: zipfile.ZipFile,
        item: KnowledgeItem,
        folder_path: str
    ) -> None:
        """Add a knowledge item to the zip file."""
        # Sanitize filename
        safe_title = self._sanitize_filename(item.title)

        # Determine file extension
        extension = self._get_file_extension(item.content_type)

        # Build file path
        if folder_path:
            file_path = f"{folder_path}/{safe_title}{extension}"
        else:
            file_path = f"{safe_title}{extension}"

        # Get content
        content = await self._get_item_content(item)

        # Add to zip
        zip_file.writestr(file_path, content)

        # Add metadata as separate JSON file
        metadata_path = file_path.replace(extension, '.metadata.json')
        metadata = {
            "id": str(item.id),
            "title": item.title,
            "content_type": item.content_type,
            "source_url": item.source_url,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            "processing_status": item.processing_status,
            "total_chunks": item.total_chunks,
            "item_metadata": item.item_metadata
        }
        zip_file.writestr(
            metadata_path,
            json.dumps(metadata, indent=2, default=str)
        )

    async def _get_item_content(self, item: KnowledgeItem) -> bytes:
        """Get item content, from DB or storage."""
        if item.content:
            # Content in database
            return item.content.encode('utf-8')
        elif item.storage_path:
            # Content in GCS
            content = await storage_service.download_file(item.storage_path)
            return content
        else:
            return b"[No content available]"

    async def _get_folder_items(
        self,
        db: AsyncSession,
        folder_id: UUID,
        user_id: UUID
    ) -> List[KnowledgeItem]:
        """Get all items in a folder."""
        result = await db.execute(
            select(KnowledgeItem)
            .where(
                KnowledgeItem.folder_id == folder_id,
                KnowledgeItem.user_id == user_id
            )
            .order_by(KnowledgeItem.title)
        )
        return result.scalars().all()

    async def _count_folder_items(
        self,
        db: AsyncSession,
        folder_id: UUID,
        user_id: UUID
    ) -> int:
        """Count items in folder."""
        from sqlalchemy import func
        result = await db.execute(
            select(func.count(KnowledgeItem.id))
            .where(
                KnowledgeItem.folder_id == folder_id,
                KnowledgeItem.user_id == user_id
            )
        )
        return result.scalar()

    async def _get_subfolders(
        self,
        db: AsyncSession,
        parent_id: UUID,
        user_id: UUID
    ) -> List[Folder]:
        """Get subfolders of a folder."""
        result = await db.execute(
            select(Folder)
            .where(
                Folder.parent_id == parent_id,
                Folder.user_id == user_id
            )
            .order_by(Folder.name)
        )
        return result.scalars().all()

    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for zip archive."""
        # Remove/replace invalid characters
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            filename = filename.replace(char, '_')

        # Limit length
        if len(filename) > 200:
            filename = filename[:200]

        return filename

    def _get_file_extension(self, content_type: str) -> str:
        """Get file extension based on content type."""
        extensions = {
            'text': '.txt',
            'code': '.txt',
            'pdf': '.pdf',
            'markdown': '.md',
            'html': '.html',
            'webpage': '.html',
            'image': '.jpg',
            'document': '.txt'
        }
        return extensions.get(content_type, '.txt')


# Global instance
export_service = ExportService()
```

**Task 1.3: Create API Endpoints**

File: `backend/app/api/v1/endpoints/folders.py`

```python
from fastapi.responses import StreamingResponse
from app.services.export_service import export_service

@router.get("/{folder_id}/export")
async def export_folder(
    folder_id: UUID,
    include_subfolders: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Export folder contents as a zip file.

    Downloads all knowledge items in the folder as a zip archive.
    Optionally includes subfolders.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # Get folder name for filename
        folder_result = await db.execute(
            select(Folder).where(
                Folder.id == folder_id,
                Folder.user_id == user_id
            )
        )
        folder = folder_result.scalar_one_or_none()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")

        # Generate zip
        zip_buffer = await export_service.export_folder_as_zip(
            db=db,
            folder_id=folder_id,
            user_id=user_id,
            include_subfolders=include_subfolders
        )

        # Sanitize folder name for filename
        safe_name = export_service._sanitize_filename(folder.name)
        filename = f"{safe_name}.zip"

        # Return as streaming response
        return StreamingResponse(
            iter([zip_buffer.getvalue()]),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to export folder {folder_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to export folder")
```

**Task 1.4: Add Individual Item Export Endpoint**

File: `backend/app/api/v1/endpoints/content.py`

```python
from fastapi.responses import StreamingResponse
from app.services.export_service import export_service

@router.get("/{item_id}/export")
async def export_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Export a single knowledge item as a zip file.

    Includes item content and metadata.
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # Get item for filename
        from app.models.database import KnowledgeItem
        item_result = await db.execute(
            select(KnowledgeItem).where(
                KnowledgeItem.id == item_id,
                KnowledgeItem.user_id == user_id
            )
        )
        item = item_result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")

        # Generate zip
        zip_buffer = await export_service.export_item_as_zip(
            db=db,
            item_id=item_id,
            user_id=user_id
        )

        # Sanitize item title for filename
        safe_title = export_service._sanitize_filename(item.title)
        filename = f"{safe_title}.zip"

        # Return as streaming response
        return StreamingResponse(
            iter([zip_buffer.getvalue()]),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to export item {item_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to export item")
```

#### Phase 2: Frontend UI (2-3 hours)

**Task 2.1: Add Download Buttons**

File: `zyph-extension/sidepanel/modules/FolderRenderer.js`

```javascript
renderFolderActions(folder) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'folder-actions';

    // Existing actions...

    // Download folder button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'action-btn download-btn';
    downloadBtn.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
        <span>Download Folder</span>
    `;
    downloadBtn.title = 'Download folder as ZIP';
    downloadBtn.onclick = (e) => {
        e.stopPropagation();
        this.handleDownloadFolder(folder);
    };

    actionsDiv.appendChild(downloadBtn);
    return actionsDiv;
}

async handleDownloadFolder(folder) {
    try {
        this.showLoadingIndicator(folder.id, 'Preparing download...');

        const includeSubfolders = await this.confirmIncludeSubfolders(folder);

        const url = `${ZyphAPI.baseUrl}/v1/folders/${folder.id}/export?include_subfolders=${includeSubfolders}`;

        // Use API to download file
        await ZyphAPI.downloadFile(url, `${folder.name}.zip`);

        this.hideLoadingIndicator(folder.id);
        this.showNotification('Success', `Folder "${folder.name}" downloaded`, 'success');
    } catch (error) {
        console.error('Failed to download folder:', error);
        this.hideLoadingIndicator(folder.id);
        this.showNotification('Error', 'Failed to download folder', 'error');
    }
}

async confirmIncludeSubfolders(folder) {
    // Check if folder has subfolders
    const hasSubfolders = folder.children && folder.children.length > 0;

    if (!hasSubfolders) {
        return false;
    }

    return new Promise((resolve) => {
        const modal = new ConfirmModal({
            title: 'Download Options',
            message: 'This folder contains subfolders. Include them in the download?',
            confirmText: 'Include Subfolders',
            cancelText: 'This Folder Only',
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
        });
        modal.show();
    });
}
```

**Task 2.2: Add Download for Individual Items**

File: `zyph-extension/sidepanel/modules/ContentRenderer.js`

```javascript
renderContentItem(item) {
    // ... existing code ...

    // Add download button to item actions
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'action-btn-small';
    downloadBtn.innerHTML = `
        <svg class="icon-small" viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
    `;
    downloadBtn.title = 'Download';
    downloadBtn.onclick = () => this.handleDownloadItem(item);

    actionsContainer.appendChild(downloadBtn);
}

async handleDownloadItem(item) {
    try {
        const url = `${ZyphAPI.baseUrl}/v1/content/${item.id}/export`;
        await ZyphAPI.downloadFile(url, `${item.title}.zip`);

        this.showNotification('Success', 'Item downloaded', 'success');
    } catch (error) {
        console.error('Failed to download item:', error);
        this.showNotification('Error', 'Failed to download item', 'error');
    }
}
```

**Task 2.3: Add Download Helper in API Client**

File: `zyph-extension/common/zyph-api.js`

```javascript
async downloadFile(url, filename) {
    try {
        const response = await this.fetch(url, {
            method: 'GET',
            headers: this.getHeaders()
        });

        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }

        // Get blob
        const blob = await response.blob();

        // Create download link
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;

        // Trigger download
        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);

        return true;
    } catch (error) {
        console.error('Download error:', error);
        throw error;
    }
}
```

#### Phase 3: Testing (2 hours)

**Task 3.1: Test Folder Export**
- Small folder (< 10 items)
- Large folder (100+ items)
- Folder with subfolders
- Empty folder

**Task 3.2: Test Item Export**
- Text items
- Large files (> 1MB)
- Items with special characters

**Task 3.3: Verify Zip Contents**
- All files present
- Manifest.json accurate
- Metadata files included
- Proper folder structure

### Deliverables

1. ✅ Backend export service
2. ✅ Folder export endpoint
3. ✅ Item export endpoint
4. ✅ Frontend download buttons
5. ✅ Zip file generation with manifest
6. ✅ Subfolder inclusion option

### Success Metrics

- Can download folders with 1000+ items
- Zip generation < 10 seconds for typical folders
- 100% content preservation
- Proper filename sanitization

---

## Issue 3: Download Individual Files as Zip

**Note:** This issue is already covered in Issue 2, Task 1.4 and Phase 2, Task 2.2.

The implementation includes endpoints and UI for downloading individual knowledge items as zip files.

---

## Issue 4: Initiate Chat from Knowledge Base

### Problem Statement

Users want to quickly start a chat with a specific file or folder selected in the context. Currently, they have to:
1. Open chat
2. Find and select the folder/file with hashtag
3. Type query

**Desired UX:**
1. Click on file/folder in knowledge base
2. Chat opens with file/folder already selected (hashtag visible)
3. User types query immediately

### Implementation Plan

#### Phase 1: Backend - No Changes Needed (0 hours)

The backend already supports folder/file selection in chat via the `ChatRequest` schema.

#### Phase 2: Frontend UI (2-3 hours)

**Task 2.1: Add "Chat with this" Button**

File: `zyph-extension/sidepanel/modules/ContentRenderer.js`

```javascript
renderContentItem(item) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'content-item';

    // ... existing content rendering ...

    // Add "Chat with this" button
    const quickActionsDiv = document.createElement('div');
    quickActionsDiv.className = 'quick-actions';

    const chatBtn = document.createElement('button');
    chatBtn.className = 'quick-action-btn chat-btn';
    chatBtn.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
        <span>Chat with this</span>
    `;
    chatBtn.onclick = () => this.initiateChatWithItem(item);

    quickActionsDiv.appendChild(chatBtn);
    itemDiv.appendChild(quickActionsDiv);

    return itemDiv;
}

async initiateChatWithItem(item) {
    try {
        // Switch to chat view
        await this.switchToChatView();

        // Select this item in context
        await this.selectItemInChat(item);

        // Focus on message input
        this.focusMessageInput();

        // Optional: Show helper message
        this.showChatHelper(`Ask questions about "${item.title}"`);
    } catch (error) {
        console.error('Failed to initiate chat:', error);
        this.showNotification('Error', 'Failed to start chat', 'error');
    }
}

async switchToChatView() {
    // If chat is in a different tab/panel, switch to it
    const chatTab = document.getElementById('chat-tab');
    if (chatTab) {
        chatTab.click();
    }

    // Alternatively, if chat is in main view
    const chatView = document.getElementById('chat-view');
    if (chatView) {
        chatView.classList.add('active');
    }

    // Hide knowledge base view
    const kbView = document.getElementById('knowledge-base-view');
    if (kbView) {
        kbView.classList.remove('active');
    }
}

async selectItemInChat(item) {
    // Get the context selector component
    const contextSelector = this.getContextSelector();

    if (contextSelector) {
        // Select the folder first
        await contextSelector.selectFolder(item.folder_id);

        // Then select the specific item
        await contextSelector.selectItem(item.id);

        // Update the visible hashtag display
        this.updateHashtagDisplay([item]);
    }
}

getContextSelector() {
    // Return the context selector component
    // This depends on your chat UI structure
    return window.Zyph.chatContextSelector;
}

updateHashtagDisplay(items) {
    const hashtagContainer = document.getElementById('selected-context');
    if (!hashtagContainer) return;

    hashtagContainer.innerHTML = '';

    items.forEach(item => {
        const tag = document.createElement('span');
        tag.className = 'context-tag';
        tag.innerHTML = `
            <span class="hashtag">#</span>
            <span class="tag-name">${item.title}</span>
            <button class="remove-tag" onclick="this.removeContextTag('${item.id}')">
                ×
            </button>
        `;
        hashtagContainer.appendChild(tag);
    });
}

focusMessageInput() {
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.focus();
        messageInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

showChatHelper(message) {
    const helperDiv = document.createElement('div');
    helperDiv.className = 'chat-helper';
    helperDiv.textContent = message;

    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.insertBefore(helperDiv, chatContainer.firstChild);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            helperDiv.classList.add('fade-out');
            setTimeout(() => helperDiv.remove(), 300);
        }, 3000);
    }
}
```

**Task 2.2: Add "Chat with Folder" Button**

File: `zyph-extension/sidepanel/modules/FolderRenderer.js`

```javascript
renderFolderHeader(folder) {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'folder-header';

    // ... existing folder header ...

    // Add "Chat with folder" button
    const chatFolderBtn = document.createElement('button');
    chatFolderBtn.className = 'action-btn chat-folder-btn';
    chatFolderBtn.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>
        <span>Chat with Folder</span>
    `;
    chatFolderBtn.onclick = () => this.initiateChatWithFolder(folder);

    headerDiv.appendChild(chatFolderBtn);

    return headerDiv;
}

async initiateChatWithFolder(folder) {
    try {
        // Switch to chat view
        await this.contentRenderer.switchToChatView();

        // Select this folder in context
        await this.selectFolderInChat(folder);

        // Focus on message input
        this.contentRenderer.focusMessageInput();

        // Show helper message
        this.contentRenderer.showChatHelper(
            `Ask questions about content in "${folder.name}"`
        );
    } catch (error) {
        console.error('Failed to initiate chat with folder:', error);
        this.showNotification('Error', 'Failed to start chat', 'error');
    }
}

async selectFolderInChat(folder) {
    const contextSelector = this.contentRenderer.getContextSelector();

    if (contextSelector) {
        // Select the folder
        await contextSelector.selectFolder(folder.id);

        // Update hashtag display
        this.contentRenderer.updateHashtagDisplay([{
            id: folder.id,
            title: folder.name,
            type: 'folder'
        }]);
    }
}
```

**Task 2.3: Create Context Selector Bridge**

File: `zyph-extension/sidepanel/modules/ChatContextSelector.js` (new or update existing)

```javascript
window.Zyph = window.Zyph || {};

window.Zyph.ChatContextSelector = class ChatContextSelector {
    constructor(folderManager) {
        this.folderManager = folderManager;
        this.selectedFolders = [];
        this.selectedItems = [];
    }

    async selectFolder(folderId) {
        // Add folder to selected context
        const folder = await this.folderManager.getFolderById(folderId);
        if (!folder) return;

        // Check if already selected
        if (this.selectedFolders.find(f => f.id === folderId)) {
            return;
        }

        this.selectedFolders.push({
            id: folder.id,
            name: folder.name,
            type: 'folder'
        });

        this.updateUI();
    }

    async selectItem(itemId) {
        // Add item to selected context
        const item = await this.fetchItemDetails(itemId);
        if (!item) return;

        // Check if already selected
        if (this.selectedItems.find(i => i.id === itemId)) {
            return;
        }

        this.selectedItems.push({
            id: item.id,
            title: item.title,
            type: 'item'
        });

        this.updateUI();
    }

    removeFolder(folderId) {
        this.selectedFolders = this.selectedFolders.filter(
            f => f.id !== folderId
        );
        this.updateUI();
    }

    removeItem(itemId) {
        this.selectedItems = this.selectedItems.filter(
            i => i.id !== itemId
        );
        this.updateUI();
    }

    updateUI() {
        // Update the hashtag display
        const allSelected = [
            ...this.selectedFolders.map(f => ({ ...f, isFolder: true })),
            ...this.selectedItems.map(i => ({ ...i, isFolder: false }))
        ];

        const event = new CustomEvent('context-selection-changed', {
            detail: { selected: allSelected }
        });
        document.dispatchEvent(event);
    }

    getSelectedContext() {
        return {
            folders: this.selectedFolders.map(f => f.id),
            items: this.selectedItems.map(i => i.id)
        };
    }

    async fetchItemDetails(itemId) {
        try {
            const response = await ZyphAPI.fetch(
                `/v1/content/${itemId}`,
                { method: 'GET' }
            );
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch item details:', error);
            return null;
        }
    }
};

// Initialize global instance
window.Zyph.chatContextSelector = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize when folder manager is ready
    if (window.Zyph.folderManager) {
        window.Zyph.chatContextSelector = new window.Zyph.ChatContextSelector(
            window.Zyph.folderManager
        );
    }
});
```

**Task 2.4: Update Chat View to Show Selected Context**

File: `zyph-extension/sidepanel/chat-view.html` (or relevant template)

```html
<div id="chat-view" class="view-container">
    <!-- Selected Context Display -->
    <div id="selected-context-container" class="selected-context-container">
        <div id="selected-context" class="selected-context">
            <!-- Hashtags will appear here -->
        </div>
    </div>

    <!-- Chat Messages -->
    <div id="chat-messages" class="chat-messages">
        <!-- Messages appear here -->
    </div>

    <!-- Message Input -->
    <div class="message-input-container">
        <textarea
            id="message-input"
            placeholder="Ask a question about your selected context..."
            rows="3"
        ></textarea>
        <button id="send-message-btn" class="send-btn">
            Send
        </button>
    </div>
</div>
```

**Task 2.5: Add Styling**

File: `zyph-extension/sidepanel/sidepanel.css`

```css
/* Quick Actions */
.quick-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}

.quick-action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    font-size: 13px;
    border: 1px solid var(--primary-color);
    border-radius: 6px;
    background: var(--primary-bg);
    color: var(--primary-color);
    cursor: pointer;
    transition: all 0.2s;
}

.quick-action-btn:hover {
    background: var(--primary-color);
    color: white;
}

.quick-action-btn .icon {
    width: 14px;
    height: 14px;
    fill: currentColor;
}

/* Selected Context Display */
.selected-context-container {
    padding: 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    min-height: 50px;
}

.selected-context {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.context-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: var(--primary-bg);
    border: 1px solid var(--primary-color);
    border-radius: 16px;
    font-size: 13px;
    color: var(--primary-color);
}

.context-tag .hashtag {
    font-weight: 600;
}

.context-tag .remove-tag {
    margin-left: 4px;
    padding: 0;
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--primary-color);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
}

.context-tag .remove-tag:hover {
    color: var(--danger-color);
}

/* Chat Helper Message */
.chat-helper {
    padding: 12px;
    background: var(--info-bg);
    color: var(--info-color);
    border-radius: 6px;
    margin-bottom: 12px;
    text-align: center;
    font-size: 14px;
    animation: slideIn 0.3s ease-out;
}

.chat-helper.fade-out {
    animation: fadeOut 0.3s ease-out forwards;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes fadeOut {
    to {
        opacity: 0;
        transform: translateY(-10px);
    }
}
```

#### Phase 3: Testing (1-2 hours)

**Task 3.1: Test Item → Chat Flow**
- Click "Chat with this" on a text item
- Verify chat opens
- Verify item is selected (hashtag visible)
- Verify can type and send message immediately

**Task 3.2: Test Folder → Chat Flow**
- Click "Chat with folder"
- Verify chat opens with folder selected
- Send a query
- Verify RAG retrieves from folder context

**Task 3.3: Test Multiple Selections**
- Add multiple items via "Chat with this"
- Verify all appear as hashtags
- Verify can remove individual selections

### Deliverables

1. ✅ "Chat with this" button on items
2. ✅ "Chat with folder" button on folders
3. ✅ Context selector bridge
4. ✅ Hashtag display in chat
5. ✅ Auto-focus on message input
6. ✅ Helper messages

### Success Metrics

- One-click to chat with any item/folder
- Context pre-selected before user types
- Seamless transition between views
- Hashtag display accurately reflects selection

---

## Issue 5: Real-time UI Updates

### Problem Statement

Files and folders don't appear in the UI immediately after upload. Users must manually refresh the page to see new items. This breaks the user experience and creates confusion.

**Current Behavior:**
- User uploads file
- File appears in "queued for processing"
- User must refresh to see file in folder list

**Desired Behavior:**
- User uploads file
- File immediately appears in folder list with "processing" status
- Status updates automatically as processing completes

### Root Cause Analysis

**Frontend:**
- UI state not updated after successful upload
- No event listener for upload completion
- Cache not invalidated after new items added

**Backend:**
- Upload endpoint returns success but frontend doesn't update local state
- No WebSocket or polling for real-time updates

### Implementation Plan

#### Phase 1: Frontend State Management (2-3 hours)

**Task 1.1: Add Upload Event Handling**

File: `zyph-extension/background/content-saver.js`

```javascript
async saveContent(data) {
    try {
        const response = await ZyphAPI.createContent(data);

        if (response.success) {
            // Emit event for UI update
            this.emitContentAdded(response.item);

            return response;
        }
    } catch (error) {
        console.error('Failed to save content:', error);
        throw error;
    }
}

emitContentAdded(item) {
    // Send message to sidepanel
    chrome.runtime.sendMessage({
        type: 'CONTENT_ADDED',
        payload: item
    });
}
```

**Task 1.2: Listen for Upload Events in UI**

File: `zyph-extension/sidepanel/modules/FolderManager.js`

```javascript
constructor() {
    // ... existing code ...

    // Listen for content updates
    this.setupContentListeners();
}

setupContentListeners() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'CONTENT_ADDED') {
            this.handleContentAdded(message.payload);
        } else if (message.type === 'CONTENT_UPDATED') {
            this.handleContentUpdated(message.payload);
        } else if (message.type === 'CONTENT_DELETED') {
            this.handleContentDeleted(message.payload);
        }
    });

    // Also listen for custom events
    document.addEventListener('content-added', (e) => {
        this.handleContentAdded(e.detail);
    });
}

async handleContentAdded(item) {
    console.log('[FolderManager] Content added:', item);

    // Add to local cache
    await this.addItemToCache(item);

    // Refresh folder display if currently viewing this folder
    if (this.currentlyDisplayedFolderId === item.folder_id) {
        await this.refreshFolderDisplay(item.folder_id);
    }

    // Update folder item count
    await this.updateFolderStats(item.folder_id);

    // Show notification
    this.showNotification(
        'Item Added',
        `"${item.title}" has been added to your knowledge base`,
        'success'
    );
}

async handleContentUpdated(item) {
    console.log('[FolderManager] Content updated:', item);

    // Update cache
    await this.updateItemInCache(item);

    // Refresh display if visible
    if (this.currentlyDisplayedFolderId === item.folder_id) {
        await this.refreshFolderDisplay(item.folder_id);
    }
}

async handleContentDeleted(itemId) {
    console.log('[FolderManager] Content deleted:', itemId);

    // Remove from cache
    await this.removeItemFromCache(itemId);

    // Refresh current display
    if (this.currentlyDisplayedFolderId) {
        await this.refreshFolderDisplay(this.currentlyDisplayedFolderId);
    }
}

async addItemToCache(item) {
    try {
        // Get current cache
        const cache = await this.getContentCache();

        // Add item
        if (!cache[item.folder_id]) {
            cache[item.folder_id] = [];
        }

        // Check if item already exists
        const existingIndex = cache[item.folder_id].findIndex(
            i => i.id === item.id
        );

        if (existingIndex >= 0) {
            // Update existing
            cache[item.folder_id][existingIndex] = item;
        } else {
            // Add new
            cache[item.folder_id].push(item);
        }

        // Save cache
        await this.saveContentCache(cache);
    } catch (error) {
        console.error('Failed to add item to cache:', error);
    }
}

async updateItemInCache(item) {
    try {
        const cache = await this.getContentCache();

        if (cache[item.folder_id]) {
            const index = cache[item.folder_id].findIndex(
                i => i.id === item.id
            );

            if (index >= 0) {
                cache[item.folder_id][index] = item;
                await this.saveContentCache(cache);
            }
        }
    } catch (error) {
        console.error('Failed to update item in cache:', error);
    }
}

async removeItemFromCache(itemId) {
    try {
        const cache = await this.getContentCache();

        // Find and remove item from all folders
        Object.keys(cache).forEach(folderId => {
            cache[folderId] = cache[folderId].filter(
                item => item.id !== itemId
            );
        });

        await this.saveContentCache(cache);
    } catch (error) {
        console.error('Failed to remove item from cache:', error);
    }
}

async getContentCache() {
    try {
        const result = await chrome.storage.local.get('zyphContentCache');
        return result.zyphContentCache || {};
    } catch (error) {
        console.error('Failed to get content cache:', error);
        return {};
    }
}

async saveContentCache(cache) {
    try {
        await chrome.storage.local.set({ zyphContentCache: cache });
    } catch (error) {
        console.error('Failed to save content cache:', error);
    }
}

async refreshFolderDisplay(folderId) {
    // Trigger UI refresh
    const event = new CustomEvent('folder-content-changed', {
        detail: { folderId }
    });
    document.dispatchEvent(event);
}

async updateFolderStats(folderId) {
    // Update folder item count in UI
    const folderElement = document.querySelector(
        `[data-folder-id="${folderId}"]`
    );

    if (folderElement) {
        const cache = await this.getContentCache();
        const itemCount = cache[folderId]?.length || 0;

        const countBadge = folderElement.querySelector('.item-count');
        if (countBadge) {
            countBadge.textContent = itemCount;
        }
    }
}
```

**Task 1.3: Update Content Renderer to Listen for Changes**

File: `zyph-extension/sidepanel/modules/ContentRenderer.js`

```javascript
constructor(folderManager, contextGenerator) {
    this.folderManager = folderManager;
    this.contextGenerator = contextGenerator;

    // Listen for folder content changes
    this.setupChangeListeners();
}

setupChangeListeners() {
    document.addEventListener('folder-content-changed', async (e) => {
        const { folderId } = e.detail;

        // Reload content if we're currently displaying this folder
        if (this.currentFolderId === folderId) {
            await this.loadFolderContent(folderId);
        }
    });
}
```

**Task 1.4: Update Upload Handler to Emit Events**

File: `zyph-extension/sidepanel/modules/UIManager.js` (or wherever upload is handled)

```javascript
async handleFileUpload(file, folderId) {
    try {
        // Show upload progress
        this.showUploadProgress(file.name);

        // Upload file
        const response = await ZyphAPI.uploadFile(file, folderId);

        if (response.success) {
            // Emit event for real-time update
            const event = new CustomEvent('content-added', {
                detail: response.item
            });
            document.dispatchEvent(event);

            // Hide progress
            this.hideUploadProgress();

            // Show success
            this.showNotification(
                'Upload Complete',
                `${file.name} uploaded successfully`,
                'success'
            );
        }
    } catch (error) {
        console.error('Upload failed:', error);
        this.showNotification('Upload Failed', error.message, 'error');
    }
}
```

#### Phase 2: Polling for Status Updates (2-3 hours)

**Task 2.1: Implement Status Polling**

File: `zyph-extension/sidepanel/modules/StatusPoller.js` (new)

```javascript
window.Zyph = window.Zyph || {};

window.Zyph.StatusPoller = class StatusPoller {
    constructor() {
        this.pollInterval = 3000; // 3 seconds
        this.activePollIds = new Set();
        this.pollTimer = null;
    }

    startPolling(itemId) {
        this.activePollIds.add(itemId);

        // Start poll timer if not already running
        if (!this.pollTimer) {
            this.pollTimer = setInterval(() => {
                this.pollAllStatuses();
            }, this.pollInterval);
        }
    }

    stopPolling(itemId) {
        this.activePollIds.delete(itemId);

        // Stop timer if no more items to poll
        if (this.activePollIds.size === 0 && this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    async pollAllStatuses() {
        if (this.activePollIds.size === 0) return;

        const itemIds = Array.from(this.activePollIds);

        for (const itemId of itemIds) {
            try {
                const status = await this.fetchItemStatus(itemId);

                // Check if processing is complete
                if (status.processing_status === 'completed' ||
                    status.processing_status === 'failed') {
                    // Stop polling this item
                    this.stopPolling(itemId);
                }

                // Emit status update event
                const event = new CustomEvent('item-status-updated', {
                    detail: { itemId, status }
                });
                document.dispatchEvent(event);

            } catch (error) {
                console.error(`Failed to poll status for ${itemId}:`, error);
            }
        }
    }

    async fetchItemStatus(itemId) {
        const response = await ZyphAPI.fetch(
            `/v1/files/status/${itemId}`,
            { method: 'GET' }
        );

        if (!response.ok) {
            throw new Error(`Status fetch failed: ${response.statusText}`);
        }

        return await response.json();
    }
};

// Global instance
window.Zyph.statusPoller = new window.Zyph.StatusPoller();
```

**Task 2.2: Integrate Polling with Upload**

File: `zyph-extension/sidepanel/modules/UIManager.js`

```javascript
async handleFileUpload(file, folderId) {
    try {
        // ... existing upload code ...

        if (response.success) {
            // Start polling for status updates
            window.Zyph.statusPoller.startPolling(response.item.id);

            // ... rest of code ...
        }
    } catch (error) {
        // ... error handling ...
    }
}
```

**Task 2.3: Update UI When Status Changes**

File: `zyph-extension/sidepanel/modules/ContentRenderer.js`

```javascript
setupChangeListeners() {
    // ... existing listeners ...

    // Listen for status updates
    document.addEventListener('item-status-updated', (e) => {
        this.handleItemStatusUpdate(e.detail);
    });
}

handleItemStatusUpdate({ itemId, status }) {
    // Find item element in DOM
    const itemElement = document.querySelector(
        `[data-item-id="${itemId}"]`
    );

    if (!itemElement) return;

    // Update status badge
    const statusBadge = itemElement.querySelector('.status-badge');
    if (statusBadge) {
        this.updateStatusBadge(statusBadge, status.processing_status);
    }

    // Update other status indicators
    if (status.processing_status === 'completed' && status.is_searchable) {
        // Add checkmark or "Ready" indicator
        itemElement.classList.add('searchable');
        itemElement.classList.remove('processing');

        // Show success notification
        const item = this.getItemFromCache(itemId);
        if (item) {
            this.showNotification(
                'Processing Complete',
                `"${item.title}" is now searchable`,
                'success'
            );
        }
    } else if (status.processing_status === 'failed') {
        itemElement.classList.add('failed');
        itemElement.classList.remove('processing');
    }
}

updateStatusBadge(badgeElement, status) {
    const statusConfig = {
        'pending': {
            text: 'Queued',
            class: 'status-pending',
            icon: '⏳'
        },
        'processing': {
            text: 'Processing...',
            class: 'status-processing',
            icon: '⚙️'
        },
        'completed': {
            text: 'Ready',
            class: 'status-completed',
            icon: '✓'
        },
        'failed': {
            text: 'Failed',
            class: 'status-failed',
            icon: '✗'
        }
    };

    const config = statusConfig[status] || statusConfig['pending'];

    badgeElement.className = `status-badge ${config.class}`;
    badgeElement.innerHTML = `
        <span class="status-icon">${config.icon}</span>
        <span class="status-text">${config.text}</span>
    `;
}
```

#### Phase 3: Folder Creation Real-time Updates (1-2 hours)

**Task 3.1: Emit Events on Folder Creation**

File: `zyph-extension/sidepanel/modules/FolderManager.js`

```javascript
async createFolder(folderData) {
    try {
        const response = await ZyphAPI.createFolder(folderData);

        if (response.success) {
            // Add to local folders list
            this.folders.push(response.folder);

            // Emit event
            const event = new CustomEvent('folder-created', {
                detail: response.folder
            });
            document.dispatchEvent(event);

            // Refresh folder tree
            await this.refreshFolderTree();

            return response.folder;
        }
    } catch (error) {
        console.error('Failed to create folder:', error);
        throw error;
    }
}
```

**Task 3.2: Listen for Folder Events**

File: `zyph-extension/sidepanel/modules/FolderRenderer.js`

```javascript
constructor(folderManager) {
    this.folderManager = folderManager;

    // Listen for folder changes
    this.setupFolderListeners();
}

setupFolderListeners() {
    document.addEventListener('folder-created', (e) => {
        this.handleFolderCreated(e.detail);
    });

    document.addEventListener('folder-updated', (e) => {
        this.handleFolderUpdated(e.detail);
    });

    document.addEventListener('folder-deleted', (e) => {
        this.handleFolderDeleted(e.detail);
    });
}

handleFolderCreated(folder) {
    // Add folder to tree without full reload
    this.addFolderToTree(folder);

    // Show notification
    this.showNotification(
        'Folder Created',
        `"${folder.name}" has been created`,
        'success'
    );
}

addFolderToTree(folder) {
    // Find parent in tree
    const parentElement = folder.parent_id
        ? document.querySelector(`[data-folder-id="${folder.parent_id}"]`)
        : document.getElementById('folder-tree');

    if (parentElement) {
        // Render new folder
        const folderElement = this.renderFolderItem(folder);

        // Insert in alphabetical order
        const siblings = parentElement.querySelectorAll('.folder-item');
        let inserted = false;

        for (let sibling of siblings) {
            const siblingName = sibling.querySelector('.folder-name').textContent;
            if (folder.name < siblingName) {
                sibling.parentNode.insertBefore(folderElement, sibling);
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            parentElement.appendChild(folderElement);
        }
    }
}
```

#### Phase 4: Testing (2 hours)

**Task 4.1: Test File Upload Real-time Updates**
- Upload file
- Verify appears immediately in folder list
- Verify status shows "Queued" or "Processing"
- Wait for processing
- Verify status updates to "Ready" automatically
- No manual refresh required

**Task 4.2: Test Folder Creation**
- Create new folder
- Verify appears immediately in folder tree
- Verify can interact with new folder immediately

**Task 4.3: Test Multiple Simultaneous Uploads**
- Upload 5 files at once
- Verify all appear in list
- Verify status polling works for all
- Verify UI remains responsive

**Task 4.4: Test Edge Cases**
- Upload file to non-visible folder
- Switch to that folder
- Verify file appears
- Test with slow network
- Test with failed uploads

### Deliverables

1. ✅ Upload event system
2. ✅ Local cache management
3. ✅ Status polling service
4. ✅ Real-time UI updates
5. ✅ Folder creation events
6. ✅ Automatic status refresh

### Success Metrics

- Files appear in UI within 100ms of upload
- Status updates within 3 seconds
- Zero manual refreshes required
- Works with 10+ simultaneous uploads

---

## Issue 6: Folder Interaction Issues

### Problem Statement

Folders sometimes don't respond to clicks until the page is refreshed. This is likely related to Issue 5 (real-time updates) - the folder tree may not be properly initialized after dynamic updates.

### Root Cause

When folders are added dynamically (via events), the click event handlers may not be bound to the new folder elements.

### Implementation Plan

#### Phase 1: Event Delegation (1-2 hours)

**Task 1.1: Use Event Delegation for Folder Clicks**

File: `zyph-extension/sidepanel/modules/FolderRenderer.js`

```javascript
bindFolderEvents() {
    // Instead of binding to individual folders, use delegation
    const folderTree = document.getElementById('folder-tree');

    if (!folderTree) return;

    // Remove old listeners if any
    folderTree.replaceWith(folderTree.cloneNode(true));
    const newFolderTree = document.getElementById('folder-tree');

    // Use event delegation - single listener on parent
    newFolderTree.addEventListener('click', (e) => {
        // Handle folder click
        const folderItem = e.target.closest('.folder-item');
        if (folderItem) {
            const folderId = folderItem.dataset.folderId;
            if (folderId) {
                this.handleFolderClick(folderId, e);
            }
        }

        // Handle expand/collapse toggle
        const toggleBtn = e.target.closest('.folder-toggle');
        if (toggleBtn) {
            e.stopPropagation();
            const folderItem = toggleBtn.closest('.folder-item');
            if (folderItem) {
                this.toggleFolderExpansion(folderItem.dataset.folderId);
            }
        }

        // Handle folder actions
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            e.stopPropagation();
            const action = actionBtn.dataset.action;
            const folderItem = actionBtn.closest('.folder-item');
            if (folderItem) {
                this.handleFolderAction(
                    action,
                    folderItem.dataset.folderId
                );
            }
        }
    });

    // Prevent drag interference
    newFolderTree.addEventListener('mousedown', (e) => {
        // Only if clicking on folder item
        if (e.target.closest('.folder-item')) {
            e.stopPropagation();
        }
    });
}

async handleFolderClick(folderId, event) {
    console.log('[FolderRenderer] Folder clicked:', folderId);

    // Prevent double-click issues
    if (this.clickTimeout) {
        clearTimeout(this.clickTimeout);
    }

    this.clickTimeout = setTimeout(async () => {
        // Update selected state
        this.updateFolderSelection(folderId);

        // Load folder contents
        await this.loadFolderContents(folderId);

        // Emit event
        const event = new CustomEvent('folder-selected', {
            detail: { folderId }
        });
        document.dispatchEvent(event);
    }, 100);
}

updateFolderSelection(folderId) {
    // Remove selection from all folders
    document.querySelectorAll('.folder-item').forEach(item => {
        item.classList.remove('selected');
    });

    // Add selection to clicked folder
    const folderElement = document.querySelector(
        `[data-folder-id="${folderId}"]`
    );
    if (folderElement) {
        folderElement.classList.add('selected');
    }
}

async loadFolderContents(folderId) {
    // Trigger content load
    if (this.contentRenderer) {
        await this.contentRenderer.loadFolderContent(folderId);
    }
}

handleFolderAction(action, folderId) {
    switch (action) {
        case 'rename':
            this.renameFolder(folderId);
            break;
        case 'delete':
            this.deleteFolder(folderId);
            break;
        case 'download':
            this.downloadFolder(folderId);
            break;
        case 'chat':
            this.initiateChatWithFolder(folderId);
            break;
        default:
            console.warn('Unknown folder action:', action);
    }
}

toggleFolderExpansion(folderId) {
    const folderElement = document.querySelector(
        `[data-folder-id="${folderId}"]`
    );

    if (!folderElement) return;

    const isExpanded = folderElement.classList.contains('expanded');

    if (isExpanded) {
        folderElement.classList.remove('expanded');
        folderElement.classList.add('collapsed');
    } else {
        folderElement.classList.remove('collapsed');
        folderElement.classList.add('expanded');
    }

    // Save expansion state
    this.saveFolderExpansionState(folderId, !isExpanded);
}
```

**Task 1.2: Ensure Event Binding After Dynamic Updates**

File: `zyph-extension/sidepanel/modules/FolderRenderer.js`

```javascript
handleFolderCreated(folder) {
    // Add folder to tree
    this.addFolderToTree(folder);

    // Event delegation means no need to re-bind events!
    // The parent listener will catch clicks on new folders

    // But we can still highlight the new folder
    this.highlightNewFolder(folder.id);
}

highlightNewFolder(folderId) {
    const folderElement = document.querySelector(
        `[data-folder-id="${folderId}"]`
    );

    if (folderElement) {
        // Add highlight animation
        folderElement.classList.add('newly-created');

        // Remove after animation
        setTimeout(() => {
            folderElement.classList.remove('newly-created');
        }, 2000);
    }
}
```

**Task 1.3: Add Folder Item Data Attributes**

Ensure all folder items have proper data attributes:

```javascript
renderFolderItem(folder) {
    const folderDiv = document.createElement('div');
    folderDiv.className = 'folder-item';
    folderDiv.dataset.folderId = folder.id; // Important!
    folderDiv.dataset.folderName = folder.name;

    folderDiv.innerHTML = `
        <button class="folder-toggle">
            <svg class="icon">...</svg>
        </button>
        <div class="folder-content">
            <span class="folder-icon">${folder.icon || '📁'}</span>
            <span class="folder-name">${folder.name}</span>
            <span class="item-count">${folder.itemCount || 0}</span>
        </div>
        <div class="folder-actions">
            <button data-action="rename" title="Rename">...</button>
            <button data-action="delete" title="Delete">...</button>
            <button data-action="download" title="Download">...</button>
        </div>
    `;

    return folderDiv;
}
```

**Task 1.4: Add CSS for Visual Feedback**

File: `zyph-extension/sidepanel/sidepanel.css`

```css
/* Folder Item States */
.folder-item {
    cursor: pointer;
    transition: all 0.2s;
}

.folder-item:hover {
    background: var(--bg-hover);
}

.folder-item.selected {
    background: var(--primary-bg);
    border-left: 3px solid var(--primary-color);
}

.folder-item.newly-created {
    animation: highlightPulse 2s ease-out;
}

@keyframes highlightPulse {
    0%, 100% {
        background: transparent;
    }
    50% {
        background: var(--success-bg);
    }
}

/* Ensure clickable area is obvious */
.folder-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: -1;
}
```

#### Phase 2: Testing (1 hour)

**Task 2.1: Test Dynamic Folder Clicks**
- Create new folder
- Immediately try to click it (no refresh)
- Verify it responds
- Verify content loads

**Task 2.2: Test After Multiple Operations**
- Create folder A
- Upload file to folder A
- Create folder B
- Click folder A
- Click folder B
- Verify both respond correctly

**Task 2.3: Test Nested Folders**
- Create parent folder
- Create child folder
- Expand parent
- Click child
- Verify works without refresh

### Deliverables

1. ✅ Event delegation for folders
2. ✅ Robust click handling
3. ✅ Visual feedback on selection
4. ✅ No event binding issues after dynamic updates

### Success Metrics

- 100% folder click response rate
- No refresh required after folder creation
- Visual feedback within 50ms
- Works with deeply nested folders

---

## Issue 7: Processing Status Stuck

### Problem Statement

Processing status shows "queued for processing" even after backend processing is complete. Status only updates after page refresh.

**Note:** This is closely related to Issue 5 and is largely solved by the status polling implementation in that section.

### Additional Fixes Needed

#### Task 1: Verify Backend Status Updates

File: `backend/app/services/processing_service.py`

Ensure processing service properly updates status:

```python
async def process_knowledge_item(self, knowledge_item_id: UUID):
    """Process a knowledge item and update status throughout."""

    async with AsyncSessionLocal() as db:
        try:
            # Get item
            result = await db.execute(
                select(KnowledgeItem).where(KnowledgeItem.id == knowledge_item_id)
            )
            item = result.scalar_one_or_none()

            if not item:
                logger.error(f"Knowledge item {knowledge_item_id} not found")
                return

            # Update status to PROCESSING
            item.processing_status = ProcessingStatus.PROCESSING
            await db.commit()
            await db.refresh(item)

            logger.info(f"Processing started for {knowledge_item_id}")

            # Perform processing...
            chunks = await self.chunk_content(item)
            vectors = await self.generate_embeddings(chunks)

            # Update item with results
            item.is_chunked = True
            item.total_chunks = len(chunks)
            item.processing_status = ProcessingStatus.COMPLETED
            await db.commit()

            logger.info(f"Processing completed for {knowledge_item_id}")

            return {
                "success": True,
                "chunks": len(chunks),
                "vectors": len(vectors)
            }

        except Exception as e:
            logger.error(f"Processing failed for {knowledge_item_id}: {e}")

            # Update status to FAILED
            item.processing_status = ProcessingStatus.FAILED
            await db.commit()

            raise
```

#### Task 2: Add Status Endpoint Response Verification

File: `backend/app/api/v1/endpoints/files.py`

Ensure status endpoint returns accurate data:

```python
@router.get("/status/{item_id}")
async def get_item_status(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """
    Get processing status for a knowledge item.

    Returns real-time status including:
    - processing_status
    - is_chunked
    - total_chunks
    - is_searchable
    """
    user_id = UUID(auth_data["user_id"])

    try:
        # Get item
        result = await db.execute(
            select(KnowledgeItem).where(
                KnowledgeItem.id == item_id,
                KnowledgeItem.user_id == user_id
            )
        )
        item = result.scalar_one_or_none()

        if not item:
            raise HTTPException(status_code=404, detail="Item not found")

        # Count vectors with embeddings
        from app.models.database import Vector
        vector_result = await db.execute(
            select(func.count(Vector.id))
            .where(
                Vector.knowledge_item_id == item_id,
                Vector.embedding.isnot(None)
            )
        )
        vector_count = vector_result.scalar()

        # Determine if searchable
        is_searchable = (
            item.processing_status == ProcessingStatus.COMPLETED and
            vector_count > 0
        )

        return {
            "item_id": str(item.id),
            "processing_status": item.processing_status,
            "is_chunked": item.is_chunked,
            "total_chunks": item.total_chunks,
            "vector_count": vector_count,
            "is_searchable": is_searchable,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get status for {item_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get status")
```

### Deliverables

1. ✅ Status polling (from Issue 5)
2. ✅ Backend status updates verified
3. ✅ Status endpoint accuracy
4. ✅ Real-time UI updates

### Success Metrics

- Status updates within 3 seconds of backend change
- 100% accuracy between backend and frontend status
- No "stuck" status issues

---

## Issue 8: Multi-file Upload Naming Bug

### Problem Statement

When uploading multiple files simultaneously, the second and third files get the name of the first file appended to them instead of keeping their original names.

**Example:**
- Upload: `document1.pdf`, `document2.pdf`, `document3.pdf`
- Result: `document1.pdf`, `document1document2.pdf`, `document1document2document3.pdf`

### Root Cause

Likely a variable scoping issue or incorrect iteration in the upload handler where filename is not properly reset between iterations.

### Implementation Plan

#### Phase 1: Identify Upload Code (30 mins)

**Task 1.1: Find Multi-file Upload Handler**

File: `zyph-extension/background/content-saver.js` or upload dialog

Look for code like:

```javascript
// INCORRECT - filename gets concatenated
let filename = '';
for (let file of files) {
    filename += file.name; // BUG!
    await uploadFile(file, filename);
}
```

#### Phase 2: Fix Upload Logic (1-2 hours)

**Task 2.1: Fix File Upload Loop**

File: `zyph-extension/sidepanel/modules/UIManager.js` (or wherever multi-upload is handled)

```javascript
// BEFORE (Buggy):
async handleMultipleFileUpload(files, folderId) {
    let filename = '';

    for (let file of files) {
        filename += file.name; // THIS IS THE BUG

        try {
            await this.uploadSingleFile(file, folderId, filename);
        } catch (error) {
            console.error('Upload failed:', error);
        }
    }
}

// AFTER (Fixed):
async handleMultipleFileUpload(files, folderId) {
    const uploadPromises = [];

    // Process each file independently
    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Each file gets its own context
        const uploadPromise = this.uploadSingleFile(
            file,
            folderId,
            file.name, // Use file.name directly, not a shared variable
            i
        );

        uploadPromises.push(uploadPromise);
    }

    // Wait for all uploads (or use sequential if preferred)
    try {
        const results = await Promise.allSettled(uploadPromises);

        // Process results
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                console.log(`Upload ${index + 1} succeeded:`, result.value);
            } else {
                console.error(`Upload ${index + 1} failed:`, result.reason);
            }
        });

        return results;
    } catch (error) {
        console.error('Multi-upload error:', error);
        throw error;
    }
}

async uploadSingleFile(file, folderId, filename, index = 0) {
    // Create FormData with proper file handling
    const formData = new FormData();
    formData.append('file', file, file.name); // Explicitly use file.name
    formData.append('folder_id', folderId);
    formData.append('title', filename || file.name);

    try {
        const response = await ZyphAPI.uploadFile(formData);

        if (response.success) {
            // Emit event with correct filename
            const event = new CustomEvent('content-added', {
                detail: {
                    ...response.item,
                    originalFilename: file.name // Ensure original name is preserved
                }
            });
            document.dispatchEvent(event);

            return response;
        }
    } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        throw error;
    }
}
```

**Task 2.2: Verify Backend Handling**

File: `backend/app/api/v1/endpoints/files.py`

```python
@router.post("/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder_id: UUID = Form(...),
    title: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    auth_data: dict = Depends(validate_any_auth)
):
    """Upload a file to knowledge base."""
    user_id = UUID(auth_data["user_id"])

    # Use provided title or fallback to original filename
    item_title = title if title else file.filename

    logger.info(f"Uploading file: {file.filename} with title: {item_title}")

    try:
        # Read file content
        file_content = await file.read()

        # Create knowledge item with correct title
        knowledge_item = await file_service.create_item_from_file(
            db=db,
            user_id=user_id,
            folder_id=folder_id,
            file_content=file_content,
            filename=file.filename,
            title=item_title, # Use correct title
            content_type=file.content_type
        )

        # Queue processing
        background_tasks.add_task(
            process_knowledge_item_background,
            knowledge_item.id
        )

        logger.info(f"Successfully created item: {knowledge_item.id} with title: {knowledge_item.title}")

        return {
            "success": True,
            "item": {
                "id": knowledge_item.id,
                "title": knowledge_item.title, # Verify correct title returned
                "filename": file.filename,
                # ... other fields ...
            }
        }

    except Exception as e:
        logger.error(f"Upload failed for {file.filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Upload failed")
```

**Task 2.3: Add Upload Queue Management**

To prevent race conditions:

File: `zyph-extension/sidepanel/modules/UploadQueue.js` (new)

```javascript
window.Zyph = window.Zyph || {};

window.Zyph.UploadQueue = class UploadQueue {
    constructor() {
        this.queue = [];
        this.activeUploads = 0;
        this.maxConcurrent = 3; // Max parallel uploads
    }

    async addFiles(files, folderId) {
        // Add each file to queue with its own context
        files.forEach(file => {
            this.queue.push({
                file: file,
                folderId: folderId,
                filename: file.name, // Store filename separately
                status: 'pending'
            });
        });

        // Process queue
        await this.processQueue();
    }

    async processQueue() {
        while (this.queue.length > 0) {
            // Wait if at max concurrent uploads
            if (this.activeUploads >= this.maxConcurrent) {
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }

            // Get next item
            const item = this.queue.shift();
            if (!item) break;

            // Upload
            this.activeUploads++;
            item.status = 'uploading';

            this.uploadItem(item)
                .then(() => {
                    item.status = 'completed';
                    this.activeUploads--;
                })
                .catch(error => {
                    item.status = 'failed';
                    item.error = error;
                    this.activeUploads--;
                });
        }
    }

    async uploadItem(item) {
        const formData = new FormData();
        formData.append('file', item.file, item.filename); // Use stored filename
        formData.append('folder_id', item.folderId);
        formData.append('title', item.filename);

        try {
            const response = await ZyphAPI.uploadFile(formData);

            if (response.success) {
                // Verify correct filename
                console.log(`Uploaded: ${item.filename} → ${response.item.title}`);

                if (response.item.title !== item.filename) {
                    console.warn(
                        `Filename mismatch! Expected: ${item.filename}, Got: ${response.item.title}`
                    );
                }

                return response;
            }
        } catch (error) {
            console.error(`Upload failed for ${item.filename}:`, error);
            throw error;
        }
    }
};

// Global instance
window.Zyph.uploadQueue = new window.Zyph.UploadQueue();
```

#### Phase 3: Testing (1-2 hours)

**Task 3.1: Test Multi-file Upload**

Test cases:
1. Upload 3 files with similar names
   - `test1.pdf`, `test2.pdf`, `test3.pdf`
   - Verify each keeps correct name

2. Upload 5 files with different extensions
   - `doc.pdf`, `sheet.xlsx`, `slide.pptx`, `image.png`, `text.txt`
   - Verify all correct

3. Upload 10 files simultaneously
   - Verify all get correct names
   - Check for race conditions

4. Upload files with special characters
   - `file (1).pdf`, `file-2.pdf`, `file_3.pdf`
   - Verify names preserved

**Task 3.2: Verify Backend Logs**
- Check server logs during multi-upload
- Verify each file processed with correct name
- Look for any name concatenation

**Task 3.3: Check Database**
- Query database after multi-upload
- Verify `title` field for each knowledge_item
- Confirm no name concatenation

```sql
SELECT id, title, created_at
FROM knowledge_items
WHERE user_id = 'xxx'
ORDER BY created_at DESC
LIMIT 10;
```

### Deliverables

1. ✅ Fixed upload loop logic
2. ✅ Upload queue management
3. ✅ Backend verification
4. ✅ Comprehensive testing

### Success Metrics

- 100% correct filenames in multi-upload
- No name concatenation
- Works with 20+ simultaneous files
- Race condition free

---

## Implementation Priority & Timeline

### Priority Matrix

| Issue | Impact | Effort | Priority | Timeline |
|-------|--------|--------|----------|----------|
| 5. Real-time UI Updates | 🔴 Critical | High | **P0** | 2-3 days |
| 7. Processing Status Stuck | 🔴 Critical | Medium | **P0** | 1 day (part of #5) |
| 8. Multi-file Naming Bug | 🔴 High | Low | **P0** | 3-4 hours |
| 6. Folder Clicks Not Working | 🔴 High | Low | **P0** | 2-3 hours |
| 4. Initiate Chat from KB | 🟡 High | Medium | **P1** | 1-2 days |
| 1. Add Response to Context | 🟡 Medium | Medium | **P1** | 1-2 days |
| 2. Download Folder as Zip | 🟢 Medium | Medium | **P2** | 1-2 days |
| 3. Download File as Zip | 🟢 Low | Low | **P2** | Included in #2 |

### Recommended Implementation Order

**Week 1: Critical Fixes (P0)**
- Day 1-2: Issue 5 (Real-time UI Updates) + Issue 7 (Status updates)
- Day 3: Issue 8 (Multi-file naming bug)
- Day 4: Issue 6 (Folder click issues)
- Day 5: Testing & refinement

**Week 2: High Priority Features (P1)**
- Day 1-2: Issue 4 (Initiate chat from KB)
- Day 3-4: Issue 1 (Add response to context)
- Day 5: Testing & documentation

**Week 3: Medium Priority Features (P2)**
- Day 1-2: Issue 2 & 3 (Download as zip)
- Day 3-4: Final testing
- Day 5: Documentation & deployment

### Total Effort Estimate

- **Issue 1:** 7-10 hours
- **Issue 2:** 7-10 hours
- **Issue 3:** Included in #2
- **Issue 4:** 5-8 hours
- **Issue 5:** 8-12 hours
- **Issue 6:** 2-4 hours
- **Issue 7:** Included in #5
- **Issue 8:** 3-4 hours

**Total:** 32-48 hours (4-6 business days)

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Status polling overloads backend | Medium | Medium | Rate limiting, batch endpoints |
| Real-time updates cause UI flicker | Low | Medium | Debouncing, smooth transitions |
| Zip generation times out for large folders | Medium | High | Streaming, pagination, async generation |
| Event delegation breaks existing functionality | Low | High | Comprehensive testing, fallback handlers |
| Multi-upload race conditions | Low | Medium | Upload queue, proper async handling |

### User Experience Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users confused by new buttons | Low | Low | Clear labels, tooltips, onboarding |
| Chat initiation interrupts workflow | Low | Medium | Smooth transitions, preserve state |
| Download zip feature misused | Low | Low | Clear messaging, size limits |

---

## Testing Strategy

### Unit Tests

- Upload filename preservation
- Zip generation accuracy
- Event emission and handling
- Status polling logic

### Integration Tests

- End-to-end file upload flow
- Real-time UI update chain
- Chat initiation from KB
- Multi-file upload

### Manual Testing

- Cross-browser compatibility
- Mobile responsiveness (extension popup)
- Different network conditions
- Edge cases (large files, many files, special characters)

### Performance Testing

- Upload 50 files simultaneously
- Download folder with 500+ items
- Status polling with 20+ items processing
- UI responsiveness with 1000+ items in folder

---

## Success Criteria

### Functional Requirements

- ✅ All files/folders appear in UI immediately after creation
- ✅ Processing status updates automatically without refresh
- ✅ Multi-file uploads preserve correct filenames
- ✅ Folders respond to clicks immediately after creation
- ✅ Can initiate chat with any file/folder in one click
- ✅ Can save any chat response to knowledge base
- ✅ Can download folders and files as zip

### Non-Functional Requirements

- ✅ Real-time updates appear within 3 seconds
- ✅ Status polling overhead < 1 req/second
- ✅ UI remains responsive during multi-upload
- ✅ Zip generation completes within 30 seconds for typical folders
- ✅ Zero regressions in existing functionality

### User Satisfaction

- ✅ Users never need to manually refresh
- ✅ Processing status is always accurate
- ✅ File management feels instant
- ✅ Chat integration is seamless
- ✅ Export features work reliably

---

## Deployment Plan

### Phase 1: Development
1. Implement P0 issues (Week 1)
2. Code review
3. Unit tests

### Phase 2: Testing
1. Integration testing
2. User acceptance testing
3. Performance testing
4. Bug fixes

### Phase 3: Staging Deployment
1. Deploy to staging environment
2. Smoke tests
3. Load testing
4. Monitor logs

### Phase 4: Production Deployment
1. Deploy backend changes
2. Deploy extension updates
3. Monitor error rates
4. Gradual rollout (10% → 50% → 100%)

### Phase 5: Post-Deployment
1. Monitor user feedback
2. Track metrics
3. Fix any issues
4. Document learnings

---

## Maintenance & Monitoring

### Monitoring

- **Real-time Updates:** Track event emission/reception rates
- **Status Polling:** Monitor API call frequency and duration
- **Upload Success Rate:** Track upload completion vs. failures
- **Download Success Rate:** Track zip generation success
- **UI Responsiveness:** Monitor client-side performance

### Logging

- Upload filenames at each stage
- Status polling responses
- Event emissions and handlers
- Zip generation time and size

### Alerts

- Upload failure rate > 5%
- Status polling error rate > 2%
- Zip generation timeout rate > 1%
- Event handler errors

---

## Future Enhancements

### Phase 2 Features
- Bulk operations (multi-select and delete/move)
- Drag-and-drop file upload
- WebSocket for instant updates (replace polling)
- Progress bars for individual file uploads
- Resume interrupted uploads
- Batch download (select multiple items)

### Phase 3 Features
- Share knowledge base items/folders
- Collaborative folders
- Version history for items
- Advanced search and filters
- AI-powered auto-tagging

---

**End of Implementation Plan**

This comprehensive plan addresses all 8 user experience issues identified in issues.txt, with detailed implementation steps, code examples, testing strategies, and deployment guidelines. The plan prioritizes critical bugs first (real-time updates, naming issues) before adding new features (export, chat integration).
