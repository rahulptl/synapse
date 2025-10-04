import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/apiClient';
import { useToast } from '@/hooks/use-toast';
import { PullToRefresh } from '@/components/knowledge/mobile/PullToRefresh';
import { MobileSearchBar, SearchFilters } from '@/components/knowledge/mobile/MobileSearchBar';
import { MobileFolderSelector } from '@/components/knowledge/mobile/MobileFolderSelector';
import { MobileItemCard } from '@/components/knowledge/mobile/MobileItemCard';
import { MobileItemDetail } from '@/components/knowledge/mobile/MobileItemDetail';
import { UploadDialog } from '@/components/knowledge/UploadDialog';
import { Button } from '@/components/ui/button';
import { FolderOpen, Plus, Upload } from 'lucide-react';

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
  is_chunked?: boolean;
  total_chunks?: number;
  processing_status?: string;
}

/**
 * Mobile-optimized knowledge base page
 * Features: pull-to-refresh, search/filter, swipeable cards, bottom sheet navigation
 */
export default function MobileKnowledgePage() {
  const { user, accessToken, loading } = useAuth();
  const { toast } = useToast();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderItems, setFolderItems] = useState<KnowledgeItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedItemData, setSelectedItemData] = useState<KnowledgeItem | null>(null);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    query: '',
    contentType: 'all',
    sortBy: 'date',
    sortOrder: 'desc',
  });
  const [isDetailOpen, setIsDetailOpen] = useState(false);

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
      const item = folderItems.find((item) => item.id === selectedItem);
      setSelectedItemData(item || null);
      setIsDetailOpen(true);
    } else {
      setSelectedItemData(null);
      setIsDetailOpen(false);
    }
  }, [selectedItem, folderItems]);

  const loadFolders = async () => {
    try {
      const auth = getAuthData();
      const response = await apiClient.getFolders(auth);
      const foldersData = response.folders || [];
      setFolders(foldersData);
    } catch (error) {
      console.error('Failed to load folders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load folders',
        variant: 'destructive',
      });
    }
  };

  const loadFolderItems = async (folderId: string) => {
    try {
      const auth = getAuthData();
      const response = await apiClient.getFolderContent(folderId, auth);
      const items = response.items || [];
      setFolderItems(items);
    } catch (error) {
      console.error('Failed to load items:', error);
      toast({
        title: 'Error',
        description: 'Failed to load items',
        variant: 'destructive',
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
      toast({
        title: 'Created',
        description: 'Folder created successfully',
      });
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
      toast({
        title: 'Deleted',
        description: 'Folder deleted successfully',
      });
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
        title: 'Deleted',
        description: 'Item deleted successfully',
      });
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete item',
        variant: 'destructive',
      });
    }
  };

  const reprocessItem = async (itemId: string) => {
    try {
      const auth = getAuthData();
      await apiClient.reprocessContent(itemId, auth);

      toast({
        title: 'Reprocessing',
        description: 'Item queued for reprocessing',
      });

      if (selectedFolder) {
        await loadFolderItems(selectedFolder);
      }
    } catch (error) {
      console.error('Failed to reprocess item:', error);
      toast({
        title: 'Error',
        description: 'Failed to reprocess item',
        variant: 'destructive',
      });
    }
  };

  const handleRefresh = async () => {
    if (selectedFolder) {
      await loadFolderItems(selectedFolder);
    }
    await loadFolders();
  };

  // Filter and sort items based on search criteria
  const filteredAndSortedItems = useMemo(() => {
    let filtered = [...folderItems];

    // Filter by search query
    if (searchFilters.query) {
      const query = searchFilters.query.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.content.toLowerCase().includes(query)
      );
    }

    // Filter by content type
    if (searchFilters.contentType !== 'all') {
      filtered = filtered.filter(
        (item) => item.content_type === searchFilters.contentType
      );
    }

    // Sort items
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (searchFilters.sortBy) {
        case 'date':
          comparison =
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'type':
          comparison = a.content_type.localeCompare(b.content_type);
          break;
      }

      return searchFilters.sortOrder === 'asc' ? -comparison : comparison;
    });

    return filtered;
  }, [folderItems, searchFilters]);

  // Get selected folder name
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800 flex flex-col overflow-hidden">
      {selectedFolder ? (
        <>
          {/* Header with Folder Name */}
          <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <MobileFolderSelector
              folders={folders}
              selectedFolder={selectedFolder}
              onFolderSelect={setSelectedFolder}
              onCreateFolder={createFolder}
              onDeleteFolder={deleteFolder}
              trigger={
                <Button
                  variant="ghost"
                  className="h-10 px-3 text-white hover:bg-white/10 max-w-[200px]"
                >
                  <FolderOpen className="h-4 w-4 mr-2 text-blue-400 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {getSelectedFolderName() || 'Folder'}
                  </span>
                </Button>
              }
            />
            <UploadDialog
              folderId={selectedFolder}
              onUploadComplete={() => loadFolderItems(selectedFolder)}
            />
          </div>

          {/* Search Bar */}
          <MobileSearchBar
            onSearchChange={setSearchFilters}
            placeholder="Search items..."
            itemCount={filteredAndSortedItems.length}
          />

          {/* Items List with Pull-to-Refresh */}
          <div className="flex-1 overflow-hidden">
            <PullToRefresh onRefresh={handleRefresh}>
              <div className="p-4 space-y-3 min-h-full">
                {filteredAndSortedItems.length > 0 ? (
                  filteredAndSortedItems.map((item) => (
                    <MobileItemCard
                      key={item.id}
                      item={item}
                      isSelected={selectedItem === item.id}
                      onSelect={() => setSelectedItem(item.id)}
                      onDelete={() => deleteItem(item.id)}
                      onReprocess={() => reprocessItem(item.id)}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="bg-white/10 p-8 rounded-2xl backdrop-blur-sm mb-4">
                      <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                    </div>
                    <h3 className="text-white font-semibold mb-2">No items found</h3>
                    <p className="text-gray-400 text-sm text-center mb-4">
                      {searchFilters.query || searchFilters.contentType !== 'all'
                        ? 'Try adjusting your search or filters'
                        : 'Upload files or add content to get started'}
                    </p>
                  </div>
                )}
              </div>
            </PullToRefresh>
          </div>
        </>
      ) : (
        /* Empty State - No Folder Selected */
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="text-center space-y-6 max-w-md">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400/30 via-emerald-400/30 to-indigo-400/30 rounded-full blur-2xl animate-pulse" />
              <div className="relative bg-gradient-to-br from-blue-600 via-emerald-500 to-indigo-600 p-10 rounded-4xl mx-auto w-fit shadow-2xl">
                <svg
                  className="h-20 w-20 text-white drop-shadow-lg"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-emerald-400 to-indigo-400 bg-clip-text text-transparent">
                Welcome to your Knowledge Base
              </h3>
              <p className="text-gray-300 text-base leading-relaxed">
                {folders.length === 0
                  ? 'Get started by creating your first folder to organize your knowledge.'
                  : 'Select a folder to explore your knowledge.'}
              </p>
            </div>

            <MobileFolderSelector
              folders={folders}
              selectedFolder={selectedFolder}
              onFolderSelect={setSelectedFolder}
              onCreateFolder={createFolder}
              onDeleteFolder={deleteFolder}
              trigger={
                <Button
                  size="lg"
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                >
                  <FolderOpen className="h-5 w-5 mr-2" />
                  {folders.length === 0 ? 'Create Your First Folder' : 'Browse Folders'}
                </Button>
              }
            />

            <div className="flex flex-wrap justify-center gap-3 pt-4">
              <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm border border-blue-400/40 px-4 py-2 rounded-xl">
                <div className="p-1 bg-blue-500/30 rounded-md">
                  <svg
                    className="h-4 w-4 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z"
                    />
                  </svg>
                </div>
                <span className="text-sm font-medium text-blue-300">Organized</span>
              </div>
              <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-sm border border-emerald-400/40 px-4 py-2 rounded-xl">
                <div className="p-1 bg-emerald-500/30 rounded-md">
                  <svg
                    className="h-4 w-4 text-emerald-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <span className="text-sm font-medium text-emerald-300">Searchable</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item Detail Modal */}
      <MobileItemDetail
        item={selectedItemData}
        isOpen={isDetailOpen}
        onClose={() => {
          setSelectedItem(null);
          setIsDetailOpen(false);
        }}
        onDelete={deleteItem}
      />
    </div>
  );
}
