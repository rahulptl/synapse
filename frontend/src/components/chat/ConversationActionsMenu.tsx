import { MoreVertical, Edit2, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ConversationActionsMenuProps {
  conversationId: string;
  conversationTitle: string;
  onRename?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function ConversationActionsMenu({
  conversationId,
  conversationTitle,
  onRename,
  onExport,
  onDelete,
  className,
}: ConversationActionsMenuProps) {
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
        {onRename && (
          <DropdownMenuItem onClick={(e) => handleAction(e as any, onRename)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
        )}

        {onExport && (
          <DropdownMenuItem onClick={(e) => handleAction(e as any, onExport)}>
            <Download className="mr-2 h-4 w-4" />
            Export transcript
          </DropdownMenuItem>
        )}

        {(onRename || onExport) && onDelete && <DropdownMenuSeparator />}

        {onDelete && (
          <DropdownMenuItem
            onClick={(e) => handleAction(e as any, onDelete)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
