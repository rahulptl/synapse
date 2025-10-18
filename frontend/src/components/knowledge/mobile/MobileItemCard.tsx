import { useState } from 'react';
import {
  FileText,
  ExternalLink,
  Calendar,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Loader2,
  AlertCircle,
  Download,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SwipeableItem } from './SwipeableItem';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  content_type: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_chunked?: boolean;
  total_chunks?: number;
  processing_status?: string;
  vector_count?: number;
  vectors_with_embeddings?: number;
  is_searchable?: boolean;
}

interface MobileItemCardProps {
  item: KnowledgeItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onReprocess?: () => void;
  onDownload?: () => void;
}

/**
 * Mobile-optimized item card with swipe actions
 * Features: collapsible preview, status indicators, swipe to delete/reprocess
 */
export function MobileItemCard({
  item,
  isSelected,
  onSelect,
  onDelete,
  onReprocess,
  onDownload,
}: MobileItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { user, accessToken } = useAuth();
  const { toast } = useToast();

  const formatDate = (dateString: string) => {
    // Parse date - handle both ISO strings and regular date strings
    const date = new Date(dateString);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Unknown';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Handle negative differences (future dates, likely timezone issue)
    if (diffMs < 0) {
      return 'now';
    }

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'url':
        return <ExternalLink className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
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
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-400" />;
      case 'completed':
        return <CheckCircle className="h-3.5 w-3.5 text-green-400" />;
      case 'failed':
        return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
      default:
        return null;
    }
  };

  const getProcessingStatusText = (item: KnowledgeItem) => {
    if (item.is_chunked && item.total_chunks && item.total_chunks > 0) {
      return `${item.total_chunks} chunks`;
    }

    switch (item.processing_status) {
      case 'processing':
        return 'Processing...';
      case 'completed':
        return 'Ready';
      case 'failed':
        return 'Failed';
      case 'pending':
        return 'Pending';
      default:
        return item.content ? 'Ready' : 'No content';
    }
  };

  const getPreviewText = () => {
    if (!item.content) return 'No content available';

    // Remove file markers
    if (item.content.startsWith('[FILE:')) {
      return 'File content stored - tap to view details';
    }

    const maxLength = isExpanded ? 500 : 120;
    return item.content.length > maxLength
      ? item.content.substring(0, maxLength) + '...'
      : item.content;
  };

  const [showSwipeHint, setShowSwipeHint] = useState(true);

  const handleDownload = async () => {
    try {
      // Import apiClient dynamically to avoid circular dependencies
      const { apiClient } = await import('@/services/apiClient');

      if (!user || !accessToken) {
        console.error('Authentication credentials not found');
        toast({
          title: 'Authentication required',
          description: 'Please sign in again to download files.',
          variant: 'destructive',
        });
        return;
      }

      const auth = { userId: user.id, accessToken };

      // Generate a safe filename from the title
      const fileName = `${item.title.replace(/[^a-zA-Z0-9\s]/g, '_').trim()}`;

      try {
        // Try to get a signed URL from backend (for cloud storage files)
        const downloadResponse = await apiClient.getContentDownloadUrl(item.id, auth);

        if (downloadResponse.download_url) {
          // For cloud storage files, redirect to signed URL
          const link = document.createElement('a');
          link.href = downloadResponse.download_url;
          link.download = fileName;
          link.target = '_blank'; // Open in new tab for cloud files
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (signedUrlError) {
        // If signed URL fails, try downloading as zip (works for all content types)
        try {
          const blob = await apiClient.exportItemAsZip(item.id, auth);
          apiClient.downloadBlob(blob, `${fileName}.zip`);
        } catch (zipError) {
          console.error('Both signed URL and zip download failed:', zipError);

          // Final fallback: use client-side generation for text content
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
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${fileName}.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        }
      }
    } catch (error) {
      console.error('Failed to download item:', error);
    }
  };

  return (
    <SwipeableItem
      onDelete={onDelete}
      onReprocess={onReprocess}
      onDownload={onDownload || handleDownload}
      onSwipe={() => setShowSwipeHint(false)}
    >
      <Card
        className={`transition-all duration-200 border-0 ${
          isSelected
            ? 'bg-gradient-to-r from-blue-500/25 to-purple-500/25 ring-1 ring-blue-400/50'
            : 'bg-white/8 active:bg-white/12'
        }`}
        onClick={() => {
          onSelect();
          setIsExpanded(!isExpanded);
        }}
      >
        <CardContent className="p-3">
          {/* Compact Header - Always Visible */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Smaller icon */}
              <div className={`p-1.5 rounded ${
                isSelected ? 'bg-blue-400/30' : 'bg-white/10'
              }`}>
                {getContentTypeIcon(item.content_type)}
              </div>

              {/* Title - single line */}
              <h4 className="font-medium text-sm text-white truncate flex-1">
                {item.title}
              </h4>

              {/* Status indicator */}
              {getProcessingStatusIcon(item.processing_status)}
            </div>

            {/* Timestamp */}
            <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
              {formatDate(item.created_at)}
            </span>
          </div>

          {/* Expandable Content - Only when tapped */}
          {isExpanded && (
            <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
              {/* Content Type Badge & Status */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-xs px-2 py-0.5 ${getContentTypeColor(item.content_type)}`}>
                  {item.content_type}
                </Badge>
                {item.processing_status && (
                  <span className="text-xs text-gray-400">
                    {getProcessingStatusText(item)}
                  </span>
                )}
              </div>

              {/* Content Preview */}
              <p className="text-sm text-gray-300 leading-relaxed">
                {item.content && !item.content.startsWith('[FILE:')
                  ? item.content.substring(0, 200) + (item.content.length > 200 ? '...' : '')
                  : 'File content - tap to view'}
              </p>

              {/* Metadata */}
              {item.source_url && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate">{new URL(item.source_url).hostname}</span>
                </div>
              )}

              {/* Item ID for reference */}
              <div className="text-xs text-gray-500 font-mono">
                ID: {item.id.substring(0, 8)}...
              </div>
            </div>
          )}

          {/* Swipe Hint - only show once */}
          {showSwipeHint && !isExpanded && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <p className="text-xs text-gray-500 text-center">
                ← Swipe for actions • Tap for details →
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </SwipeableItem>
  );
}
