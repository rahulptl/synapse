import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/apiClient';
import { FolderTree } from '@/components/knowledge/FolderTree';
import { ItemList } from '@/components/knowledge/ItemList';
import { ItemDetails } from '@/components/knowledge/ItemDetails';
import { UploadDialog } from '@/components/knowledge/UploadDialog';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Folder {
  id: string;
  name: string;
  path: string;
  depth: number;
  parent_id: string | null;
  children?: Folder[];
}

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  content_type: string;
  source_url?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export default function KnowledgePage() {
  const { user, accessToken, loading } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderItems, setFolderItems] = useState<KnowledgeItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedItemData, setSelectedItemData] = useState<KnowledgeItem | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const { toast } = useToast();

  const getAuthData = () => {
    if (!user || !accessToken) {
      throw new Error('User not authenticated');
    }
    return {
      userId: user.id,
      accessToken,
    };
  };

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
      await loadFolders();
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw new Error('Failed to create folder');
    }
  };

  const deleteFolder = async (folderId: string) => {
    try {
      const auth = getAuthData();
      await apiClient.deleteFolder(folderId, auth);

      if (selectedFolder === folderId) {
        setSelectedFolder(null);
      }

      await loadFolders();
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw new Error('Failed to delete folder');
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

  // Handle mobile folder selection
  const handleMobileFolderSelect = (folderId: string) => {
    setSelectedFolder(folderId);
    setIsMobileDrawerOpen(false); // Close drawer after selection
  };

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

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800">
      {/* Desktop Sidebar - Folder Tree */}
      <div className="hidden md:block w-64 lg:w-80 flex-shrink-0 bg-white/5 backdrop-blur-2xl border-r border-white/10 shadow-2xl">
        <FolderTree
          folders={folders}
          selectedFolder={selectedFolder}
          onFolderSelect={setSelectedFolder}
          onCreateFolder={createFolder}
          onDeleteFolder={deleteFolder}
        />
      </div>

      {/* Mobile Drawer - Folder Tree */}
      <Sheet open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen}>
        <SheetContent side="left" className="w-80 p-0 bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800 border-r border-white/10">
          <SheetHeader className="p-5 border-b border-white/10">
            <SheetTitle className="text-white">Folders</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-5rem)] overflow-hidden">
            <FolderTree
              folders={folders}
              selectedFolder={selectedFolder}
              onFolderSelect={handleMobileFolderSelect}
              onCreateFolder={createFolder}
              onDeleteFolder={deleteFolder}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-900/80 to-gray-800/80 backdrop-blur-sm">
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
              <UploadDialog
                folderId={selectedFolder}
                onUploadComplete={() => loadFolderItems(selectedFolder)}
              />
            </div>

            {/* Item List and Details Container */}
            <div className="flex-1 flex flex-row overflow-hidden">
              {/* Item List - Hidden on mobile when item selected */}
              <div className={`w-full md:w-80 lg:w-96 flex-shrink-0 bg-white/5 backdrop-blur-xl md:border-r border-white/10 shadow-xl overflow-y-auto ${
                selectedItem ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
              }`}>
                {/* Desktop Header */}
                <div className="hidden md:block p-4 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Items</h3>
                    <p className="text-sm text-gray-400">{folderItems.length} item{folderItems.length !== 1 ? 's' : ''}</p>
                  </div>
                  <UploadDialog
                    folderId={selectedFolder}
                    onUploadComplete={() => loadFolderItems(selectedFolder)}
                  />
                </div>
                <ItemList
                  items={folderItems}
                  selectedItem={selectedItem}
                  onItemSelect={setSelectedItem}
                  onDeleteItem={deleteItem}
                  onReprocessItem={reprocessItem}
                />
              </div>

              {/* Item Details - Full screen on mobile when item selected, side panel on desktop */}
              <div className={`flex-1 bg-gradient-to-br from-slate-900/50 to-gray-800/50 ${
                selectedItem ? 'block' : 'hidden lg:block'
              }`}>
                <ItemDetails
                  item={selectedItemData}
                  onDeleteItem={deleteItem}
                  onBack={() => setSelectedItem(null)}
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
                <div className="relative bg-gradient-to-br from-blue-600 via-emerald-500 to-indigo-600 p-8 rounded-4xl mx-auto w-fit shadow-2xl">
                  <svg className="h-16 w-16 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-emerald-400 to-indigo-400 bg-clip-text text-transparent">
                  Welcome to your Knowledge Base
                </h3>
                <p className="text-gray-300 max-w-lg mx-auto text-lg leading-relaxed">
                  {folders.length === 0 ? (
                    <>
                      Get started by creating your first folder.
                      <span className="block mt-2 md:hidden text-blue-400 font-medium">
                        Tap the menu button to create folders
                      </span>
                      <span className="hidden md:block text-blue-400 font-medium">
                        Use the sidebar to create and organize folders
                      </span>
                    </>
                  ) : (
                    <>
                      Select a folder to explore your knowledge.
                      <span className="block mt-2 md:hidden text-blue-400 font-medium">
                        Tap the menu button to browse folders
                      </span>
                      <span className="hidden md:block text-blue-400 font-medium">
                        Choose from {folders.length} folder{folders.length !== 1 ? 's' : ''} in the sidebar
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm border border-blue-400/40 px-4 py-2 rounded-xl shadow-sm">
                  <div className="p-1 bg-blue-500/30 rounded-md">
                    <svg className="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-blue-300">Organized</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm border border-emerald-400/40 px-4 py-2 rounded-xl shadow-sm">
                  <div className="p-1 bg-emerald-500/30 rounded-md">
                    <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-emerald-300">Searchable</span>
                </div>
                <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm border border-indigo-400/40 px-4 py-2 rounded-xl shadow-sm">
                  <div className="p-1 bg-indigo-500/30 rounded-md">
                    <svg className="h-4 w-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-indigo-300">Intelligent</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
