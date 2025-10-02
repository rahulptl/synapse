import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, X, File, Image, FileText, FileEdit, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/apiClient';
import { useAuth } from '@/hooks/useAuth';

interface FileUploadProps {
  folderId: string;
  onUploadComplete: () => void;
}

interface FileUploadProgress {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export function FileUpload({ folderId, onUploadComplete }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<FileUploadProgress[]>([]);
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [textContent, setTextContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user, session } = useAuth();

  const getAuthData = () => {
    if (!user || !session?.access_token) {
      throw new Error('User not authenticated');
    }
    return {
      userId: user.id,
      accessToken: session.access_token,
    };
  };

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles = Array.from(selectedFiles);
    setFiles(prev => [...prev, ...newFiles]);
    
    // Auto-set title from first file if not set
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

  const handleUpload = async () => {
    if (!files.length || !title.trim()) {
      toast({
        title: "Error",
        description: "Please select at least one file and provide a title",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    // Initialize progress tracking
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

        // Update status to uploading
        setUploadProgress(prev =>
          prev.map((p, idx) => idx === i ? { ...p, status: 'uploading', progress: 0 } : p)
        );

        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('folder_id', folderId);
          formData.append('title', files.length === 1 ? title : `${title} - ${file.name}`);
          if (description) formData.append('description', description);

          // Simulate progress (since we don't have real upload progress from fetch)
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

          // Mark as success
          setUploadProgress(prev =>
            prev.map((p, idx) => idx === i ? { ...p, status: 'success', progress: 100 } : p)
          );
          successCount++;

        } catch (error) {
          // Mark as error
          setUploadProgress(prev =>
            prev.map((p, idx) =>
              idx === i
                ? { ...p, status: 'error', progress: 0, error: 'Upload failed' }
                : p
            )
          );
          errorCount++;
          console.error(`Failed to upload ${file.name}:`, error);
        }
      }

      if (successCount > 0) {
        toast({
          title: "Success",
          description: `${successCount} file(s) uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        });

        // Reset form after a delay to show final status
        setTimeout(() => {
          setFiles([]);
          setTitle('');
          setDescription('');
          setUploadProgress([]);
          onUploadComplete();
        }, 2000);
      } else {
        toast({
          title: "Error",
          description: "All files failed to upload",
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Upload error:', error);
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
        title: "Success",
        description: "Text note created successfully",
      });

      // Reset form
      setTitle('');
      setTextContent('');
      setDescription('');
      setShowTextEditor(false);
      onUploadComplete();

    } catch (error) {
      console.error('Create text note error:', error);
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
    <Card className="mb-6 bg-white/5 backdrop-blur-xl border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-white">
            {showTextEditor ? <FileEdit className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
            {showTextEditor ? 'Create Text Note' : 'Upload Files'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowTextEditor(!showTextEditor);
              setFiles([]);
              setTitle('');
              setTextContent('');
              setDescription('');
            }}
            className="text-gray-300 hover:text-white"
          >
            {showTextEditor ? 'Switch to File Upload' : 'Create Text Note'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showTextEditor ? (
          <>
            {/* File Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                dragOver
                  ? 'border-blue-400 bg-blue-500/10'
                  : 'border-white/20 hover:border-white/40 bg-white/5'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-300">
                Drag and drop files here, or click to select files
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Supports images, PDFs, documents, and more
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

            {/* Selected Files with Progress */}
            {files.length > 0 && (
              <div className="space-y-2">
                <Label className="text-gray-300">Selected Files</Label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {files.map((file, index) => {
                    const progress = uploadProgress[index];
                    return (
                      <div
                        key={index}
                        className="p-3 bg-white/10 rounded-lg space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {getFileIcon(file)}
                            <span className="text-sm truncate text-gray-200">{file.name}</span>
                            <span className="text-xs text-gray-400">
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
                          <Progress value={progress.progress} className="h-1" />
                        )}
                        {progress?.error && (
                          <p className="text-xs text-red-400">{progress.error}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Text Editor */
          <div>
            <Label htmlFor="text-content" className="text-gray-300">Content *</Label>
            <Textarea
              id="text-content"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Enter your text content here..."
              rows={10}
              className="bg-white/10 border-white/20 text-gray-200 placeholder:text-gray-500"
            />
          </div>
        )}

        {/* Title Input */}
        <div>
          <Label htmlFor="upload-title" className="text-gray-300">Title *</Label>
          <Input
            id="upload-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a title"
            className="bg-white/10 border-white/20 text-gray-200 placeholder:text-gray-500"
            disabled={uploading}
          />
        </div>

        {/* Description Input */}
        <div>
          <Label htmlFor="upload-description" className="text-gray-300">Description</Label>
          <Textarea
            id="upload-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description..."
            rows={3}
            className="bg-white/10 border-white/20 text-gray-200 placeholder:text-gray-500"
            disabled={uploading}
          />
        </div>

        {/* Action Buttons */}
        <Button
          onClick={showTextEditor ? handleCreateTextNote : handleUpload}
          disabled={
            uploading ||
            !title.trim() ||
            (showTextEditor ? !textContent.trim() : !files.length)
          }
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {showTextEditor ? 'Creating...' : 'Uploading...'}
            </>
          ) : (
            showTextEditor ? 'Create Text Note' : `Upload ${files.length} File(s)`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}