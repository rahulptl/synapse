import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Edit2, FolderInput, Trash2, RefreshCw, Folder, MessageSquare } from 'lucide-react';

interface Folder {
  id: string;
  name: string;
  children?: Folder[];
}

interface KnowledgeItemContextMenuProps {
  itemId: string;
  itemTitle: string;
  currentFolderId: string;
  folders: Folder[];
  onRename: (itemId: string, newTitle: string) => Promise<void>;
  onMove: (itemId: string, targetFolderId: string) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
  onReprocess?: (itemId: string) => Promise<void>;
  children: React.ReactNode;
}

export function KnowledgeItemContextMenu({
  itemId,
  itemTitle,
  currentFolderId,
  folders,
  onRename,
  onMove,
  onDelete,
  onReprocess,
  children,
}: KnowledgeItemContextMenuProps) {
  const navigate = useNavigate();
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [newTitle, setNewTitle] = useState(itemTitle);
  const [selectedTargetFolder, setSelectedTargetFolder] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const handleRename = async () => {
    if (!newTitle.trim() || newTitle === itemTitle) {
      setShowRenameDialog(false);
      return;
    }

    setIsRenaming(true);
    try {
      await onRename(itemId, newTitle.trim());
      setShowRenameDialog(false);
    } catch (error) {
      console.error('Rename failed:', error);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleMove = async () => {
    if (!selectedTargetFolder || selectedTargetFolder === currentFolderId) {
      setShowMoveDialog(false);
      return;
    }

    setIsMoving(true);
    try {
      await onMove(itemId, selectedTargetFolder);
      setShowMoveDialog(false);
    } catch (error) {
      console.error('Move failed:', error);
    } finally {
      setIsMoving(false);
    }
  };

  const renderFolderTree = (folders: Folder[], depth: number = 0) => {
    return folders.map((folder) => (
      <div key={folder.id}>
        <button
          className={`w-full text-left px-3 py-2 hover:bg-white/10 rounded-md transition-colors ${
            selectedTargetFolder === folder.id ? 'bg-blue-500/30 text-blue-200' : 'text-gray-200'
          } ${folder.id === currentFolderId ? 'opacity-50 cursor-not-allowed' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => {
            if (folder.id !== currentFolderId) {
              setSelectedTargetFolder(folder.id);
            }
          }}
          disabled={folder.id === currentFolderId}
        >
          <div className="flex items-center space-x-2">
            <Folder className="h-4 w-4" />
            <span className="text-sm">{folder.name}</span>
            {folder.id === currentFolderId && (
              <span className="text-xs text-gray-400">(current)</span>
            )}
          </div>
        </button>
        {folder.children && folder.children.length > 0 && (
          <div>{renderFolderTree(folder.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56 bg-slate-900 border-white/20 text-white">
          <ContextMenuItem
            onClick={() => {
              setNewTitle(itemTitle);
              setShowRenameDialog(true);
            }}
            className="hover:bg-white/10 focus:bg-white/10 cursor-pointer"
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Rename
          </ContextMenuItem>

          <ContextMenuItem
            onClick={() => {
              setSelectedTargetFolder(null);
              setShowMoveDialog(true);
            }}
            className="hover:bg-white/10 focus:bg-white/10 cursor-pointer"
          >
            <FolderInput className="h-4 w-4 mr-2" />
            Move to...
          </ContextMenuItem>

          <ContextMenuSeparator className="bg-white/10" />

          <ContextMenuItem
            onClick={() => {
              navigate('/chat', {
                state: {
                  preSelectedItem: {
                    id: itemId,
                    title: itemTitle,
                    type: 'item'
                  }
                }
              });
            }}
            className="hover:bg-blue-500/20 focus:bg-blue-500/20 text-blue-400 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Chat with this
          </ContextMenuItem>

          <ContextMenuSeparator className="bg-white/10" />

          {onReprocess && (
            <>
              <ContextMenuItem
                onClick={() => onReprocess(itemId)}
                className="hover:bg-white/10 focus:bg-white/10 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reprocess
              </ContextMenuItem>
              <ContextMenuSeparator className="bg-white/10" />
            </>
          )}

          <ContextMenuItem
            onClick={() => onDelete(itemId)}
            className="hover:bg-red-500/20 focus:bg-red-500/20 text-red-400 cursor-pointer"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="bg-slate-900 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle>Rename Item</DialogTitle>
            <DialogDescription className="text-gray-400">
              Enter a new title for this item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-title">Title</Label>
              <Input
                id="new-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRename();
                  } else if (e.key === 'Escape') {
                    setShowRenameDialog(false);
                  }
                }}
                className="bg-white/10 border-white/20 text-white"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameDialog(false)}
              className="bg-transparent border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={isRenaming || !newTitle.trim()}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isRenaming ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="bg-slate-900 border-white/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Move Item</DialogTitle>
            <DialogDescription className="text-gray-400">
              Select a destination folder for "{itemTitle}".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="max-h-80 overflow-y-auto border border-white/10 rounded-lg p-2 bg-white/5">
              {folders.length > 0 ? (
                renderFolderTree(folders)
              ) : (
                <p className="text-center text-gray-400 py-4">No folders available</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMoveDialog(false)}
              className="bg-transparent border-white/20 text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMove}
              disabled={isMoving || !selectedTargetFolder || selectedTargetFolder === currentFolderId}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isMoving ? 'Moving...' : 'Move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
