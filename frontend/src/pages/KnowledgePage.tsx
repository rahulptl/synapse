import { useState, useEffect, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/apiClient';
import { ModernSidebar } from '@/components/sidebar';
import { ModernItemList } from '@/components/knowledge/ModernItemList';
import { ItemDetails } from '@/components/knowledge/ItemDetails';
import { FileUploadDialog } from '@/components/chat/FileUploadDialog';
import { useToast } from '@/hooks/use-toast';
import { useStorageUsage } from '@/hooks/useStorageUsage';
import { KnowledgeItem, Folder } from '@/types/knowledge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Menu, FolderOpen, Upload, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';


export default function KnowledgePage() {
  const { user, accessToken, loading } = useAuth();
  const navigate = useNavigate();
  const { storage } = useStorageUsage();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderItems, setFolderItems] = useState<KnowledgeItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedItemData, setSelectedItemData] = useState<KnowledgeItem | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [showFileUploadDialog, setShowFileUploadDialog] = useState(false);
  const [triggerRootFolderCreate, setTriggerRootFolderCreate] = useState(false);
  const { toast } = useToast();

  const layoutStyle = useMemo(
    () => ({
      minHeight: 'calc(var(--app-vh, 100vh) - 3.5rem)',
      height: 'calc(var(--app-vh, 100vh) - 3.5rem)',
    }),
    []
  );

  const formatMention = (name: string) => {
    const sanitized = name.replace(/"/g, '\\"');
    return name.includes(' ') ? `@"${sanitized}"` : `@${sanitized}`;
  };

  const getAuthData = () => {
    if (!user || !accessToken) {
      throw new Error('User not authenticated');
    }
    return {
      userId: user.id,
      accessToken,
    };
  };

  // Listen for real-time content additions
  useEffect(() => {
    const handleContentAdded = (event: CustomEvent) => {
      console.log('[KnowledgePage] Content added event:', event.detail);

      // If the added content is for the currently selected folder, refresh
      if (selectedFolder && event.detail?.folderId === selectedFolder) {
        console.log('[KnowledgePage] Refreshing folder content');
        loadFolderItems(selectedFolder);
      }
    };

    window.addEventListener('knowledge-item-added', handleContentAdded as EventListener);

    return () => {
      window.removeEventListener('knowledge-item-added', handleContentAdded as EventListener);
    };
  }, [selectedFolder]);

  useEffect(() => {
    if (user && accessToken) {
      loadFolders();
    }
  }, [user, accessToken]);

  useEffect(() => {
    if (selectedFolder) {
      loadFolderItems(selectedFolder);
    } else {
      setFolderItems([]);
      setSelectedItem(null);
      setSelectedItemData(null);
    }
  }, [selectedFolder]);

  useEffect(() => {
    if (selectedItem) {
      const item = folderItems.find(item => item.id === selectedItem);
      setSelectedItemData(item || null);
    } else {
      setSelectedItemData(null);
    }
  }, [selectedItem, folderItems]);

  const loadFolders = async () => {
    try {
      const auth = getAuthData();
      const response = await apiClient.getFolders(auth);

      // Backend returns { folders: [...] }
      const foldersData = response.folders || [];
      setFolders(foldersData);
    } catch (error) {
      console.error('Failed to load folders:', error);
      toast({
        title: "Error",
        description: "Failed to load folders",
        variant: "destructive",
      });
    }
  };

  const loadFolderItems = async (folderId: string) => {
    try {
      const auth = getAuthData();
      const response = await apiClient.getFolderContent(folderId, auth);

      // Backend returns folder content with items
      const items = response.items || [];
      setFolderItems(items);
    } catch (error) {
      console.error('Failed to load items:', error);
      toast({
        title: "Error",
        description: "Failed to load items",
        variant: "destructive",
      });
    }
  };

  const createFolder = async (parentId: string | null, name: string) => {
    if (!user) return;

    try {
      const auth = getAuthData();
      const folderData = {
        name,
        parent_id: parentId,
      };

      await apiClient.createFolder(folderData, auth);

      // Emit event for real-time folder tree update
      window.dispatchEvent(new CustomEvent('folder-created', {
        detail: { parentId, name }
      }));

      await loadFolders();
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw new Error('Failed to create folder');
    }
  };

  const deleteFolder = async (folderId: string, force: boolean = false) => {
    try {
      const auth = getAuthData();

      // Optimistic update: remove folder from UI immediately
      const originalFolders = [...folders];
      const removeFolderFromTree = (folderList: any[], targetId: string): any[] => {
        return folderList.filter(folder => {
          if (folder.id === targetId) return false;
          if (folder.children) {
            folder.children = removeFolderFromTree(folder.children, targetId);
          }
          return true;
        });
      };

      setFolders(prevFolders => removeFolderFromTree(prevFolders, folderId));

      // Clear selection if deleted folder was selected
      if (selectedFolder === folderId) {
        setSelectedFolder(null);
      }

      try {
        await apiClient.deleteFolder(folderId, auth, force);
      } catch (apiError: any) {
        // Revert optimistic update on failure
        setFolders(originalFolders);
        throw apiError;
      }

      // Refresh folders to get updated state
      await loadFolders();
    } catch (error: any) {
      console.error('Failed to delete folder:', error);
      // Re-throw the error so the FolderTree component can handle it
      throw error;
    }
  };

  const renameFolder = async (folderId: string, newName: string) => {
    try {
      const auth = getAuthData();
      await apiClient.renameFolder(folderId, newName, auth);

      toast({
        title: "Renamed",
        description: `Folder renamed to "${newName}"`,
      });

      await loadFolders();
    } catch (error) {
      console.error('Failed to rename folder:', error);
      toast({
        title: "Error",
        description: "Failed to rename folder",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteItem = async (itemId: string) => {
    try {
      const auth = getAuthData();
      await apiClient.deleteContent(itemId, auth);

      if (selectedItem === itemId) {
        setSelectedItem(null);
        setSelectedItemData(null);
      }

      if (selectedFolder) {
        await loadFolderItems(selectedFolder);
      }

      toast({
        title: "Deleted",
        description: "Item deleted",
      });
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
    }
  };

  const reprocessItem = async (itemId: string) => {
    try {
      const auth = getAuthData();
      await apiClient.reprocessContent(itemId, auth);

      toast({
        title: "Reprocessing",
        description: "Item queued for reprocessing",
      });

      // Refresh items to show updated status
      if (selectedFolder) {
        await loadFolderItems(selectedFolder);
      }
    } catch (error) {
      console.error('Failed to reprocess item:', error);
      toast({
        title: "Error",
        description: "Failed to reprocess item",
        variant: "destructive",
      });
    }
  };

  const renameItem = async (itemId: string, newTitle: string) => {
    try {
      const auth = getAuthData();
      await apiClient.renameContent(itemId, newTitle, auth);

      toast({
        title: "Renamed",
        description: `Item renamed to "${newTitle}"`,
      });

      // Refresh items to show updated title
      if (selectedFolder) {
        await loadFolderItems(selectedFolder);
      }
    } catch (error) {
      console.error('Failed to rename item:', error);
      toast({
        title: "Error",
        description: "Failed to rename item",
        variant: "destructive",
      });
      throw error;
    }
  };

  const moveItem = async (itemId: string, targetFolderId: string) => {
    try {
      const auth = getAuthData();
      await apiClient.moveContent(itemId, targetFolderId, auth);

      toast({
        title: "Moved",
        description: "Item moved to new folder",
      });

      // Refresh items to remove moved item from current folder
      if (selectedFolder) {
        await loadFolderItems(selectedFolder);
      }

      // Clear selection if the moved item was selected
      if (selectedItem === itemId) {
        setSelectedItem(null);
        setSelectedItemData(null);
      }
    } catch (error) {
      console.error('Failed to move item:', error);
      toast({
        title: "Error",
        description: "Failed to move item",
        variant: "destructive",
      });
      throw error;
    }
  };

  
  // Function to start conversation with a specific item
  const chatWithItem = (itemId: string, itemTitle: string) => {
    const mention = formatMention(itemTitle);
    navigate('/chat', {
      state: {
        prefillMention: mention,
        prefillContextLabel: itemTitle,
        prefillContextType: 'item',
        preSelectedItem: {
          id: itemId,
          title: itemTitle,
          type: 'item'
        }
      }
    });

    toast({
      title: "Opening Chat",
      description: `Starting conversation about "${itemTitle}"`,
    });
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Get currently selected folder name for mobile header
  const getSelectedFolderName = (): string | null => {
    if (!selectedFolder) return null;

    const findFolder = (folders: Folder[]): Folder | null => {
      for (const folder of folders) {
        if (folder.id === selectedFolder) return folder;
        if (folder.children) {
          const found = findFolder(folder.children);
          if (found) return found;
        }
      }
      return null;
    };

    const folder = findFolder(folders);
    return folder?.name || null;
  };

  // Convert folders to FileUploadDialog format
  const convertFoldersToFileUploadFormat = (folders: Folder[]): any[] => {
    const convert = (folder: Folder): any => ({
      id: folder.id,
      name: folder.name,
      children: folder.children?.map(convert)
    });
    return folders.map(convert);
  };

  const handleUpload = () => {
    // Show file upload dialog directly like chat page
    setShowFileUploadDialog(true);
  };

  const handleCreateRootFolderInline = () => {
    // Trigger inline folder creation in SidebarFolderTree
    setTriggerRootFolderCreate(true);
    // Reset trigger after a short delay to allow multiple triggers
    setTimeout(() => setTriggerRootFolderCreate(false), 100);
  };

  const handleCreateTextEntry = async (
    folderId: string,
    note: { title: string; content: string }
  ) => {
    try {
      const auth = getAuthData();

      await apiClient.createTextEntry(
        {
          folder_id: folderId,
          title: note.title,
          content: note.content,
        },
        auth
      );

      toast({
        title: "Success",
        description: "Text note created successfully",
      });

      window.dispatchEvent(new CustomEvent('knowledge-item-added', {
        detail: {
          folderId,
          title: note.title,
          contentType: 'text',
        },
      }));

      await loadFolders();
      if (selectedFolder === folderId) {
        await loadFolderItems(selectedFolder);
      }

      setShowFileUploadDialog(false);
    } catch (error) {
      console.error('Failed to create text note:', error);
      toast({
        title: "Creation Failed",
        description: error instanceof Error ? error.message : "Failed to create text note",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleCreateSubfolder = async () => {
    if (!selectedFolder) {
      toast({
        title: "Select a folder",
        description: "Choose a folder first, then create a subfolder.",
        variant: "destructive",
      });
      return;
    }

    const name = prompt('Subfolder name');
    const folderName = name?.trim();
    if (!folderName) {
      return;
    }

    try {
      await createFolder(selectedFolder, folderName);
      toast({
        title: "Folder created",
        description: `Added "${folderName}" inside this folder.`,
      });
    } catch (error) {
      console.error('Failed to create subfolder:', error);
      toast({
        title: "Creation failed",
        description: error instanceof Error ? error.message : "Could not create subfolder",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (file: File, folderId: string, customTitle?: string) => {
    try {
      const auth = getAuthData();

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_id', folderId);
      if (customTitle) {
        formData.append('title', customTitle);
      }

      await apiClient.uploadFile(formData, auth);

      toast({
        title: "Success",
        description: "File uploaded successfully",
      });

      // Refresh folder items and folders list
      await loadFolders();
      if (selectedFolder) {
        await loadFolderItems(selectedFolder);
      }

      setShowFileUploadDialog(false);
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload file",
        variant: "destructive",
      });
    }
  };

  const handleUpgrade = () => {
    console.log('[KNOWLEDGE_PAGE] Upgrade clicked - navigating to pricing page');
    navigate('/pricing');
  };

  return (
    <div className="flex" style={layoutStyle}>
      {/* Desktop Modern Sidebar */}
      <div className="hidden md:block">
        <ModernSidebar
          folders={folders}
          selectedFolder={selectedFolder}
          onFolderSelect={setSelectedFolder}
          onCreateFolder={createFolder}
          onDeleteFolder={deleteFolder}
          onRenameFolder={renameFolder}
          onUpload={handleUpload}
          onUpgrade={handleUpgrade}
          storageUsed={storage.used_bytes}
          storageTotal={storage.total_bytes}
          triggerRootFolderCreate={triggerRootFolderCreate}
          onRequestInlineFolderCreate={handleCreateRootFolderInline}
        />
      </div>

      {/* Mobile Drawer - Simplified */}
      <Sheet open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen}>
        <SheetContent side="left" className="w-80 p-0 border-r border-white/10">
          <SheetHeader className="p-4 border-b border-white/10">
            <SheetTitle className="text-white">Folders</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-5rem)]">
            <ModernSidebar
              folders={folders}
              selectedFolder={selectedFolder}
              onFolderSelect={(folderId) => {
                setSelectedFolder(folderId);
                setIsMobileDrawerOpen(false);
              }}
              onCreateFolder={createFolder}
              onDeleteFolder={deleteFolder}
              onRenameFolder={renameFolder}
              onUpload={handleUpload}
              onUpgrade={handleUpgrade}
              storageUsed={storage.used_bytes}
              storageTotal={storage.total_bytes}
              triggerRootFolderCreate={triggerRootFolderCreate}
              onRequestInlineFolderCreate={handleCreateRootFolderInline}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* File Upload Dialog - Triggered from sidebar */}
      <FileUploadDialog
        open={showFileUploadDialog}
        onOpenChange={setShowFileUploadDialog}
        folders={convertFoldersToFileUploadFormat(folders)}
        onUpload={handleFileUpload}
        enableFolderSelection={!selectedFolder}
        defaultFolderId={selectedFolder}
        defaultFolderName={getSelectedFolderName() || undefined}
        allowTextEntry
        onCreateTextEntry={handleCreateTextEntry}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-background">
        {selectedFolder ? (
          <>
            {/* Mobile Header with Folder Name and Menu */}
            <div className="md:hidden bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileDrawerOpen(true)}
                className="h-9 px-3 text-white hover:bg-white/10"
              >
                <Menu className="h-5 w-5 mr-2" />
                <FolderOpen className="h-4 w-4 mr-2 text-blue-400" />
                <span className="text-sm font-medium truncate max-w-[200px]">
                  {getSelectedFolderName() || 'Folder'}
                </span>
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleCreateSubfolder}
                  size="sm"
                  variant="outline"
                  className="border-white/10 text-white hover:bg-white/10"
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  New Folder
                </Button>
                <Button
                  onClick={handleUpload}
                  size="sm"
                  className="bg-sidebar-primary hover:bg-sidebar-primary/90 text-white"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </div>
            </div>

            {/* Item List and Details Container */}
            <div className="flex-1 flex flex-row overflow-hidden">
              {/* Item List - Hidden on mobile when item selected */}
              <div className={`w-full md:w-80 lg:w-96 flex-shrink-0 bg-sidebar/30 backdrop-blur-xl md:border-r border-sidebar-border overflow-hidden ${
                selectedItem ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
              }`}>
                {/* Desktop Header */}
                <div className="hidden md:flex px-4 py-3 border-b border-sidebar-border items-center justify-between">
                  <Button
                    onClick={handleCreateSubfolder}
                    size="sm"
                    variant="outline"
                    className="border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
                  >
                    <FolderPlus className="h-4 w-4 mr-2" />
                    New Folder
                  </Button>
                  <Button
                    onClick={handleUpload}
                    size="sm"
                    className="bg-sidebar-primary hover:bg-sidebar-primary/90 text-white"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Content
                  </Button>
                </div>
                <ModernItemList
                  items={folderItems}
                  selectedItem={selectedItem}
                  currentFolderId={selectedFolder}
                  folders={folders}
                  onItemSelect={setSelectedItem}
                  onDeleteItem={deleteItem}
                  onReprocessItem={reprocessItem}
                  onRenameItem={renameItem}
                  onMoveItem={moveItem}
                  onChatWithItem={chatWithItem}
                />
              </div>

              {/* Item Details - Full screen on mobile when item selected, side panel on desktop */}
              <div className={`flex-1  ${
                selectedItem ? 'block' : 'hidden lg:block'
              }`}>
                <ItemDetails
                  item={selectedItemData}
                  onDeleteItem={deleteItem}
                  onBack={() => setSelectedItem(null)}
                  folderName={getSelectedFolderName()}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            {/* Mobile Floating Button */}
            <div className="md:hidden fixed bottom-6 right-6 z-10">
              <Button
                size="lg"
                onClick={() => setIsMobileDrawerOpen(true)}
                className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-2xl shadow-blue-500/50 text-white"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </div>

            <div className="text-center space-y-6 px-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/30 via-emerald-400/30 to-indigo-400/30 rounded-full blur-2xl animate-pulse"></div>
                <div className="relative p-8 rounded-4xl mx-auto w-fit shadow-2xl">
                  <svg className="h-16 w-16 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-emerald-400 to-indigo-400 bg-clip-text text-transparent">
                  Welcome to your Memory
                </h3>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
