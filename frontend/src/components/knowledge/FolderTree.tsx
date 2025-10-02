import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

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
  onDeleteFolder: (folderId: string) => Promise<void>;
}

interface FolderNodeProps {
  folder: Folder;
  selectedFolder: string | null;
  onFolderSelect: (folderId: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
}

function FolderNode({ 
  folder, 
  selectedFolder, 
  onFolderSelect, 
  onCreateFolder, 
  onDeleteFolder 
}: FolderNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isHovered, setIsHovered] = useState(false);
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

  const handleDeleteFolder = async () => {
    try {
      await onDeleteFolder(folder.id);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete folder",
        variant: "destructive",
      });
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

          <span
            className={`text-sm cursor-pointer flex-1 min-w-0 font-medium transition-colors truncate ${
              isSelected ? 'text-white' : 'text-gray-200 group-hover:text-white'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onFolderSelect(folder.id);
            }}
          >
            {folder.name}
          </span>
        </div>
        
        {isHovered && (
          <div className="flex items-center space-x-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
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
                handleDeleteFolder();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  folders,
  selectedFolder,
  onFolderSelect,
  onCreateFolder,
  onDeleteFolder
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
          <h3 className="text-lg font-semibold text-white">Folders</h3>
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}