import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Copy, Bookmark, Download, MoreVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { UserMessage } from '@/components/chat/components/UserMessage';
import { AssistantMessage } from '@/components/chat/components/AssistantMessage';
import { StreamingMessage } from '@/components/chat/components/StreamingMessage';
import { ContextItemsPreview } from '@/components/chat/components/ContextItemsPreview';
import type { Message, SelectedSource, SelectedContextItem, ChatSource } from '../../types/chat';
import type { StatusType } from '../../StatusTile';

interface MobileMessagesListProps {
  messages: Message[];
  isStreaming: boolean;
  streamingMessage: string;
  streamingConversationId: string | null;
  selectedConversation: string | null;
  currentStatus: { type: StatusType; message?: string; details?: string } | null;
  selectedContextItems: SelectedContextItem[];
  onSourceClick: (source: SelectedSource) => void;
  onSaveMessage: (message: Message) => void;
  onCopyMessage: (content: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
    profile_updated_at?: string;
  } | null;
}

interface SwipeAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  action: () => void;
  color: string;
}

/**
 * Mobile-optimized messages list with swipe gestures and touch-friendly interactions
 * Features: swipe actions for messages, pull-to-refresh integration, optimized scrolling
 */
export function MobileMessagesList({
  messages,
  isStreaming,
  streamingMessage,
  streamingConversationId,
  selectedConversation,
  currentStatus,
  selectedContextItems,
  onSourceClick,
  onSaveMessage,
  onCopyMessage,
  messagesEndRef,
  user
}: MobileMessagesListProps) {
  const { toast } = useToast();
  const [swipeActions, setSwipeActions] = useState<{ [key: string]: SwipeAction[] }>({});
  const [activeSwipeId, setActiveSwipeId] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const messageIdRef = useRef<string | null>(null);

  // Generate swipe actions for a message
  const getMessageSwipeActions = (message: Message): SwipeAction[] => {
    const actions: SwipeAction[] = [];

    // Copy action
    actions.push({
      id: 'copy',
      icon: <Copy className="h-4 w-4" />,
      label: 'Copy',
      action: () => {
        onCopyMessage(message.content);
        toast({
          title: 'Copied',
          description: 'Message copied to clipboard',
        });
      },
      color: 'bg-blue-500'
    });

    // Save action (only for assistant messages)
    if (message.role === 'assistant') {
      actions.push({
        id: 'save',
        icon: <Bookmark className="h-4 w-4" />,
        label: 'Save',
        action: () => {
          onSaveMessage(message);
          toast({
            title: 'Saved',
            description: 'Message saved to knowledge base',
          });
        },
        color: 'bg-green-500'
      });
    }

    return actions;
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent, messageId: string) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    messageIdRef.current = messageId;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (!messageIdRef.current) return;

    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = Math.abs(touchEndY.current - touchStartY.current);

    // Check if it's a horizontal swipe (not vertical scroll)
    if (Math.abs(deltaX) > 50 && deltaY < 100) {
      const messageId = messageIdRef.current;
      const message = messages.find(m => m.id === messageId);

      if (message) {
        if (deltaX < 0) {
          // Swipe left - show actions
          setSwipeActions(prev => ({
            ...prev,
            [messageId]: getMessageSwipeActions(message)
          }));
          setActiveSwipeId(messageId);
        } else {
          // Swipe right - hide actions
          setSwipeActions(prev => {
            const newActions = { ...prev };
            delete newActions[messageId];
            return newActions;
          });
          setActiveSwipeId(null);
        }
      }
    }
  };

  // Close swipe actions when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setSwipeActions({});
      setActiveSwipeId(null);
    };

    if (activeSwipeId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeSwipeId]);

  return (
    <div className="flex-1 relative">
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4 max-w-4xl mx-auto">
          {/* Context Items Preview */}
          {selectedContextItems.length > 0 && (
            <div className="mb-4">
              <ContextItemsPreview
                selectedContextItems={selectedContextItems}
                onRemoveItem={(itemId) => {
                  // Handle removing context items
                }}
                onSourceClick={onSourceClick}
              />
            </div>
          )}

          {/* Messages */}
          {messages.map((message, index) => {
            const hasSwipeActions = swipeActions[message.id];
            const isActive = activeSwipeId === message.id;

            return (
              <div
                key={message.id}
                className={cn(
                  'relative transition-transform duration-200',
                  hasSwipeActions && '-translate-x-4'
                )}
                onTouchStart={(e) => handleTouchStart(e, message.id)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Swipe Actions */}
                {hasSwipeActions && (
                  <div className="absolute right-0 top-0 bottom-0 flex items-center space-x-2 z-10 px-2">
                    {hasSwipeActions.map((action) => (
                      <Button
                        key={action.id}
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          action.action();
                          setSwipeActions(prev => {
                            const newActions = { ...prev };
                            delete newActions[message.id];
                            return newActions;
                          });
                          setActiveSwipeId(null);
                        }}
                        className={cn(
                          'h-8 w-8 p-0 rounded-full text-white shadow-lg',
                          action.color
                        )}
                        title={action.label}
                      >
                        {action.icon}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Message Content */}
                {message.role === 'user' ? (
                  <UserMessage
                    message={message}
                    user={user}
                    onSaveMessage={() => onSaveMessage(message)}
                  />
                ) : (
                  <AssistantMessage
                    message={message}
                    onSourceClick={onSourceClick}
                    onDownloadSourceFile={() => {
                      // Handle download
                    }}
                    onSaveToMemory={() => onSaveMessage(message)}
                  />
                )}

                {/* Swipe Indicator */}
                {isActive && (
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 text-white/50 text-xs">
                    ← Swipe
                  </div>
                )}
              </div>
            );
          })}

          {/* Show streaming message */}
          <StreamingMessage
            isStreaming={isStreaming}
            streamingMessage={streamingMessage}
            streamingConversationId={streamingConversationId}
            selectedConversation={selectedConversation}
            currentStatus={currentStatus}
          />

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Mobile-specific overlay for better contrast */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-black/20 to-5%" />
    </div>
  );
}