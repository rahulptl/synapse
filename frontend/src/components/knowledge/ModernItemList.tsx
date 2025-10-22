import { useState } from 'react';
import { FileText } from 'lucide-react';
import { ModernItemListItem } from './ModernItemListItem';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/apiClient';
import type { KnowledgeItem } from '@/types/knowledge';
import type { KnowledgeItemMetadata } from '@/types/knowledge';

interface Folder {
  id: string;
  name: string;
  children?: Folder[];
}

interface ModernItemListProps {
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

export function ModernItemList({
  items,
  selectedItem,
  currentFolderId,
  folders,
  onItemSelect,
  onDeleteItem,
  onReprocessItem,
  onRenameItem,
  onMoveItem,
  onChatWithItem,
}: ModernItemListProps) {
  const { user, accessToken } = useAuth();
  const { toast } = useToast();

  const handleDownload = async (item: KnowledgeItem) => {
    try {
      if (!user || !accessToken) {
        toast({
          title: 'Authentication required',
          description: 'Please sign in again to download files.',
          variant: 'destructive',
        });
        return;
      }

      const auth = { userId: user.id, accessToken };
      const metadata = (item.metadata ?? {}) as KnowledgeItemMetadata;
      const safeTitle = item.title.replace(/[^a-zA-Z0-9\s]/g, '_').trim() || 'download';

      const inferExtension = (mimeType?: string) => {
        const map: Record<string, string> = {
          'application/pdf': '.pdf',
          'text/plain': '.txt',
          'text/markdown': '.md',
          'text/csv': '.csv',
          'application/json': '.json',
        };
        return mimeType ? map[mimeType] : undefined;
      };

      try {
        const download = await apiClient.downloadItemFile(item.id, auth);
        const metaFilename =
          typeof metadata?.original_filename === 'string' && metadata.original_filename.trim().length > 0
            ? metadata.original_filename.trim()
            : undefined;

        const inferredExt = inferExtension(download.contentType || metadata?.mime_type);
        let finalName = download.filename?.trim() || metaFilename;

        if (finalName && !finalName.includes('.') && inferredExt) {
          finalName = `${finalName}${inferredExt}`;
        }

        if (!finalName) {
          finalName = inferredExt ? `${safeTitle}${inferredExt}` : `${safeTitle}.txt`;
        }

        apiClient.downloadBlob(download.blob, finalName);
        return;
      } catch (proxyError) {
        console.warn('Direct file download failed, attempting fallback', proxyError);
      }

      try {
        const downloadResponse = await apiClient.getContentDownloadUrl(item.id, auth);
        if (downloadResponse.download_url) {
          const link = document.createElement('a');
          link.href = downloadResponse.download_url;
          link.download =
            (typeof metadata?.original_filename === 'string' && metadata.original_filename) || `${safeTitle}.download`;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return;
        }
      } catch (signedUrlError) {
        console.warn('Signed URL download failed', signedUrlError);
      }

      if (item.content) {
        const content =
          item.content_type === 'url' && item.source_url
            ? `Title: ${item.title}\nURL: ${item.source_url}\n\nContent:\n${item.content}`
            : item.content;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeTitle}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download item:', error);
      toast({
        title: 'Download failed',
        description: 'Could not download the file. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRename = async (item: KnowledgeItem) => {
    const newTitle = prompt('Enter new title:', item.title);
    if (newTitle && newTitle.trim() && onRenameItem) {
      try {
        await onRenameItem(item.id, newTitle.trim());
      } catch (error) {
        toast({
          title: 'Rename failed',
          description: 'Could not rename the item. Please try again.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleMove = async (item: KnowledgeItem) => {
    // TODO: Implement folder picker dialog
    toast({
      title: 'Move item',
      description: 'Folder picker coming soon!',
    });
  };

  if (items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3 px-6">
          <div className="p-6 rounded-2xl bg-sidebar-accent/30 w-fit mx-auto">
            <FileText className="h-12 w-12 text-sidebar-icon" />
          </div>
          <p className="text-sidebar-foreground font-semibold text-sm">No items in this folder</p>
          <p className="text-xs text-sidebar-muted">Upload files or add content to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-sidebar/50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
          Items ({items.length})
        </h3>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => (
          <ModernItemListItem
            key={item.id}
            id={item.id}
            title={item.title}
            contentType={item.content_type || 'file'}
            status={item.processing_status as any}
            isSearchable={item.is_searchable}
            createdAt={item.created_at}
            active={selectedItem === item.id}
            onClick={() => onItemSelect(item.id)}
            onChat={onChatWithItem ? () => onChatWithItem(item.id, item.title) : undefined}
            onDownload={() => handleDownload(item)}
            onReprocess={onReprocessItem ? () => onReprocessItem(item.id) : undefined}
            onRename={onRenameItem ? () => handleRename(item) : undefined}
            onMove={onMoveItem ? () => handleMove(item) : undefined}
            onDelete={() => onDeleteItem(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
