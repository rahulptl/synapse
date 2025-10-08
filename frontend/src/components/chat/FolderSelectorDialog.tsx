import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Folder, FolderOpen } from 'lucide-react';

interface FolderItem {
  id: string;
  name: string;
  children?: FolderItem[];
}

interface FolderSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: FolderItem[];
  onSelect: (folderId: string, customTitle?: string) => void;
  defaultTitle?: string;
  showTitleInput?: boolean;
}

export function FolderSelectorDialog({
  open,
  onOpenChange,
  folders,
  onSelect,
  defaultTitle = '',
  showTitleInput = true,
}: FolderSelectorDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState(defaultTitle);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (open) {
      setCustomTitle(defaultTitle);
      setSelectedFolderId(null);
    }
  }, [open, defaultTitle]);

  const handleConfirm = async () => {
    if (!selectedFolderId) return;

    setIsProcessing(true);
    try {
      await onSelect(selectedFolderId, showTitleInput ? customTitle : undefined);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderFolderTree = (folders: FolderItem[], depth: number = 0): JSX.Element[] => {
    return folders.map((folder) => (
      <div key={folder.id}>
        <button
          className={`w-full text-left px-3 py-2.5 hover:bg-white/10 rounded-md transition-colors ${
            selectedFolderId === folder.id
              ? 'bg-blue-500/30 text-blue-200'
              : 'text-gray-200'
          }`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => setSelectedFolderId(folder.id)}
        >
          <div className="flex items-center space-x-2">
            {selectedFolderId === folder.id ? (
              <FolderOpen className="h-4 w-4 text-blue-400" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
            <span className="text-sm font-medium">{folder.name}</span>
          </div>
        </button>
        {folder.children && folder.children.length > 0 && (
          <div>{renderFolderTree(folder.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">Save to Knowledge Base</DialogTitle>
          <DialogDescription className="text-gray-400">
            Choose a folder and optionally customize the title
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {showTitleInput && (
            <div className="space-y-2">
              <Label htmlFor="title" className="text-gray-300">
                Title
              </Label>
              <Input
                id="title"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Enter a title..."
                className="bg-slate-800 border-slate-600 text-gray-200"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-gray-300">Select Folder</Label>
            <ScrollArea className="h-[300px] border border-slate-700 rounded-md p-2 bg-slate-800/50">
              {folders.length > 0 ? (
                renderFolderTree(folders)
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No folders available</p>
                  <p className="text-xs mt-1">Create a folder in Knowledge Base first</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-transparent border-slate-600 text-gray-300 hover:bg-slate-800"
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedFolderId || isProcessing}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {isProcessing ? 'Saving...' : 'Save to Knowledge Base'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
