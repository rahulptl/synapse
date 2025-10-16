import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus, Trash2, Edit2, MessageSquare, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/apiClient';

interface Folder {
  id: string;
  name: string;
  path: string;
  depth: number;
  parent_id: string | null;
  children?: Folder[];
}

interface FolderTreeProps {
  folders: Folder[];
  selectedFolder: string | null;
  onFolderSelect: (folderId: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string, force?: boolean) => Promise<void>;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void>;
}

interface FolderNodeProps {
  folder: Folder;
  selectedFolder: string | null;
  onFolderSelect: (folderId: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string, force?: boolean) => Promise<void>;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void>;
}

function FolderNode({
  folder,
  selectedFolder,
  onFolderSelect,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder
}: FolderNodeProps) {
  const navigate = useNavigate();
  const { user, accessToken } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const hasChildren = folder.children && folder.children.length > 0;
  const isSelected = selectedFolder === folder.id;

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await onCreateFolder(folder.id, newFolderName.trim());
      setNewFolderName('');
      setIsCreating(false);
      setIsExpanded(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive",
      });
    }
  };

  const handleDeleteFolder = async (force: boolean = false) => {
    setShowDeleteDialog(false);
    setIsDeleting(true);

    try {
      await onDeleteFolder(folder.id, force);
      toast({
        title: "Success",
        description: "Folder deleted successfully",
      });
    } catch (error: any) {
      console.error('Delete folder error:', error);

      // Check if it's a "folder has content" error
      if (error.message && (
        error.message.includes('contains subfolders') ||
        error.message.includes('contains content')
      )) {
        // Show force delete confirmation
        setShowDeleteDialog(true);
        toast({
          title: "Folder not empty",
          description: "Folder contains subfolders or content. Choose to force delete.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to delete folder",
          variant: "destructive",
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameFolder = async () => {
    if (!renameValue.trim() || renameValue === folder.name) {
      setIsRenaming(false);
      setRenameValue(folder.name);
      return;
    }

    try {
      if (onRenameFolder) {
        await onRenameFolder(folder.id, renameValue.trim());
        setIsRenaming(false);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to rename folder",
        variant: "destructive",
      });
      setRenameValue(folder.name);
      setIsRenaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewFolderName('');
    }
  };

  const handleRenameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameFolder();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setRenameValue(folder.name);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center group transition-all duration-300 rounded-lg mx-2 my-0.5 ${
          isSelected
            ? 'bg-gradient-to-r from-blue-500/25 to-purple-500/25 shadow-lg ring-2 ring-blue-400/40 scale-[1.02]'
            : 'hover:bg-white/10 hover:-translate-y-0.5 hover:shadow-md'
        }`}
        style={{ paddingLeft: `${folder.depth * 16 + 8}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center flex-1 py-2 px-2">
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 w-6 p-0 mr-2 transition-colors flex-shrink-0 ${
                isSelected ? 'text-blue-200 hover:text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <div className="w-8 flex-shrink-0" />
          )}

          <div
            className={`p-1.5 rounded-lg mr-3 flex-shrink-0 transition-colors cursor-pointer ${
              isSelected ? 'bg-blue-400/30 text-blue-200' : 'bg-white/10 text-gray-300 group-hover:bg-white/20'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onFolderSelect(folder.id);
            }}
          >
            {isExpanded && hasChildren ? (
              <FolderOpen className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
          </div>

          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyPress}
              onBlur={handleRenameFolder}
              className="h-7 text-sm bg-white/10 border-white/20 text-white flex-1 min-w-0"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className={`text-base cursor-pointer flex-1 min-w-0 font-semibold transition-colors truncate ${
                isSelected ? 'text-white' : 'text-gray-200 group-hover:text-white'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onFolderSelect(folder.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (onRenameFolder) {
                  setIsRenaming(true);
                }
              }}
            >
              {folder.name.charAt(0).toUpperCase() + folder.name.slice(1)}
            </span>
          )}
        </div>

        {isHovered && !isRenaming && (
          <div className="flex items-center space-x-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-blue-500/20 hover:text-blue-400 transition-colors text-gray-400"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/chat', {
                  state: {
                    preSelectedFolder: {
                      id: folder.id,
                      name: folder.name,
                      type: 'folder'
                    }
                  }
                });
              }}
              title="Chat with this folder"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
            {onRenameFolder && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-purple-500/20 hover:text-purple-400 transition-colors text-gray-400"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRenaming(true);
                }}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsCreating(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-red-500/20 hover:text-red-400 transition-colors text-gray-400"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <div className="animate-spin">
                  <Trash2 className="h-3.5 w-3.5" />
                </div>
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>

      {isCreating && (
        <div style={{ paddingLeft: `${(folder.depth + 1) * 16 + 8}px` }} className="py-1 mx-2">
          <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-lg p-2">
            <div className="p-1 bg-blue-500/20 rounded-md mr-2">
              <Folder className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Folder name"
              className="h-7 text-sm bg-transparent border-white/20 text-white placeholder-gray-400 focus:border-blue-400/60"
              autoFocus
            />
          </div>
        </div>
      )}

      {isExpanded && hasChildren && (
        <div>
          {folder.children?.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              selectedFolder={selectedFolder}
              onFolderSelect={onFolderSelect}
              onCreateFolder={onCreateFolder}
              onDeleteFolder={onDeleteFolder}
              onRenameFolder={onRenameFolder}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-slate-900 border border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span>Delete Folder</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete the folder "{folder.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 text-white hover:bg-white/20 border-white/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteFolder(false)}
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
            {hasChildren && (
              <AlertDialogAction
                onClick={() => handleDeleteFolder(true)}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
              >
                Force Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function FolderTree({
  folders,
  selectedFolder,
  onFolderSelect,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder
}: FolderTreeProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const { toast } = useToast();

  const handleCreateRootFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await onCreateFolder(null, newFolderName.trim());
      setNewFolderName('');
      setIsCreating(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive",
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateRootFolder();
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewFolderName('');
    }
  };

  // Backend already returns hierarchical structure, no need to build it
  const folderTree = folders;

  return (
    <div className="h-full flex flex-col">
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">Folders</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCreating(true)}
            className="h-8 w-8 p-0 hover:bg-blue-500/20 hover:text-blue-400 transition-colors text-gray-400"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto">
        {isCreating && (
          <div className="mb-3">
            <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-lg p-3 mx-2">
              <div className="p-1.5 bg-blue-500/20 rounded-lg mr-3">
                <Folder className="h-4 w-4 text-blue-400" />
              </div>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Folder name"
                className="h-8 text-sm bg-transparent border-white/20 text-white placeholder-gray-400 focus:border-blue-400/60"
                autoFocus
              />
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          {folderTree.map((folder) => (
            <FolderNode
              key={folder.id}
              folder={folder}
              selectedFolder={selectedFolder}
              onFolderSelect={onFolderSelect}
              onCreateFolder={onCreateFolder}
              onDeleteFolder={onDeleteFolder}
              onRenameFolder={onRenameFolder}
            />
          ))}
        </div>
      </div>
    </div>
  );
}