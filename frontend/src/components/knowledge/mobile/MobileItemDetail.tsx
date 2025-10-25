import { useState } from 'react';
import {
  X,
  FileText,
  Clock,
  Download,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/apiClient';
import type { KnowledgeItemMetadata } from '@/types/knowledge';
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

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  content_type: string;
  source_url?: string;
  metadata?: KnowledgeItemMetadata | null;
  created_at: string;
  updated_at: string;
  is_chunked?: boolean;
  total_chunks?: number;
  processing_status?: string;
}

interface MobileItemDetailProps {
  item: KnowledgeItem | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (itemId: string) => void;
}

/**
 * Full-screen mobile detail view with tabbed interface
 * Features: content tabs, copy/share actions, swipe-down to close
 */
export function MobileItemDetail({
  item,
  isOpen,
  onClose,
  onDelete,
}: MobileItemDetailProps) {
  const { toast } = useToast();
  const { user, accessToken } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  if (!item) return null;

  // Handle viewing source file stored in cloud storage
  const handleViewSource = async () => {
    if (!item || !user || !accessToken) return;

    setIsLoadingUrl(true);
    try {
      const metadata = (item.metadata ?? {}) as KnowledgeItemMetadata;
      const safeTitle = item.title.replace(/[^a-zA-Z0-9\s]/g, '_').trim() || 'download';

      const inferExtension = (mimeType?: string) => {
        const map: Record<string, string> = {
          'application/pdf': '.pdf',
          'text/plain': '.txt',
          'text/markdown': '.md',
          'text/csv': '.csv',
          'application/json': '.json',
          'application/zip': '.zip',
          'application/msword': '.doc',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
          'application/vnd.ms-excel': '.xls',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
          'application/vnd.ms-powerpoint': '.ppt',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        };

        return mimeType ? map[mimeType] : undefined;
      };

      try {
        const download = await apiClient.downloadItemFile(item.id, { userId: user.id, accessToken });
        const inferredExt = inferExtension(download.contentType || metadata?.mime_type);
        const metaFilename =
          typeof metadata?.original_filename === 'string' && metadata.original_filename.trim().length > 0
            ? metadata.original_filename.trim()
            : undefined;

        let finalName = download.filename?.trim() || metaFilename;

        if (finalName && !finalName.includes('.') && inferredExt) {
          finalName = `${finalName}${inferredExt}`;
        }

        if (!finalName) {
          finalName = inferredExt ? `${safeTitle}${inferredExt}` : `${safeTitle}.txt`;
        }

        apiClient.downloadBlob(download.blob, finalName);
        return;
      } catch (proxyError) {
        console.warn('Direct file download failed, attempting fallback', proxyError);
      }

      try {
        const result = await apiClient.getContentDownloadUrl(item.id, { userId: user.id, accessToken }, 1);

        if (result.download_url) {
          const link = document.createElement('a');
          link.href = result.download_url;
          link.download =
            (typeof metadata?.original_filename === 'string' && metadata.original_filename) || `${safeTitle}.download`;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return;
        }
      } catch (signedUrlError) {
        console.warn('Signed URL download failed', signedUrlError);
      }

      if (item.content) {
        let content: string;
        let mimeType: string;

        if (item.content_type === 'url' && item.source_url) {
          content = `Title: ${item.title}\nURL: ${item.source_url}\n\nContent:\n${item.content}`;
          mimeType = 'text/plain';
        } else {
          content = item.content;
          mimeType = 'text/plain';
        }

        const blob = new Blob([content], { type: mimeType });
        apiClient.downloadBlob(blob, `${safeTitle}.txt`);
      } else {
        throw new Error('No downloadable content available');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download this file",
        variant: "destructive",
      });
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getContentTypeColor = (type: string) => {
    switch (type) {
      case 'text':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'url':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'file':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getProcessingStatusIcon = (status?: string) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />;
      case 'completed':
        return <Loader2 className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <Loader2 className="h-4 w-4 text-red-400" />;
      default:
        return null;
    }
  };

  const handleDelete = () => {
    onDelete(item.id);
    onClose();
  };

  // Touch handlers for swipe-down to close
  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
    setCurrentY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setCurrentY(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    const diff = currentY - startY;
    // If dragged down more than 100px, close the modal
    if (diff > 100) {
      onClose();
    }
    setIsDragging(false);
    setStartY(0);
    setCurrentY(0);
  };

  const dragOffset = isDragging ? Math.max(0, currentY - startY) : 0;

  if (!isOpen) return null;

  const metadata = (item.metadata ?? {}) as KnowledgeItemMetadata;
  const hasDownloadableFile =
    metadata?.has_file === true ||
    metadata?.stored_in_storage === true ||
    (typeof metadata?.download_url === 'string' && metadata.download_url.length > 0) ||
    (item.content && item.content.startsWith('[FILE:'));

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none"
        style={{
          transform: `translateY(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        <div
          className="w-full h-full bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800 rounded-t-3xl shadow-2xl pointer-events-auto flex flex-col"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-gray-600 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-4 pb-4 border-b border-white/10">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-white leading-tight mb-2">
                  {item.title}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`text-xs px-2 py-1 border ${getContentTypeColor(item.content_type)}`}>
                    {item.content_type}
                  </Badge>
                  {item.processing_status && (
                    <div className="flex items-center gap-1.5">
                      {getProcessingStatusIcon(item.processing_status)}
                      <span className="text-xs text-gray-400">
                        {item.is_chunked && item.total_chunks
                          ? `${item.total_chunks} chunks`
                          : item.processing_status}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="flex-shrink-0 hover:bg-white/10"
              >
                <X className="h-5 w-5 text-white" />
              </Button>
            </div>

            {/* Metadata Row */}
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                <span>Created {formatDate(item.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Content Section */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 mt-3">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
              {item.content?.startsWith('[FILE:') && hasDownloadableFile ? (
                <div className="space-y-2 text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-gray-400" />
                  <p className="text-sm text-gray-400">
                    File preview not available in this version.
                  </p>
                  {metadata?.original_filename && (
                    <p className="text-xs text-gray-500">
                      Filename: {metadata.original_filename}
                    </p>
                  )}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-200">
                  {item.content || 'No content available'}
                </pre>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="px-4 py-3 border-t border-white/10 bg-slate-900/50 backdrop-blur-xl">
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleViewSource}
                disabled={isLoadingUrl}
                variant="outline"
                className="bg-white/10 border-white/20 hover:bg-white/15"
              >
                {isLoadingUrl ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </>
                )}
              </Button>
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                variant="outline"
                className="bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Item</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete "{item.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 text-white hover:bg-white/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
