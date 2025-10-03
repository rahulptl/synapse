import { useEffect, useState } from 'react';
import { Clock, ExternalLink, FileText, User, Trash2, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  content_type: string;
  source_url?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

interface ItemDetailsProps {
  item: KnowledgeItem | null;
  onDeleteItem: (itemId: string) => void;
}

export function ItemDetails({ item, onDeleteItem }: ItemDetailsProps) {
  // File preview removed - would need backend API endpoint for file downloads
  // For now, just display metadata

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
        {item.source_url && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-lg">
            <h4 className="text-base font-semibold text-white mb-3 flex items-center">
              <ExternalLink className="h-4 w-4 mr-2 text-emerald-400" />
              Source
            </h4>
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 hover:underline break-all transition-colors text-sm"
            >
              {item.source_url}
            </a>
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