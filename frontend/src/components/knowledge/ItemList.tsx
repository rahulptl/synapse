import { useState } from 'react';
import { FileText, ExternalLink, Calendar, Trash2, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KnowledgeItemContextMenu } from './KnowledgeItemContextMenu';

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
  vector_count?: number;
  vectors_with_embeddings?: number;
  is_searchable?: boolean;
  folder_id?: string;
}

interface Folder {
  id: string;
  name: string;
  children?: Folder[];
}

interface ItemListProps {
  items: KnowledgeItem[];
  selectedItem: string | null;
  currentFolderId: string;
  folders: Folder[];
  onItemSelect: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onReprocessItem?: (itemId: string) => void;
  onRenameItem?: (itemId: string, newTitle: string) => Promise<void>;
  onMoveItem?: (itemId: string, targetFolderId: string) => Promise<void>;
}

export function ItemList({
  items,
  selectedItem,
  currentFolderId,
  folders,
  onItemSelect,
  onDeleteItem,
  onReprocessItem,
  onRenameItem,
  onMoveItem
}: ItemListProps) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverFolder(null);
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
        return 'bg-blue-500/10 text-blue-500';
      case 'url':
        return 'bg-green-500/10 text-green-500';
      case 'file':
        return 'bg-purple-500/10 text-purple-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  const getProcessingStatusIcon = (status?: string) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getProcessingStatusText = (item: KnowledgeItem) => {
    // Use is_searchable flag if available (from enhanced status endpoint)
    if (item.is_searchable === true) {
      return `Searchable (${item.total_chunks} chunks)`;
    }

    // Check if item has been chunked/processed
    if (item.is_chunked && item.total_chunks && item.total_chunks > 0) {
      // Check vector status if available
      if (item.vector_count !== undefined && item.vectors_with_embeddings !== undefined) {
        if (item.vectors_with_embeddings === item.total_chunks) {
          return `Searchable (${item.total_chunks} chunks)`;
        } else if (item.vectors_with_embeddings > 0) {
          return `Processing embeddings (${item.vectors_with_embeddings}/${item.total_chunks})`;
        }
      }
      return `Searchable (${item.total_chunks} chunks)`;
    }

    // Check explicit status
    switch (item.processing_status) {
      case 'processing':
        return 'Processing for search...';
      case 'completed':
        return item.total_chunks > 0 ? 'Searchable' : 'Processing incomplete';
      case 'failed':
        return 'Processing failed - Click to retry';
      case 'pending':
        return 'Queued for processing...';
      default:
        return 'Processing...';  // More optimistic default
    }
  };

  if (items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 via-emerald-400/20 to-indigo-400/20 rounded-full blur-xl"></div>
            <div className="relative bg-white/10 p-6 rounded-2xl backdrop-blur-sm">
              <FileText className="h-12 w-12 mx-auto text-gray-400" />
            </div>
          </div>
          <p className="text-gray-300 font-medium">No items in this folder</p>
          <p className="text-sm text-gray-400">Upload files or add content to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 p-4 overflow-y-auto overflow-x-hidden">
        {items.map((item, index) => (
          <div key={item.id} className="w-full">
            <KnowledgeItemContextMenu
              itemId={item.id}
              itemTitle={item.title}
              currentFolderId={currentFolderId}
              folders={folders}
              onRename={onRenameItem || (async () => {})}
              onMove={onMoveItem || (async () => {})}
              onDelete={onDeleteItem}
              onReprocess={onReprocessItem}
            >
              <Card
                className={`group cursor-pointer transition-all duration-300 border-0 w-full overflow-hidden ${
                  selectedItem === item.id
                    ? 'bg-gradient-to-r from-blue-500/25 to-purple-500/25 shadow-lg ring-2 ring-blue-400/40 scale-[1.02]'
                    : 'bg-white/8 hover:bg-white/12 shadow-sm hover:shadow-lg hover:-translate-y-0.5'
                } ${draggedItem === item.id ? 'opacity-50' : ''}`}
                draggable={!!onMoveItem}
                onDragStart={(e) => onMoveItem && handleDragStart(e, item.id)}
                onDragEnd={handleDragEnd}
                onClick={() => onItemSelect(item.id)}
              >
            <CardContent className="p-4 w-full">
              <div className="flex items-start gap-3 mb-3 w-full min-w-0">
                <div className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                  selectedItem === item.id ? 'bg-blue-400/30 text-blue-200' : 'bg-white/10 text-gray-300 group-hover:bg-white/20'
                }`}>
                  {getContentTypeIcon(item.content_type)}
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <h4 className={`font-semibold text-sm leading-tight truncate transition-colors ${
                    selectedItem === item.id ? 'text-white' : 'text-gray-200 group-hover:text-white'
                  }`}>{item.title}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`text-xs px-2 py-1 ${getContentTypeColor(item.content_type)} border-0 flex-shrink-0`}>
                      {item.content_type}
                    </Badge>
                    {item.processing_status && getProcessingStatusIcon(item.processing_status)}
                  </div>
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  {/* Show reprocess button for all items with content */}
                  {onReprocessItem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500/20 hover:text-blue-400 hidden md:flex"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReprocessItem(item.id);
                      }}
                      title="Reprocess this item"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-400 hidden md:flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteItem(item.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <p className="text-sm text-gray-400 line-clamp-2 mb-3 leading-relaxed break-words">
                {item.content ? item.content.substring(0, 120) + '...' : 'No content preview available'}
              </p>

              <div className="flex items-center justify-between text-xs gap-2 min-w-0">
                <div className="flex items-center space-x-1 text-gray-400 flex-shrink-0">
                  <Calendar className="h-3 w-3" />
                  <span className="font-medium whitespace-nowrap">{formatDate(item.created_at)}</span>
                </div>

                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                  {item.source_url && (
                    <div className="flex items-center space-x-1 text-gray-400 min-w-0 hidden sm:flex">
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate max-w-24 font-medium">
                        {new URL(item.source_url).hostname}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-gray-400 flex-shrink-0">
                    {getProcessingStatusIcon(item.processing_status)}
                    <span className="text-xs font-medium hidden sm:inline">
                      {getProcessingStatusText(item)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
              </Card>
            </KnowledgeItemContextMenu>
            {index < items.length - 1 && (
              <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}