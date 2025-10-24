import { Badge } from '@/components/ui/badge';
import { Search, Folder, FileText } from 'lucide-react';
import type { SelectedContextItem } from '../types/chat';

interface ContextItemsPreviewProps {
  selectedContextItems: SelectedContextItem[];
}

export const ContextItemsPreview = ({ selectedContextItems }: ContextItemsPreviewProps) => {
  if (!selectedContextItems || selectedContextItems.length === 0) {
    return null;
  }

  return (
    <div className="p-3 bg-sidebar-accent/50 border border-sidebar-border rounded-xl">
      <div className="flex items-center space-x-2 text-sm text-sidebar-foreground mb-2">
        <Search className="h-3.5 w-3.5 text-sidebar-muted" />
        <span className="font-medium">Context ({selectedContextItems.length}):</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedContextItems.map((item, index) => (
          <Badge
            key={index}
            variant="outline"
            className="text-xs flex items-center gap-1.5"
          >
            {item.type === 'folder' ? (
              <Folder className="h-3 w-3" />
            ) : (
              <FileText className="h-3 w-3" />
            )}
            @{item.name}
          </Badge>
        ))}
      </div>
    </div>
  );
};