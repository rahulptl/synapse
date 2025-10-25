import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Menu, PanelLeft, X } from 'lucide-react';
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
          collapsed ? 'w-16' : 'w-80'
        )}
      >
        {collapsed ? (
          /* Collapsed State - Toggle Button Only */
          <div className="flex flex-col items-center py-4 space-y-4 w-full">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapsed}
              className="h-10 w-10 p-0 hover:bg-sidebar-accent"
              title="Open sidebar (⌘B)"
            >
              <PanelLeft className="h-4 w-4 text-sidebar-icon" />
            </Button>
          </div>
        ) : (
          /* Expanded State - Full Sidebar */
          <div className="flex-1 flex flex-col">
            {/* Header with Toggle */}
            <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
              <h2 className="text-sm font-bold text-sidebar-foreground uppercase tracking-wide">
                Conversations
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCollapsed}
                className="h-8 w-8 p-0 hover:bg-sidebar-accent text-sidebar-icon hover:text-sidebar-foreground transition-colors duration-200"
                title="Collapse sidebar (⌘B)"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </div>

            {/* Conversation List */}
            <div className="flex-1">
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
            </div>
          </div>
        )}
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
            <PanelLeft className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80 bg-sidebar/95 backdrop-blur-xl border-sidebar-border p-0" onInteractOutside={(e) => e.preventDefault()}>
          {/* Custom Header */}
          <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
            <h2 className="text-sm font-bold text-sidebar-foreground uppercase tracking-wide">
              Conversations
            </h2>
          </div>

          {/* Conversation List */}
          <div className="h-[calc(100%-73px)]">
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
              hideHeader={true}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
