import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder as FolderIcon, FolderOpen, Plus, Edit2, Trash2, MoreHorizontal } from 'lucide-react';
import { SidebarMenuItem } from './SidebarMenuItem';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Folder } from '@/types/knowledge';

interface SidebarFolderTreeProps {
  folders: Folder[];
  selectedFolder: string | null;
  onFolderSelect: (folderId: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string, force?: boolean) => Promise<void>;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void>;
  searchQuery?: string;
}

interface FolderNodeProps {
  folder: Folder;
  selectedFolder: string | null;
  onFolderSelect: (folderId: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => Promise<void>;
  onDeleteFolder: (folderId: string, force?: boolean) => Promise<void>;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void>;
  searchQuery?: string;
}

function FolderNode({
  folder,
  selectedFolder,
  onFolderSelect,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  searchQuery,
}: FolderNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const [isHovered, setIsHovered] = useState(false);

  const hasChildren = folder.children && folder.children.length > 0;
  const isSelected = selectedFolder === folder.id;

  // Filter logic based on search
  const matchesSearch = !searchQuery || folder.name.toLowerCase().includes(searchQuery.toLowerCase());
  const hasMatchingChildren = folder.children?.some(child =>
    child.name.toLowerCase().includes(searchQuery?.toLowerCase() || '')
  );

  if (!matchesSearch && !hasMatchingChildren) {
    return null;
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await onCreateFolder(folder.id, newFolderName.trim());
      setNewFolderName('');
      setIsCreating(false);
      setIsExpanded(true);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleRename = async () => {
    if (!renameValue.trim() || !onRenameFolder) return;
    try {
      await onRenameFolder(folder.id, renameValue.trim());
      setIsRenaming(false);
    } catch (error) {
      console.error('Failed to rename folder:', error);
      setRenameValue(folder.name);
    }
  };

  const handleDelete = async () => {
    try {
      await onDeleteFolder(folder.id, false);
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  return (
    <div className="relative">
      {/* Connector Line */}
      {folder.depth > 0 && (
        <div
          className="absolute left-2 top-0 bottom-0 w-px bg-sidebar-connector/40"
          style={{ left: `${8 + (folder.depth - 1) * 16}px` }}
        />
      )}

      <div
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isRenaming ? (
          /* Rename Input */
          <div className="px-4 py-2" style={{ paddingLeft: `${16 + folder.depth * 16}px` }}>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setIsRenaming(false);
                  setRenameValue(folder.name);
                }
              }}
              onBlur={handleRename}
              autoFocus
              className="h-7 text-sm bg-sidebar-accent border-sidebar-primary"
            />
          </div>
        ) : (
          /* Folder Item */
          <div className="flex items-center group/item">
            <button
              onClick={() => onFolderSelect(folder.id)}
              className={cn(
                'flex-1 flex items-center gap-2 px-4 py-2.5 text-sm font-medium',
                'transition-all duration-200',
                'sidebar-menu-item-hover',
                isSelected && 'sidebar-menu-item-active',
                !isSelected && 'text-sidebar-foreground hover:text-sidebar-accent-foreground'
              )}
              style={{ paddingLeft: `${16 + folder.depth * 16}px` }}
            >
              {/* Expand/Collapse Icon */}
              {hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className="p-0.5 hover:bg-sidebar-accent rounded transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-sidebar-icon" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-sidebar-icon" />
                  )}
                </button>
              )}
              {!hasChildren && <div className="w-4" />}

              {/* Folder Icon */}
              {isSelected || isExpanded ? (
                <FolderOpen className={cn(
                  'h-4 w-4 flex-shrink-0',
                  isSelected ? 'text-sidebar-primary' : 'text-sidebar-icon'
                )} />
              ) : (
                <FolderIcon className="h-4 w-4 flex-shrink-0 text-sidebar-icon" />
              )}

              {/* Folder Name */}
              <span className="flex-1 text-left truncate">{folder.name}</span>
            </button>

            {/* Actions Menu */}
            {isHovered && (
              <div className="pr-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-sidebar-accent"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5 text-sidebar-icon" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setIsCreating(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      New Subfolder
                    </DropdownMenuItem>
                    {onRenameFolder && (
                      <DropdownMenuItem onClick={() => setIsRenaming(true)}>
                        <Edit2 className="mr-2 h-4 w-4" />
                        Rename
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Folder Input */}
      {isCreating && (
        <div className="px-4 py-2" style={{ paddingLeft: `${32 + folder.depth * 16}px` }}>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') {
                setIsCreating(false);
                setNewFolderName('');
              }
            }}
            onBlur={handleCreateFolder}
            placeholder="Folder name..."
            autoFocus
            className="h-7 text-sm bg-sidebar-accent border-sidebar-primary"
          />
        </div>
      )}

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="relative">
          {folder.children?.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              selectedFolder={selectedFolder}
              onFolderSelect={onFolderSelect}
              onCreateFolder={onCreateFolder}
              onDeleteFolder={onDeleteFolder}
              onRenameFolder={onRenameFolder}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarFolderTree({
  folders,
  selectedFolder,
  onFolderSelect,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  searchQuery,
}: SidebarFolderTreeProps) {
  return (
    <div className="space-y-0.5">
      {folders.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          selectedFolder={selectedFolder}
          onFolderSelect={onFolderSelect}
          onCreateFolder={onCreateFolder}
          onDeleteFolder={onDeleteFolder}
          onRenameFolder={onRenameFolder}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}
