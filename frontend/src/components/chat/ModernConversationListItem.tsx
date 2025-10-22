import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConversationActionsMenu } from './ConversationActionsMenu';

interface ModernConversationListItemProps {
  id: string;
  title: string;
  updatedAt: string;
  hasPendingResponse?: boolean;
  active?: boolean;
  onClick: () => void;
  onRename?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
}

export function ModernConversationListItem({
  id,
  title,
  updatedAt,
  hasPendingResponse = false,
  active = false,
  onClick,
  onRename,
  onExport,
  onDelete,
}: ModernConversationListItemProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // Today - show time
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
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
        <MessageSquare className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Title with pending indicator */}
        <div className="relative mb-1 max-w-[180px] lg:max-w-[200px]">
          <span className={cn(
            'text-sm font-medium truncate block w-full',
            active ? 'text-sidebar-foreground' : 'text-sidebar-foreground/90 group-hover:text-sidebar-foreground',
            hasPendingResponse && 'pr-4' // Add padding when pending indicator is present
          )}>
            {title}
          </span>

          {/* Pending response badge - positioned absolutely */}
          {hasPendingResponse && (
            <span className="absolute top-1 right-0 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
        </div>

        {/* Date */}
        <div className="text-xs text-sidebar-muted truncate max-w-[180px] lg:max-w-[200px]">
          {formatDate(updatedAt)}
        </div>
      </div>

      {/* Actions Menu */}
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <ConversationActionsMenu
          conversationId={id}
          conversationTitle={title}
          onRename={onRename}
          onExport={onExport}
          onDelete={onDelete}
        />
      </div>
    </button>
  );
}
