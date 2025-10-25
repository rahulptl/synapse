import { FileText, ExternalLink, Loader2, CheckCircle, AlertCircle, Clock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemActionsMenu } from './ItemActionsMenu';
import { Button } from '@/components/ui/button';

interface ModernItemListItemProps {
  id: string;
  title: string;
  contentType: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  isSearchable?: boolean;
  createdAt: string;
  active?: boolean;
  onClick: () => void;
  onChat?: () => void;
  onDownload?: () => void;
  onReprocess?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}

export function ModernItemListItem({
  id,
  title,
  contentType,
  status,
  isSearchable,
  createdAt,
  active = false,
  onClick,
  onChat,
  onDownload,
  onReprocess,
  onRename,
  onMove,
  onDelete,
}: ModernItemListItemProps) {
  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'url':
        return <ExternalLink className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusIcon = () => {
    if (isSearchable) {
      return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    }

    switch (status) {
      case 'processing':
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      case 'pending':
        return <Clock className="h-3.5 w-3.5 text-blue-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    if (isSearchable) return 'Searchable';

    switch (status) {
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Searchable';
      case 'failed':
        return 'Failed';
      case 'pending':
        return 'Pending';
      default:
        return 'Processing';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3 flex items-center gap-3',
        'text-left transition-all duration-200',
        'border-l-3',
        active && 'sidebar-menu-item-active',
        !active && 'border-l-transparent hover:bg-sidebar-accent/50',
        'group'
      )}
    >
      {/* Icon */}
      <div className={cn(
        'p-2 rounded-md flex-shrink-0 transition-colors',
        active ? 'bg-sidebar-primary/20 text-sidebar-primary' : 'bg-sidebar-accent text-sidebar-icon group-hover:bg-sidebar-accent/80'
      )}>
        {getContentTypeIcon(contentType)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <div className={cn(
          'text-sm font-medium truncate mb-1',
          active ? 'text-sidebar-foreground' : 'text-sidebar-foreground/90 group-hover:text-sidebar-foreground'
        )}>
          {title}
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-2 text-xs text-sidebar-muted">
          {/* Status */}
          <div className="flex items-center gap-1">
            {getStatusIcon()}
            <span>{getStatusText()}</span>
          </div>

          <span>•</span>

          {/* Date */}
          <span>{formatDate(createdAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onChat && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-sidebar-icon hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onChat();
            }}
            title="Chat about this item"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
        <ItemActionsMenu
          itemId={id}
          itemTitle={title}
          onChat={onChat}
          onDownload={onDownload}
          onReprocess={onReprocess}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
        />
      </div>
    </button>
  );
}
