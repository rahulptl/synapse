import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/apiClient';
import { FolderTree } from '@/components/knowledge/FolderTree';
import { ItemList } from '@/components/knowledge/ItemList';
import { ItemDetails } from '@/components/knowledge/ItemDetails';
import { UploadDialog } from '@/components/knowledge/UploadDialog';
import { useToast } from '@/hooks/use-toast';

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

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800">
      {/* Left Sidebar - Folder Tree */}
      <div className="hidden md:block w-64 lg:w-80 flex-shrink-0 bg-white/5 backdrop-blur-2xl border-r border-white/10 shadow-2xl">
        <FolderTree
          folders={folders}
          selectedFolder={selectedFolder}
          onFolderSelect={setSelectedFolder}
          onCreateFolder={createFolder}
          onDeleteFolder={deleteFolder}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex bg-gradient-to-br from-slate-900/80 to-gray-800/80 backdrop-blur-sm">
        {selectedFolder ? (
          <>
            {/* Item List */}
            <div className="w-full md:w-80 lg:w-96 flex-shrink-0 bg-white/5 backdrop-blur-xl md:border-r border-white/10 shadow-xl overflow-y-auto">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
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

            {/* Item Details */}
            <div className="hidden lg:block flex-1 bg-gradient-to-br from-slate-900/50 to-gray-800/50">
              <ItemDetails
                item={selectedItemData}
                onDeleteItem={deleteItem}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
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
                  Select a folder from the sidebar to explore your knowledge. Organize, search, and discover insights from your personal collection.
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
