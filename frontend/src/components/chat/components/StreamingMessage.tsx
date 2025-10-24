import { Bot } from 'lucide-react';
import { Suspense, lazy } from 'react';
import type { StatusType } from '@/components/chat/StatusTile';

// Lazy load MarkdownMessage to prevent highlight.js initialization issues
const MarkdownMessage = lazy(() => import('@/components/chat/MarkdownMessage').then(module => ({ default: module.MarkdownMessage })));

interface StreamingMessageProps {
  isStreaming: boolean;
  streamingMessage: string;
  streamingConversationId: string | null;
  selectedConversation: string | null;
  currentStatus: {
    type: StatusType;
    message?: string;
    details?: string;
  } | null;
}

export function StreamingMessage({
  isStreaming,
  streamingMessage,
  streamingConversationId,
  selectedConversation,
  currentStatus
}: StreamingMessageProps) {
  // Only render if streaming and conversation matches
  if (!isStreaming || streamingConversationId !== selectedConversation) {
    return null;
  }

  return (
    <div className="flex justify-start group">
      <div className="flex items-start space-x-4 max-w-[85%]">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-sidebar-accent text-sidebar-foreground">
          <Bot className="h-5 w-5" />
        </div>
        <div className="space-y-3 flex-1 min-w-0">
          <div className="relative bg-sidebar-accent/50 border border-sidebar-border rounded-2xl rounded-tl-md shadow-sm px-5 py-4">
            {streamingMessage ? (
              // Show actual streaming text
              <div className="text-sm leading-7 text-gray-100 break-words">
                <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
                  <MarkdownMessage content={streamingMessage} />
                </Suspense>
                <span className="animate-pulse">▊</span>
              </div>
            ) : currentStatus ? (
              // Show current status while waiting for text
              <div className="flex items-center space-x-2 text-sm text-sidebar-muted">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-sidebar-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-sidebar-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-sidebar-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <div>
                  {currentStatus.details
                    ? `${currentStatus.message} ${currentStatus.details}`
                    : currentStatus.message
                  }
                </div>
              </div>
            ) : (
              // Fallback: just show loading dots
              <div className="flex items-center space-x-2 text-sm text-sidebar-muted">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-sidebar-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-sidebar-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-sidebar-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span>Thinking...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}