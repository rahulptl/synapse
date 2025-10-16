import { useState } from 'react';
import { FileText, ExternalLink, Calendar, Trash2, Loader2, CheckCircle, AlertCircle, RefreshCw, MessageSquare, Download } from 'lucide-react';
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
  metadata?: Record<string, unknown>;
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
  onChatWithItem?: (itemId: string, itemTitle: string) => void;
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
  onMoveItem,
  onChatWithItem
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
      return 'Searchable';
    }

    // Check if item has been chunked/processed
    if (item.is_chunked && item.total_chunks && item.total_chunks > 0) {
      return 'Searchable';
    }

    // Check explicit status
    switch (item.processing_status) {
      case 'processing':
        return 'Processing for search...';
      case 'completed':
        return 'Searchable';
      case 'failed':
        return 'Processing failed - Click to retry';
      case 'pending':
        return 'Queued for processing...';
      default:
        return 'Processing...';
    }
  };

  const handleDownload = async (item: KnowledgeItem) => {
    try {
      // Import apiClient dynamically to avoid circular dependencies
      const { apiClient } = await import('@/services/apiClient');

      // Get auth from localStorage (assuming this is how auth is stored)
      const accessToken = localStorage.getItem('accessToken');
      const userId = localStorage.getItem('userId');

      if (!accessToken || !userId) {
        console.error('Authentication credentials not found');
        return;
      }

      const auth = { userId, accessToken };

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
          <p className="text-gray-300 font-semibold text-base">No items in this folder</p>
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
              <div className="flex items-start justify-between gap-3 w-full min-w-0">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                    selectedItem === item.id ? 'bg-blue-400/30 text-blue-200' : 'bg-white/10 text-gray-300 group-hover:bg-white/20'
                  }`}>
                    {getContentTypeIcon(item.content_type)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <h4 className={`font-bold text-base leading-tight truncate transition-colors ${
                      selectedItem === item.id ? 'text-white' : 'text-gray-200 group-hover:text-white'
                    }`}>{item.title}</h4>

                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      <div className="flex items-center gap-1.5">
                        {getProcessingStatusIcon(item.is_searchable ? 'completed' : item.processing_status)}
                        <span className="font-medium">
                          {getProcessingStatusText(item)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span className="font-medium">{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1 flex-shrink-0">
                  {/* Chat button */}
                  {onChatWithItem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-500/20 hover:text-purple-400 hidden md:flex"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChatWithItem(item.id, item.title);
                      }}
                      title="Chat about this item"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                  )}
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
                  {/* Download button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-green-500/20 hover:text-green-400 hidden md:flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(item);
                    }}
                    title="Download this item"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20 hover:text-red-400 hidden md:flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteItem(item.id);
                    }}
                    title="Delete this item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
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