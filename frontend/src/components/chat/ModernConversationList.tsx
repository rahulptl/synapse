import { Plus, MessageSquare, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ModernConversationListItem } from './ModernConversationListItem';

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface ModernConversationListProps {
  conversations: Conversation[];
  selectedConversation: string | null;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  onRenameConversation?: (conversationId: string, currentTitle: string) => void;
  onExportConversation?: (conversationId: string, title: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  hasPendingResponse?: (conversationId: string) => boolean;
  collapsed?: boolean;
}

export function ModernConversationList({
  conversations,
  selectedConversation,
  onConversationSelect,
  onNewConversation,
  onRenameConversation,
  onExportConversation,
  onDeleteConversation,
  hasPendingResponse,
  collapsed = false,
}: ModernConversationListProps) {
  if (!conversations || conversations.length === 0) {
    return (
      <div className="h-full flex flex-col">
        {/* New Conversation Button */}
        <div className="p-4 border-b border-sidebar-border">
          <Button
            onClick={onNewConversation}
            className="w-full h-10 bg-sidebar-primary hover:bg-sidebar-primary/90 text-white transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Conversation
          </Button>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 px-6">
            <div className="p-6 rounded-2xl bg-sidebar-accent/30 w-fit mx-auto">
              <MessageSquare className="h-12 w-12 text-sidebar-icon" />
            </div>
            <p className="text-sidebar-foreground font-semibold text-sm">No conversations yet</p>
            <p className="text-xs text-sidebar-muted">Start a new conversation to get started</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-sidebar/50">
      {/* New Conversation Button */}
      <div className="p-4 border-b border-sidebar-border">
        <Button
          onClick={onNewConversation}
          className="w-full h-10 bg-sidebar-primary hover:bg-sidebar-primary/90 text-white transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Conversation
        </Button>
      </div>

      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
          Conversations ({conversations.length})
        </h3>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        <div>
          {conversations.map((conversation) => (
            <ModernConversationListItem
              key={conversation.id}
              id={conversation.id}
              title={conversation.title}
              updatedAt={conversation.updated_at}
              hasPendingResponse={hasPendingResponse?.(conversation.id)}
              active={selectedConversation === conversation.id}
              onClick={() => onConversationSelect(conversation.id)}
              onRename={onRenameConversation ? () => onRenameConversation(conversation.id, conversation.title) : undefined}
              onExport={onExportConversation ? () => onExportConversation(conversation.id, conversation.title) : undefined}
              onDelete={onDeleteConversation ? () => onDeleteConversation(conversation.id) : undefined}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
