import { useEffect, useState } from 'react';
import { Clock, ExternalLink, FileText, User, Trash2, Download, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/apiClient';
import { useToast } from '@/hooks/use-toast';

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

interface ItemDetailsProps {
  item: KnowledgeItem | null;
  onDeleteItem: (itemId: string) => void;
  onBack?: () => void;
}

export function ItemDetails({ item, onDeleteItem, onBack }: ItemDetailsProps) {
  const { user, accessToken } = useAuth();
  const { toast } = useToast();
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  // Handle viewing source file stored in cloud storage
  const handleViewSource = async () => {
    if (!item || !user || !accessToken) return;

    setIsLoadingUrl(true);
    try {
      const result = await apiClient.getContentDownloadUrl(
        item.id,
        { userId: user.id, accessToken },
        1 // 1 hour expiration
      );

      // Open the signed URL in a new tab
      window.open(result.download_url, '_blank');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate download link for this file",
        variant: "destructive",
      });
    } finally {
      setIsLoadingUrl(false);
    }
  };

  if (!item) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 via-emerald-400/20 to-indigo-400/20 rounded-full blur-xl"></div>
            <div className="relative bg-white/10 p-6 rounded-2xl backdrop-blur-sm">
              <FileText className="h-12 w-12 mx-auto text-gray-400" />
            </div>
          </div>
          <p className="text-gray-300 font-medium">No item selected</p>
          <p className="text-sm text-gray-400">Choose an item from the list to view details</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
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

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-900/50 to-gray-800/50">
      <div className="p-5 border-b border-white/10">
        {/* Mobile back button */}
        {onBack && (
          <div className="lg:hidden mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-white hover:bg-white/10 -ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to list
            </Button>
          </div>
        )}

        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white mb-2 leading-tight">{item.title}</h1>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-sm text-gray-400">
              <div className="flex items-center">
                <Clock className="h-4 w-4 mr-1.5 text-blue-400" />
                <span>Created {formatDate(item.created_at)}</span>
              </div>
              {item.updated_at !== item.created_at && (
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-1.5 text-emerald-400" />
                  <span>Updated {formatDate(item.updated_at)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-3 flex-shrink-0">
            <Badge className={`text-xs px-3 py-1 ${getContentTypeColor(item.content_type)} border-0`}>
              {item.content_type}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-red-500/20 hover:text-red-400 transition-colors"
              onClick={() => onDeleteItem(item.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-5 space-y-6 overflow-y-auto">
        {item.source_url && item.metadata?.stored_in_storage && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-lg">
            <h4 className="text-base font-semibold text-white mb-3 flex items-center">
              <ExternalLink className="h-4 w-4 mr-2 text-emerald-400" />
              Source File
            </h4>
            <div className="flex items-center space-x-3">
              <code className="text-sm text-gray-400 flex-1 truncate">
                {item.metadata?.original_filename || 'Stored file'}
              </code>
              <Button
                onClick={handleViewSource}
                disabled={isLoadingUrl}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isLoadingUrl ? (
                  <>
                    <div className="h-4 w-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    View/Download
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              File size: {item.metadata?.file_size ? `${(item.metadata.file_size / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}
            </p>
          </div>
        )}

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-lg">
          <h4 className="text-base font-semibold text-white mb-4 flex items-center">
            <FileText className="h-4 w-4 mr-2 text-blue-400" />
            Content
          </h4>
          <div className="bg-white/5 backdrop-blur-sm border border-white/5 rounded-lg p-4">
            {item.content?.startsWith('[FILE:') && item.metadata?.storage_path ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-400">
                  File preview not available in this version.
                </p>
                {item.metadata?.original_filename && (
                  <p className="text-xs text-gray-500">
                    Filename: {item.metadata.original_filename}
                  </p>
                )}
              </div>
            ) : item.content_type === 'document' && item.metadata?.fileStored === 'none' ? (
              <p className="text-sm text-gray-400 leading-relaxed">
                This item references a file that wasn't uploaded to storage, so it can't be previewed here.
                Please use the Upload panel to upload the file to this folder to enable inline viewing.
              </p>
            ) : item.processing_status === 'processing' ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 leading-relaxed">
                  Content is being processed for search. This may take a few moments...
                </p>
                <div className="flex items-center space-x-2 text-yellow-500">
                  <div className="animate-spin h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
                  <span className="text-xs">Processing</span>
                </div>
              </div>
            ) : item.processing_status === 'pending' ? (
              <p className="text-sm text-gray-400 leading-relaxed">
                Content is queued for processing and will be searchable soon.
              </p>
            ) : (
              <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-200 max-h-96 overflow-y-auto">
                {item.content || 'No content available'}
              </pre>
            )}
          </div>
        </div>

        {item.metadata && Object.keys(item.metadata).length > 0 && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-lg">
            <h4 className="text-base font-semibold text-white mb-4 flex items-center">
              <User className="h-4 w-4 mr-2 text-purple-400" />
              Metadata
            </h4>
            <div className="bg-white/5 backdrop-blur-sm border border-white/5 rounded-lg p-4">
              <pre className="whitespace-pre-wrap break-words text-xs text-gray-300 leading-relaxed max-h-48 overflow-y-auto">
                {JSON.stringify(item.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}