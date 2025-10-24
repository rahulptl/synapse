import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModernConversationList } from '@/components/chat/ModernConversationList';
import type { Conversation } from '../types/chat';

interface ConversationSidebarProps {
  conversations: Conversation[];
  selectedConversation: string | null;
  onConversationSelect: (conversationId: string | null) => void;
  onNewConversation: () => void;
  onRenameConversation: (conversationId: string, currentTitle: string) => void;
  onExportConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  hasPendingResponse?: (conversationId: string) => boolean;
  collapsed: boolean;
  chatStore: {
    getHasPendingResponse: (conversationId: string) => boolean;
  };
  onToggleCollapsed: () => void;
  showMobileSidebar: boolean;
  setShowMobileSidebar: (open: boolean) => void;
}

export const ConversationSidebar = ({
  conversations,
  selectedConversation,
  onConversationSelect,
  onNewConversation,
  onRenameConversation,
  onExportConversation,
  onDeleteConversation,
  hasPendingResponse,
  collapsed,
  chatStore,
  onToggleCollapsed,
  showMobileSidebar,
  setShowMobileSidebar
}: ConversationSidebarProps) => {
  return (
    <>
      {/* Desktop Left Sidebar - Conversations */}
      <div
        className={cn(
          'hidden md:flex transition-all duration-300 ease-in-out flex-shrink-0',
          'bg-sidebar/95 backdrop-blur-xl border-r border-sidebar-border',
          collapsed ? 'w-0 overflow-hidden' : 'w-80'
        )}
      >
        <ModernConversationList
          conversations={conversations}
          selectedConversation={selectedConversation}
          onConversationSelect={onConversationSelect}
          onNewConversation={onNewConversation}
          onRenameConversation={onRenameConversation}
          onExportConversation={onExportConversation}
          onDeleteConversation={onDeleteConversation}
          hasPendingResponse={(conversationId) => chatStore.getHasPendingResponse(conversationId)}
          collapsed={collapsed}
        />
      </div>


      {/* Mobile Header - Conversations */}
      <Sheet open={showMobileSidebar} onOpenChange={setShowMobileSidebar}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden fixed top-[4.5rem] left-4 z-50 h-12 w-12 bg-sidebar/95 backdrop-blur-xl text-sidebar-foreground rounded-lg shadow-lg border border-sidebar-border hover:bg-sidebar-accent transition-colors"
            aria-label="Open conversations menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 bg-sidebar/95 backdrop-blur-xl border-sidebar-border p-0">
          <ModernConversationList
            conversations={conversations}
            selectedConversation={selectedConversation}
            onConversationSelect={onConversationSelect}
            onNewConversation={onNewConversation}
            onRenameConversation={onRenameConversation}
            onExportConversation={onExportConversation}
            onDeleteConversation={onDeleteConversation}
            hasPendingResponse={(conversationId) => chatStore.getHasPendingResponse(conversationId)}
            collapsed={false}
          />
        </SheetContent>
      </Sheet>
    </>
  );
};
