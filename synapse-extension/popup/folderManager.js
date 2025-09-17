// Setup event listeners after DOM loads
document.addEventListener('DOMContentLoaded', () => {
  // Add folder button
  const addFolderBtn = document.getElementById('add-folder-btn');
  if (addFolderBtn) {
    addFolderBtn.addEventListener('click', showAddFolderForm);
  }

  // Setup action buttons for existing folders
  document.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'edit') {
      const folderId = e.target.dataset.folderId;
      const name = e.target.dataset.folderName;
      const color = e.target.dataset.folderColor;
      const icon = e.target.dataset.folderIcon;
      editFolder(folderId, name, color, icon);
    } else if (e.target.dataset.action === 'delete') {
      const folderId = e.target.dataset.folderId;
      deleteFolder(folderId);
    }
  });
});

function showAddFolderForm() {
  const formHtml = `
    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-top: 20px;">
      <h3 style="margin: 0 0 16px 0;">Add New Folder</h3>
      <div class="form-group">
        <label>Folder Name</label>
        <input type="text" id="folderName" placeholder="e.g., Personal, Work, Random" maxlength="20">
      </div>
      <div class="form-group">
        <label>Color</label>
        <div class="color-picker">
          <div class="color-option selected" data-color="#667eea" style="background: #667eea;"></div>
          <div class="color-option" data-color="#28a745" style="background: #28a745;"></div>
          <div class="color-option" data-color="#ffc107" style="background: #ffc107;"></div>
          <div class="color-option" data-color="#dc3545" style="background: #dc3545;"></div>
          <div class="color-option" data-color="#6f42c1" style="background: #6f42c1;"></div>
          <div class="color-option" data-color="#fd7e14" style="background: #fd7e14;"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Icon</label>
        <div class="icon-picker">
          <div class="icon-option selected" data-icon="📁">📁</div>
          <div class="icon-option" data-icon="👤">👤</div>
          <div class="icon-option" data-icon="💼">💼</div>
          <div class="icon-option" data-icon="🎲">🎲</div>
          <div class="icon-option" data-icon="🎯">🎯</div>
          <div class="icon-option" data-icon="⚡">⚡</div>
          <div class="icon-option" data-icon="🚀">🚀</div>
          <div class="icon-option" data-icon="💡">💡</div>
        </div>
      </div>
      <div style="display: flex; gap: 12px; margin-top: 20px;">
        <button class="btn btn-primary" id="save-folder-btn">Save Folder</button>
        <button class="btn" style="background: #6c757d; color: white;" id="cancel-folder-btn">Cancel</button>
      </div>
    </div>
  `;
  
  document.querySelector('.add-folder').innerHTML = formHtml;
  
  // Setup color picker
  document.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
    });
  });
  
  // Setup icon picker
  document.querySelectorAll('.icon-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
    });
  });

  // Setup form buttons
  document.getElementById('save-folder-btn').addEventListener('click', saveFolder);
  document.getElementById('cancel-folder-btn').addEventListener('click', cancelAddFolder);
}

function cancelAddFolder() {
  document.querySelector('.add-folder').innerHTML = '<button class="btn btn-primary" id="add-folder-btn">Add New Folder</button>';
  // Re-attach event listener
  document.getElementById('add-folder-btn').addEventListener('click', showAddFolderForm);
}

async function saveFolder() {
  const name = document.getElementById('folderName').value.trim();
  const color = document.querySelector('.color-option.selected').dataset.color;
  const icon = document.querySelector('.icon-option.selected').dataset.icon;
  
  if (!name) {
    alert('Please enter a folder name');
    return;
  }
  
  const folderId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  // Send message to save folder
  window.opener.postMessage({
    type: 'SAVE_FOLDER',
    folderId,
    folderData: { name, color, icon, createdAt: Date.now() }
  }, '*');
  
  window.location.reload();
}

async function deleteFolder(folderId) {
  if (confirm('Are you sure you want to delete this folder? Conversations will not be deleted, but will become unorganized.')) {
    window.opener.postMessage({
      type: 'DELETE_FOLDER',
      folderId
    }, '*');
    
    window.location.reload();
  }
}

function editFolder(folderId, name, color, icon) {
  // TODO: Implement edit functionality
  alert('Edit functionality coming soon!');
}