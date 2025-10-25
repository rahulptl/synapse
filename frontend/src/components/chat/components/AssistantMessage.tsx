import { Suspense } from 'react';
import { Bot, Search, Bookmark, ExternalLink, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MarkdownMessage } from '@/components/chat/MarkdownMessage';
import type { Message } from '../types/chat';

interface AssistantMessageProps {
  message: Message;
  onViewSource: (source: { title: string; source: string; similarity: number }) => void;
  onDownloadGeneratedFile: (file: { id: string; filename: string }) => void;
  onSaveMessage: (message: Message) => void;
}

export const AssistantMessage = ({ message, onViewSource, onDownloadGeneratedFile, onSaveMessage }: AssistantMessageProps) => {
  // Deduplicate sources by ID to show unique knowledge items only
  const uniqueSources = message.metadata?.sources
    ? Array.from(
        new Map(
          message.metadata.sources.map((source: any) => [source.id, source])
        ).values()
      )
    : [];

  return (
    <div className="flex justify-start group">
      <div className="flex items-start space-x-4 max-w-[85%]">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-md">
            <Bot className="h-5 w-5 text-white" />
          </div>
        </div>

        <div className="space-y-3 flex-1 min-w-0">
          {/* Message Bubble */}
          <div className="relative bg-sidebar-accent/50 border border-sidebar-border rounded-2xl rounded-tl-md shadow-sm px-5 py-4 transition-colors duration-200 hover:bg-sidebar-accent/60">
            <div className="text-sm leading-7 text-gray-100 break-words overflow-wrap-anywhere">
              <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
                <MarkdownMessage content={message.content} />
              </Suspense>
            </div>
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-sidebar-border">
              <div className="flex items-center space-x-2">
                <p className="text-xs text-sidebar-muted">
                  {new Date(message.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                <button
                  onClick={() => onSaveMessage(message)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center space-x-1 text-xs text-sidebar-muted hover:text-sidebar-foreground bg-sidebar-accent hover:bg-sidebar-accent/80 px-2 py-1 rounded"
                  title="Save to Memory"
                >
                  <Bookmark className="h-3 w-3" />
                  <span>Save</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sources for AI messages - Compact Tile Design */}
          {uniqueSources.length > 0 && (
            <div className="bg-sidebar-accent/30 border border-sidebar-border rounded-xl px-4 py-3">
              <div className="flex items-center space-x-2 mb-3">
                <Search className="h-4 w-4 text-sidebar-muted" />
                <h4 className="text-sm font-semibold text-sidebar-foreground">Knowledge Sources ({uniqueSources.length})</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {uniqueSources.map((source, idx) => (
                  <button
                    key={source.id || idx}
                    onClick={() => onViewSource(source)}
                    className="group bg-sidebar-accent/60 hover:bg-sidebar-accent/80 border border-sidebar-border rounded-lg p-3 flex-1 min-w-[200px] transition-all duration-200 hover:shadow-md hover:scale-[1.02]"
                    title={`View source: ${source.title}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-medium text-sidebar-foreground mb-1 leading-tight line-clamp-2 text-left">
                          {source.title}
                        </h5>
                        <div className="flex items-center space-x-2 text-xs text-sidebar-muted">
                          <span className="line-clamp-1 text-left">{source.source}</span>
                          <span className="flex-shrink-0">•</span>
                          <span className="flex-shrink-0">{Math.round(source.similarity * 100)}% match</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-2">
                        <ExternalLink className="h-3.5 w-3.5 text-sidebar-muted group-hover:text-sidebar-foreground transition-colors" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generated Files */}
          {message.metadata?.generated_files && message.metadata.generated_files.length > 0 && (
            <Card className="bg-sidebar-accent/30 border-sidebar-border">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Download className="h-4 w-4 text-sidebar-muted" />
                  <h4 className="text-sm font-semibold text-sidebar-foreground">Generated Files ({message.metadata.generated_files.length})</h4>
                </div>
                <div className="space-y-2">
                  {message.metadata.generated_files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-sidebar-accent/60 rounded-lg border border-sidebar-border hover:bg-sidebar-accent/80 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-lg flex items-center justify-center">
                          <Download className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-sidebar-foreground">{file.filename}</p>
                          <p className="text-xs text-sidebar-muted">
                            Generated {new Date(file.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDownloadGeneratedFile(file)}
                        className="text-sidebar-foreground hover:text-sidebar-primary hover:bg-sidebar-accent"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};