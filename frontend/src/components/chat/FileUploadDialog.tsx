import { useState, useEffect, useRef } from 'react';
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
import { Folder, FolderOpen, Upload, X, FileIcon, ChevronRight, ChevronDown } from 'lucide-react';

interface FolderItem {
  id: string;
  name: string;
  children?: FolderItem[];
}

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: FolderItem[];
  onUpload: (file: File, folderId: string, customTitle?: string) => Promise<void>;
}

export function FileUploadDialog({
  open,
  onOpenChange,
  folders,
  onUpload,
}: FileUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Reset state when dialog opens
      setSelectedFile(null);
      setSelectedFolderId(null);
      setCustomTitle('');
      setExpandedFolders(new Set());
      console.log('[FILE_UPLOAD_DIALOG] Opened with folders:', folders);
    }
  }, [open, folders]);

  useEffect(() => {
    // Auto-fill title when file is selected
    if (selectedFile) {
      setCustomTitle(selectedFile.name);
    }
  }, [selectedFile]);

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setCustomTitle('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    if (!selectedFile || !selectedFolderId) return;

    setIsProcessing(true);
    try {
      await onUpload(selectedFile, selectedFolderId, customTitle);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to upload:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderFolderTree = (folders: FolderItem[], depth: number = 0): JSX.Element[] => {
    return folders.map((folder) => {
      const hasChildren = folder.children && folder.children.length > 0;
      const isExpanded = expandedFolders.has(folder.id);
      const isSelected = selectedFolderId === folder.id;

      console.log(`[RENDER_FOLDER] ${folder.name}: hasChildren=${hasChildren}, children=${folder.children?.length || 0}, depth=${depth}`);

      return (
        <div key={folder.id} className="select-none">
          <div
            className={`flex items-center group rounded-lg transition-all duration-200 ${
              isSelected
                ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/20 shadow-sm'
                : 'hover:bg-slate-700/50'
            }`}
            style={{ paddingLeft: `${depth * 20 + 8}px` }}
          >
            {/* Expand/Collapse button for folders with children */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(folder.id);
                }}
                className="p-1.5 hover:bg-slate-600/50 rounded transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                )}
              </button>
            ) : (
              <div className="w-6" />
            )}

            {/* Folder button */}
            <button
              onClick={() => setSelectedFolderId(folder.id)}
              className="flex-1 flex items-center space-x-2.5 px-2 py-2.5 rounded-lg transition-colors"
            >
              {/* Folder icon */}
              <div className={`transition-all duration-200 ${isSelected ? 'scale-110' : ''}`}>
                {isSelected ? (
                  <FolderOpen className="h-4 w-4 text-blue-400" />
                ) : (
                  <Folder className={`h-4 w-4 ${hasChildren ? 'text-amber-400' : 'text-gray-400'}`} />
                )}
              </div>

              {/* Folder name */}
              <span
                className={`text-sm font-medium truncate ${
                  isSelected
                    ? 'text-blue-200'
                    : 'text-gray-200 group-hover:text-white'
                }`}
              >
                {folder.name.charAt(0).toUpperCase() + folder.name.slice(1)}
              </span>

              {/* Child count badge */}
              {hasChildren && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-slate-700 text-gray-400">
                  {folder.children!.length}
                </span>
              )}
            </button>
          </div>

          {/* Render children with smooth animation */}
          {hasChildren && isExpanded && (
            <div className="overflow-hidden animate-in slide-in-from-top-2 duration-200">
              {renderFolderTree(folder.children!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">Upload File to Memory</DialogTitle>
          <DialogDescription className="text-gray-400">
            Select a file and choose where to save it
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* File Upload Section */}
          <div className="space-y-3">
            <Label className="text-gray-300">Select File</Label>

            {!selectedFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-600 rounded-lg p-8 hover:border-blue-500 hover:bg-slate-800/50 transition-all cursor-pointer group"
              >
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 rounded-full bg-slate-800 group-hover:bg-blue-500/20 transition-colors">
                    <Upload className="h-8 w-8 text-gray-400 group-hover:text-blue-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-300">Click to select a file</p>
                    <p className="text-xs text-gray-500 mt-1">
                      PDF, DOC, Images, Audio, Video supported
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border border-slate-600 rounded-lg p-4 bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="p-2 rounded bg-blue-500/20">
                      <FileIcon className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    className="h-8 w-8 p-0 hover:bg-red-500/20 hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp3,.wav,.m4a,.mp4,.avi,.mov"
            />
          </div>

          {/* Title Input */}
          {selectedFile && (
            <div className="space-y-2">
              <Label htmlFor="title" className="text-gray-300">
                Title (optional)
              </Label>
              <Input
                id="title"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Enter a custom title..."
                className="bg-slate-800 border-slate-600 text-gray-200"
              />
            </div>
          )}

          {/* Folder Selection */}
          {selectedFile && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-gray-300 text-sm font-medium">
                  Select Destination Folder
                </Label>
                {selectedFolderId && (
                  <span className="text-xs text-blue-400">
                    ✓ Folder selected
                  </span>
                )}
              </div>
              <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/30">
                <ScrollArea className="h-[240px] p-3">
                  {folders.length > 0 ? (
                    <div className="space-y-1">
                      {renderFolderTree(folders)}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      <Folder className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">No folders available</p>
                      <p className="text-xs mt-1.5 text-gray-500">Create a folder in Memory Bay first</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
              {selectedFolderId && (
                <div className="text-xs text-gray-500 flex items-center space-x-1">
                  <span>💡 Tip: Click chevron icons to expand/collapse folders</span>
                </div>
              )}
            </div>
          )}
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
            disabled={!selectedFile || !selectedFolderId || isProcessing}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {isProcessing ? 'Uploading...' : 'Upload to Memory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
