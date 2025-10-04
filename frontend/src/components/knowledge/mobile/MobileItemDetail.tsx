import { useState } from 'react';
import {
  X,
  ExternalLink,
  FileText,
  Database,
  Clock,
  Copy,
  Share2,
  Trash2,
  CheckCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
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
  metadata?: any;
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  if (!item) return null;

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
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      default:
        return null;
    }
  };

  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(item.content);
      toast({
        title: 'Copied',
        description: 'Content copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Failed',
        description: 'Could not copy content',
        variant: 'destructive',
      });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: item.content.substring(0, 200),
          url: item.source_url,
        });
      } catch (error) {
        // User cancelled share or share failed
      }
    } else {
      // Fallback: copy to clipboard
      handleCopyContent();
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
              {item.updated_at !== item.created_at && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Updated {formatDate(item.updated_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="content" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-3 grid w-auto grid-cols-3 bg-white/10">
              <TabsTrigger value="content" className="data-[state=active]:bg-blue-600">
                <FileText className="h-4 w-4 mr-1.5" />
                Content
              </TabsTrigger>
              {item.source_url && (
                <TabsTrigger value="source" className="data-[state=active]:bg-green-600">
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Source
                </TabsTrigger>
              )}
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <TabsTrigger value="metadata" className="data-[state=active]:bg-purple-600">
                  <Database className="h-4 w-4 mr-1.5" />
                  Metadata
                </TabsTrigger>
              )}
            </TabsList>

            {/* Content Tab */}
            <TabsContent
              value="content"
              className="flex-1 overflow-y-auto px-4 pb-4 mt-3"
            >
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                {item.content?.startsWith('[FILE:') && item.metadata?.storage_path ? (
                  <div className="space-y-2 text-center py-8">
                    <FileText className="h-12 w-12 mx-auto text-gray-400" />
                    <p className="text-sm text-gray-400">
                      File preview not available in this version.
                    </p>
                    {item.metadata?.original_filename && (
                      <p className="text-xs text-gray-500">
                        Filename: {item.metadata.original_filename}
                      </p>
                    )}
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-200">
                    {item.content || 'No content available'}
                  </pre>
                )}
              </div>
            </TabsContent>

            {/* Source Tab */}
            {item.source_url && (
              <TabsContent
                value="source"
                className="flex-1 overflow-y-auto px-4 pb-4 mt-3"
              >
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-2">Source URL</h4>
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 break-all text-sm underline"
                    >
                      {item.source_url}
                    </a>
                  </div>
                  <Button
                    onClick={() => window.open(item.source_url, '_blank')}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Browser
                  </Button>
                </div>
              </TabsContent>
            )}

            {/* Metadata Tab */}
            {item.metadata && Object.keys(item.metadata).length > 0 && (
              <TabsContent
                value="metadata"
                className="flex-1 overflow-y-auto px-4 pb-4 mt-3"
              >
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                  <pre className="whitespace-pre-wrap break-words text-xs text-gray-300 leading-relaxed">
                    {JSON.stringify(item.metadata, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            )}
          </Tabs>

          {/* Action Bar */}
          <div className="px-4 py-3 border-t border-white/10 bg-slate-900/50 backdrop-blur-xl">
            <div className="flex gap-2">
              <Button
                onClick={handleCopyContent}
                variant="outline"
                className="flex-1 bg-white/10 border-white/20 hover:bg-white/15"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button
                onClick={handleShare}
                variant="outline"
                className="flex-1 bg-white/10 border-white/20 hover:bg-white/15"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                variant="outline"
                className="flex-1 bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400"
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
