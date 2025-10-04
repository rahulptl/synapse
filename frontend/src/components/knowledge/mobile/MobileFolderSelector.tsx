import { useState, useMemo } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  X,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Folder {
  id: string;
  name: string;
  path: string;
  depth: number;
  parent_id: string | null;
  children?: Folder[];
}

interface MobileFolderSelectorProps {
  folders: Folder[];
  selectedFolder: string | null;
  onFolderSelect: (folderId: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  trigger?: React.ReactNode;
}

/**
 * Mobile-optimized folder selector using bottom drawer
 * Features: search, nested navigation, create/delete folders
 */
export function MobileFolderSelector({
  folders,
  selectedFolder,
  onFolderSelect,
  onCreateFolder,
  onDeleteFolder,
  trigger,
}: MobileFolderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolderId, setCreatingFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  // Filter folders based on search query
  const filteredFolders = useMemo(() => {
    if (!searchQuery) return folders;

    const filterRecursive = (folderList: Folder[]): Folder[] => {
      return folderList.filter((folder) => {
        const matchesSearch = folder.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const hasMatchingChildren =
          folder.children && filterRecursive(folder.children).length > 0;

        return matchesSearch || hasMatchingChildren;
      });
    };

    return filterRecursive(folders);
  }, [folders, searchQuery]);

  const toggleExpanded = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleFolderSelect = (folderId: string) => {
    onFolderSelect(folderId);
    setIsOpen(false);
  };

  const handleCreateFolder = async (parentId: string | null) => {
    if (!newFolderName.trim()) return;

    try {
      await onCreateFolder(parentId, newFolderName.trim());
      setNewFolderName('');
      setCreatingFolderId(null);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await onDeleteFolder(folderId);
      setFolderToDelete(null);
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const renderFolder = (folder: Folder) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolder === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id} className="select-none">
        {/* Folder Row */}
        <div
          className={`flex items-center gap-2 p-3 rounded-lg transition-all ${
            isSelected
              ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 ring-2 ring-blue-400/40'
              : 'hover:bg-white/5 active:bg-white/10'
          }`}
          style={{ paddingLeft: `${folder.depth * 16 + 12}px` }}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(folder.id);
              }}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* Folder Icon */}
          <div
            onClick={() => handleFolderSelect(folder.id)}
            className="flex items-center gap-2 flex-1 min-w-0"
          >
            {isExpanded ? (
              <FolderOpen className="h-5 w-5 text-blue-400 flex-shrink-0" />
            ) : (
              <Folder className="h-5 w-5 text-gray-400 flex-shrink-0" />
            )}
            <span className="text-white font-medium truncate">{folder.name}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCreatingFolderId(folder.id);
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4 text-green-400" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFolderToDelete(folder.id);
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Trash2 className="h-4 w-4 text-red-400" />
            </button>
          </div>
        </div>

        {/* Create Subfolder Input */}
        {creatingFolderId === folder.id && (
          <div
            className="flex items-center gap-2 p-2 mt-1"
            style={{ paddingLeft: `${(folder.depth + 1) * 16 + 12}px` }}
          >
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder(folder.id);
                if (e.key === 'Escape') {
                  setCreatingFolderId(null);
                  setNewFolderName('');
                }
              }}
              placeholder="Folder name..."
              className="flex-1 h-9 bg-white/10 border-white/20 text-white"
            />
            <Button
              size="sm"
              onClick={() => handleCreateFolder(folder.id)}
              className="h-9 bg-green-600 hover:bg-green-700"
            >
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreatingFolderId(null);
                setNewFolderName('');
              }}
              className="h-9"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Render Children */}
        {isExpanded && hasChildren && (
          <div className="mt-1 space-y-1">{folder.children!.map(renderFolder)}</div>
        )}
      </div>
    );
  };

  return (
    <>
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>
          {trigger || (
            <Button variant="outline" className="w-full">
              <FolderOpen className="h-4 w-4 mr-2" />
              Select Folder
            </Button>
          )}
        </DrawerTrigger>
        <DrawerContent className="h-[85vh] bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800 border-t border-white/10">
          <DrawerHeader className="border-b border-white/10">
            <DrawerTitle className="text-white">Folders</DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Search Bar */}
            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search folders..."
                  className="pl-10 pr-10 bg-white/10 border-white/20 text-white placeholder:text-gray-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Folder List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {/* Root Create Button */}
              {creatingFolderId === null && (
                <Button
                  variant="outline"
                  onClick={() => setCreatingFolderId('root')}
                  className="w-full justify-start mb-3 border-dashed border-white/20 hover:bg-white/10"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Root Folder
                </Button>
              )}

              {/* Root Create Input */}
              {creatingFolderId === 'root' && (
                <div className="flex items-center gap-2 mb-3">
                  <Input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder(null);
                      if (e.key === 'Escape') {
                        setCreatingFolderId(null);
                        setNewFolderName('');
                      }
                    }}
                    placeholder="Folder name..."
                    className="flex-1 bg-white/10 border-white/20 text-white"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleCreateFolder(null)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Create
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCreatingFolderId(null);
                      setNewFolderName('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Folders */}
              {filteredFolders.length > 0 ? (
                <div className="space-y-1">{filteredFolders.map(renderFolder)}</div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  {searchQuery ? 'No folders found' : 'No folders yet'}
                </div>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={folderToDelete !== null}
        onOpenChange={(open) => !open && setFolderToDelete(null)}
      >
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Folder</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete this folder? This will also delete all items
              and subfolders within it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 text-white hover:bg-white/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => folderToDelete && handleDeleteFolder(folderToDelete)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
