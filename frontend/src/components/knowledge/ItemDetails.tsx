import { useState } from 'react';
import { Clock, ExternalLink, FileText, Trash2, Download, ArrowLeft, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/apiClient';
import { useToast } from '@/hooks/use-toast';

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
}


interface ItemDetailsProps {
  item: KnowledgeItem | null;
  onDeleteItem: (itemId: string) => void;
  onBack?: () => void;
  folderName?: string | null;
}

export function ItemDetails({ item, onDeleteItem, onBack, folderName }: ItemDetailsProps) {
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
          <p className="text-gray-300 font-semibold text-base">No item selected</p>
          <p className="text-sm text-gray-400">Choose an item from the list to view details</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-900/50 to-gray-800/50">
      {/* Header with mobile back button only */}
      <div className="border-b border-white/10">
        {/* Mobile back button */}
        {onBack && (
          <div className="lg:hidden p-4 pb-3">
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
      </div>

      {/* Breadcrumb navigation - properly contained */}
      <div className="bg-white/5 backdrop-blur-sm border-b border-white/8">
        <div className="px-6 py-3">
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <span className="hover:text-white transition-colors cursor-pointer">Memory</span>
            <span className="text-gray-600">/</span>
            {folderName && (
              <>
                <div className="flex items-center space-x-1 hover:text-white transition-colors cursor-pointer">
                  <FolderOpen className="h-4 w-4" />
                  <span>{folderName}</span>
                </div>
                <span className="text-gray-600">/</span>
              </>
            )}
            <span className="text-white font-semibold truncate max-w-md">{item.title}</span>
          </div>
        </div>

        {/* Action bar */}
        <div className="px-6 pb-3 flex items-center justify-between">
          <div className="flex items-center text-sm text-gray-400">
            <Clock className="h-4 w-4 mr-1.5 text-blue-400" />
            <span>Created {formatDate(item.created_at)}</span>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            {item.source_url && item.metadata?.stored_in_storage && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                onClick={handleViewSource}
                disabled={isLoadingUrl}
                title="Download file"
              >
                {isLoadingUrl ? (
                  <div className="h-4 w-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 hover:bg-red-500/20 hover:text-red-400 transition-colors"
              onClick={() => onDeleteItem(item.id)}
              title="Delete item"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content area with frame */}
      <div className="flex-1 p-6 overflow-hidden">
        <div className="h-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <Tabs defaultValue="content" className="h-full flex flex-col">
            <div className="border-b border-white/10">
              <TabsList className="grid w-full grid-cols-1 bg-transparent border-none h-auto p-0">
                <TabsTrigger
                  value="content"
                  className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-gray-400 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 px-6 py-3 font-semibold"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Content
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="content" className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {item.content?.startsWith('[FILE:') && item.metadata?.storage_path ? (
                <div className="h-full flex items-center justify-center p-8">
                  <div className="text-center space-y-4">
                    <FileText className="h-16 w-16 mx-auto text-gray-400" />
                    <p className="text-gray-400">
                      File preview not available in this version.
                    </p>
                  </div>
                </div>
              ) : item.content_type === 'document' && item.metadata?.fileStored === 'none' ? (
                <div className="h-full flex items-center justify-center p-8">
                  <div className="text-center space-y-4">
                    <FileText className="h-16 w-16 mx-auto text-gray-400" />
                    <p className="text-gray-400 leading-relaxed max-w-md">
                      This item references a file that wasn't uploaded to storage, so it can't be previewed here.
                      Please use the Upload panel to upload the file to this folder to enable inline viewing.
                    </p>
                  </div>
                </div>
              ) : item.processing_status === 'processing' ? (
                <div className="h-full flex items-center justify-center p-8">
                  <div className="text-center space-y-4">
                    <div className="animate-spin h-8 w-8 border-2 border-yellow-500 border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-gray-400 leading-relaxed">
                      Content is being processed for search. This may take a few moments...
                    </p>
                  </div>
                </div>
              ) : item.processing_status === 'pending' ? (
                <div className="h-full flex items-center justify-center p-8">
                  <div className="text-center space-y-4">
                    <FileText className="h-16 w-16 mx-auto text-gray-400" />
                    <p className="text-gray-400 leading-relaxed">
                      Content is queued for processing and will be searchable soon.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="p-10">
                    <div className="max-w-none">
                      <pre className="whitespace-pre-wrap break-words text-base leading-relaxed text-gray-200 font-normal text-left">
                        {item.content || 'No content available'}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            </Tabs>
        </div>
      </div>
    </div>
  );
}

