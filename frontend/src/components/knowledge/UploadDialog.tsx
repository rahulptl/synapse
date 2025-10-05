import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, X, File, Image, FileText, FileEdit, Loader2, CheckCircle, XCircle, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/apiClient';
import { useAuth } from '@/hooks/useAuth';

interface UploadDialogProps {
  folderId: string;
  onUploadComplete: () => void;
}

interface FileUploadProgress {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export function UploadDialog({ folderId, onUploadComplete }: UploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [textContent, setTextContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user, accessToken } = useAuth();

  const getAuthData = () => {
    if (!user || !accessToken) {
      throw new Error('User not authenticated');
    }
    return {
      userId: user.id,
      accessToken,
    };
  };

  const resetForm = () => {
    setFiles([]);
    setTitle('');
    setDescription('');
    setTextContent('');
    setUploadProgress([]);
    setDragOver(false);
  };

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles = Array.from(selectedFiles);

    // Validate file sizes (now supports up to 5GB via signed URLs)
    const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB (GCS limit)
    const oversizedFiles = newFiles.filter(f => f.size > MAX_FILE_SIZE);

    if (oversizedFiles.length > 0) {
      const fileList = oversizedFiles.map(f =>
        `${f.name} (${(f.size / (1024 * 1024 * 1024)).toFixed(2)}GB)`
      ).join(', ');

      toast({
        title: "File too large",
        description: `${oversizedFiles.length} file(s) exceed 5GB limit: ${fileList}`,
        variant: "destructive",
      });
      return;
    }

    // Info toast for large files (>32MB) that will use direct GCS upload
    const largeFiles = newFiles.filter(f => f.size > 32 * 1024 * 1024);
    if (largeFiles.length > 0) {
      toast({
        title: "Large file detected",
        description: `${largeFiles.length} file(s) will upload directly to cloud storage (may take longer)`,
      });
    }

    setFiles(prev => [...prev, ...newFiles]);

    if (!title && newFiles.length > 0) {
      const fileName = newFiles[0].name;
      const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
      setTitle(nameWithoutExt);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (file.type === 'application/pdf') return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleUploadFiles = async () => {
    if (!files.length || !title.trim()) {
      toast({
        title: "Error",
        description: "Please select at least one file and provide a title",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    const progressArray: FileUploadProgress[] = files.map(file => ({
      file,
      status: 'pending',
      progress: 0,
    }));
    setUploadProgress(progressArray);

    try {
      const auth = getAuthData();
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const itemTitle = files.length === 1 ? title : `${title} - ${file.name}`;

        setUploadProgress(prev =>
          prev.map((p, idx) => idx === i ? { ...p, status: 'uploading', progress: 0 } : p)
        );

        try {
          const LARGE_FILE_THRESHOLD = 32 * 1024 * 1024; // 32MB Cloud Run limit

          // Large file: Use signed URL for direct GCS upload
          if (file.size > LARGE_FILE_THRESHOLD) {
            // Step 1: Get signed URL from backend
            const { upload_url, storage_path } = await apiClient.getSignedUploadUrl(
              {
                filename: file.name,
                content_type: file.type || 'application/octet-stream',
                folder_id: folderId,
                title: itemTitle,
                description,
                file_size: file.size,
              },
              auth
            );

            // Step 2: Upload directly to GCS with progress tracking
            await apiClient.uploadToSignedUrl(upload_url, file, (progress) => {
              setUploadProgress(prev =>
                prev.map((p, idx) => idx === i ? { ...p, progress } : p)
              );
            });

            // Step 3: Notify backend that upload is complete
            await apiClient.notifyUploadComplete(
              {
                storage_path,
                folder_id: folderId,
                title: itemTitle,
                description,
                file_size: file.size,
                content_type: file.type || 'application/octet-stream',
              },
              auth
            );
          }
          // Regular file: Use standard upload through Cloud Run
          else {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder_id', folderId);
            formData.append('title', itemTitle);
            if (description) formData.append('description', description);

            // Use real progress tracking for files >10MB
            if (file.size > 10 * 1024 * 1024) {
              await apiClient.uploadFileWithProgress(formData, auth, (progress) => {
                setUploadProgress(prev =>
                  prev.map((p, idx) => idx === i ? { ...p, progress } : p)
                );
              });
            } else {
              // Simulated progress for small files
              const progressInterval = setInterval(() => {
                setUploadProgress(prev =>
                  prev.map((p, idx) =>
                    idx === i && p.progress < 90
                      ? { ...p, progress: p.progress + 10 }
                      : p
                  )
                );
              }, 200);

              await apiClient.uploadFile(formData, auth);
              clearInterval(progressInterval);
            }
          }

          setUploadProgress(prev =>
            prev.map((p, idx) => idx === i ? { ...p, status: 'success', progress: 100 } : p)
          );
          successCount++;

        } catch (error) {
          setUploadProgress(prev =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: 'error', progress: 0, error: 'Upload failed' }
                : p
            )
          );
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Uploaded",
          description: `${successCount} file(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        });

        // Refresh folder content immediately so uploaded items appear
        onUploadComplete();

        // Close dialog after showing success
        setTimeout(() => {
          resetForm();
          setOpen(false);
        }, 1500);
      } else {
        toast({
          title: "Error",
          description: "All files failed to upload",
          variant: "destructive",
        });
      }

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCreateTextNote = async () => {
    if (!title.trim() || !textContent.trim()) {
      toast({
        title: "Error",
        description: "Please provide both title and content",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const auth = getAuthData();

      await apiClient.createContent({
        folder_id: folderId,
        title: title.trim(),
        content: textContent.trim(),
        content_type: 'text',
        description: description || '',
      }, auth);

      toast({
        title: "Created",
        description: "Text note created",
      });

      resetForm();
      setOpen(false);
      onUploadComplete();

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create text note",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Content
      </Button>

      <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] bg-slate-900 border-slate-700 flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-white text-xl">Add Content to Folder</DialogTitle>
            <DialogDescription className="text-gray-400">
              Upload files or create a text note
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="upload" className="w-full flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2 bg-slate-800">
              <TabsTrigger value="upload" className="data-[state=active]:bg-blue-600">
                <Upload className="h-4 w-4 mr-2" />
                Upload Files
              </TabsTrigger>
              <TabsTrigger value="text" className="data-[state=active]:bg-purple-600">
                <FileEdit className="h-4 w-4 mr-2" />
                Create Text
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4 mt-4 overflow-y-auto flex-1 min-h-0">
              {/* File Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
                  dragOver
                    ? 'border-blue-400 bg-blue-500/10 scale-[1.02]'
                    : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm text-gray-300 font-medium">
                  Drop files here or click to browse
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supports PDFs, documents, images, and more
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
                accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp3,.wav,.m4a"
              />

              {/* Selected Files */}
              {files.length > 0 && (
                <div className="space-y-2">
                  {/* File count header */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm text-gray-400">
                      {files.length} file{files.length > 1 ? 's' : ''} selected
                    </span>
                    {!uploading && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFiles([])}
                        className="h-7 text-xs text-gray-400 hover:text-red-400"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>

                  {/* Scrollable file list */}
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {files.map((file, index) => {
                    const progress = uploadProgress[index];
                    return (
                      <div
                        key={index}
                        className="p-3 bg-slate-800 rounded-lg space-y-2 border border-slate-700"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {getFileIcon(file)}
                            <span
                              className="text-sm truncate text-gray-200"
                              title={file.name}
                            >
                              {file.name}
                            </span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {formatFileSize(file.size)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {progress?.status === 'uploading' && (
                              <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                            )}
                            {progress?.status === 'success' && (
                              <CheckCircle className="h-4 w-4 text-green-400" />
                            )}
                            {progress?.status === 'error' && (
                              <XCircle className="h-4 w-4 text-red-400" />
                            )}
                            {!uploading && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFile(index)}
                                className="h-6 w-6 p-0 hover:bg-red-500/20 text-gray-400 hover:text-red-400"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {progress && progress.status === 'uploading' && (
                          <Progress value={progress.progress} className="h-1.5" />
                        )}
                      </div>
                    );
                  })}
                  </div>

                  {/* Scroll indicator */}
                  {files.length > 4 && (
                    <div className="text-xs text-center text-gray-500 py-1">
                      ↕ Scroll to see all files
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="upload-title" className="text-gray-300">Title *</Label>
                <Input
                  id="upload-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title"
                  className="bg-slate-800 border-slate-600 text-gray-200 mt-1.5"
                  disabled={uploading}
                />
              </div>

              <div>
                <Label htmlFor="upload-description" className="text-gray-300">Description</Label>
                <Textarea
                  id="upload-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={2}
                  className="bg-slate-800 border-slate-600 text-gray-200 mt-1.5"
                  disabled={uploading}
                />
              </div>

              <Button
                onClick={handleUploadFiles}
                disabled={uploading || !title.trim() || !files.length}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading {files.length} file{files.length > 1 ? 's' : ''}...
                  </>
                ) : (
                  `Upload ${files.length} File${files.length > 1 ? 's' : ''}`
                )}
              </Button>
            </TabsContent>

            <TabsContent value="text" className="space-y-4 mt-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <Label htmlFor="text-title" className="text-gray-300">Title *</Label>
                <Input
                  id="text-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title for your note"
                  className="bg-slate-800 border-slate-600 text-gray-200 mt-1.5"
                  disabled={uploading}
                />
              </div>

              <div>
                <Label htmlFor="text-content" className="text-gray-300">Content *</Label>
                <Textarea
                  id="text-content"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Write your note here..."
                  rows={8}
                  className="bg-slate-800 border-slate-600 text-gray-200 mt-1.5 font-mono text-sm"
                  disabled={uploading}
                />
              </div>

              <div>
                <Label htmlFor="text-description" className="text-gray-300">Description</Label>
                <Textarea
                  id="text-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={2}
                  className="bg-slate-800 border-slate-600 text-gray-200 mt-1.5"
                  disabled={uploading}
                />
              </div>

              <Button
                onClick={handleCreateTextNote}
                disabled={uploading || !title.trim() || !textContent.trim()}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Text Note'
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
