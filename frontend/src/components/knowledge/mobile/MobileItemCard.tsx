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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SwipeableItem } from './SwipeableItem';

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

interface MobileItemCardProps {
  item: KnowledgeItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onReprocess?: () => void;
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
}: MobileItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

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

  const canExpand = item.content && item.content.length > 120 && !item.content.startsWith('[FILE:');

  return (
    <SwipeableItem onDelete={onDelete} onReprocess={onReprocess}>
      <Card
        className={`transition-all duration-200 border-0 ${
          isSelected
            ? 'bg-gradient-to-r from-blue-500/25 to-purple-500/25 ring-2 ring-blue-400/50'
            : 'bg-white/8 active:bg-white/12'
        }`}
        onClick={onSelect}
      >
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start gap-3 mb-3">
            <div
              className={`p-2.5 rounded-lg flex-shrink-0 ${
                isSelected
                  ? 'bg-blue-400/30 text-blue-200'
                  : 'bg-white/10 text-gray-300'
              }`}
            >
              {getContentTypeIcon(item.content_type)}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-base leading-tight text-white mb-1.5 line-clamp-2">
                {item.title}
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-xs px-2 py-0.5 border ${getContentTypeColor(item.content_type)}`}>
                  {item.content_type}
                </Badge>
                {item.processing_status && (
                  <div className="flex items-center gap-1">
                    {getProcessingStatusIcon(item.processing_status)}
                    <span className="text-xs text-gray-400">
                      {getProcessingStatusText(item)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content Preview */}
          <div className="mb-3">
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
              {getPreviewText()}
            </p>
            {canExpand && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="mt-2 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Show more
                  </>
                )}
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-gray-400">
              <Calendar className="h-3.5 w-3.5" />
              <span className="font-medium">{formatDate(item.created_at)}</span>
            </div>

            {item.source_url && (
              <div className="flex items-center gap-1 text-gray-400 max-w-[150px]">
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate text-xs">
                  {new URL(item.source_url).hostname}
                </span>
              </div>
            )}
          </div>

          {/* Swipe Hint - shown on first few items */}
          {!isSelected && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <p className="text-xs text-gray-500 text-center">
                Swipe left to delete • Swipe right to reprocess
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </SwipeableItem>
  );
}
