import { MoreVertical, MessageSquare, Download, RefreshCw, Trash2, Edit2, FolderInput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ItemActionsMenuProps {
  itemId: string;
  itemTitle: string;
  onChat?: () => void;
  onDownload?: () => void;
  onReprocess?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function ItemActionsMenu({
  itemId,
  itemTitle,
  onChat,
  onDownload,
  onReprocess,
  onRename,
  onMove,
  onDelete,
  className,
}: ItemActionsMenuProps) {
  const handleAction = (e: React.MouseEvent, action?: () => void) => {
    e.stopPropagation();
    action?.();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-sidebar-icon hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {onChat && (
          <DropdownMenuItem onClick={(e) => handleAction(e as any, onChat)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Chat about this
          </DropdownMenuItem>
        )}

        {onDownload && (
          <DropdownMenuItem onClick={(e) => handleAction(e as any, onDownload)}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </DropdownMenuItem>
        )}

        {(onChat || onDownload) && (onReprocess || onRename || onMove || onDelete) && (
          <DropdownMenuSeparator />
        )}

        {onReprocess && (
          <DropdownMenuItem onClick={(e) => handleAction(e as any, onReprocess)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reprocess
          </DropdownMenuItem>
        )}

        {onRename && (
          <DropdownMenuItem onClick={(e) => handleAction(e as any, onRename)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
        )}

        {onMove && (
          <DropdownMenuItem onClick={(e) => handleAction(e as any, onMove)}>
            <FolderInput className="mr-2 h-4 w-4" />
            Move to folder
          </DropdownMenuItem>
        )}

        {onDelete && (
          <>
            {(onReprocess || onRename || onMove) && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={(e) => handleAction(e as any, onDelete)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
