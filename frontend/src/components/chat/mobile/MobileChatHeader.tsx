import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, MessageSquare, Wifi, WifiOff, Loader2, Settings, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModernConversationList } from '@/components/chat/ModernConversationList';
import type { Conversation } from '../../types/chat';

interface MobileChatHeaderProps {
  conversations: Conversation[];
  selectedConversation: string | null;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  showMobileSidebar: boolean;
  setShowMobileSidebar: (open: boolean) => void;
  onRenameConversation: (conversationId: string, currentTitle: string) => void;
  onExportConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  chatStore: {
    getHasPendingResponse: (conversationId: string) => boolean;
  };
}

/**
 * Mobile-optimized chat header with conversation selector and WebSocket status
 * Features: slide-out conversation drawer, connection status indicator, new chat button
 */
export function MobileChatHeader({
  conversations,
  selectedConversation,
  onConversationSelect,
  onNewConversation,
  isConnected,
  isConnecting,
  showMobileSidebar,
  setShowMobileSidebar,
  onRenameConversation,
  onExportConversation,
  onDeleteConversation,
  chatStore
}: MobileChatHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Get current conversation title for display
  const getCurrentConversationTitle = () => {
    if (!selectedConversation) return 'New Chat';
    const conversation = conversations.find(conv => conv.id === selectedConversation);
    return conversation?.title || 'New Chat';
  };

  // Connection status indicator
  const ConnectionStatus = () => (
    <div className="flex items-center space-x-2">
      {isConnecting ? (
        <div className="flex items-center space-x-1.5 text-yellow-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-xs font-medium">Connecting</span>
        </div>
      ) : isConnected ? (
        <div className="flex items-center space-x-1.5 text-green-400">
          <Wifi className="h-3 w-3" />
          <span className="text-xs font-medium">Connected</span>
        </div>
      ) : (
        <div className="flex items-center space-x-1.5 text-red-400">
          <WifiOff className="h-3 w-3" />
          <span className="text-xs font-medium">Offline</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
      {/* Left Section - Menu Button and Current Conversation */}
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        {/* Conversation Menu Button */}
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-white/10 flex-shrink-0"
              aria-label="Open conversations menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-80 bg-slate-900/95 backdrop-blur-xl border-white/10 p-0"
            onInteractOutside={(e) => e.preventDefault()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                Conversations
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={onNewConversation}
                className="h-8 w-8 p-0 hover:bg-white/10 text-white hover:text-white transition-colors"
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Conversation List */}
            <div className="h-[calc(100%-73px)] overflow-y-auto">
              <ModernConversationList
                conversations={conversations}
                selectedConversation={selectedConversation}
                onConversationSelect={(id) => {
                  onConversationSelect(id);
                  setIsMenuOpen(false);
                }}
                onNewConversation={() => {
                  onNewConversation();
                  setIsMenuOpen(false);
                }}
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

        {/* Current Conversation Title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-4 w-4 text-blue-400 flex-shrink-0" />
            <h1 className="text-sm font-medium text-white truncate">
              {getCurrentConversationTitle()}
            </h1>
          </div>
        </div>
      </div>

      {/* Right Section - Status and Actions */}
      <div className="flex items-center space-x-3 flex-shrink-0">
        {/* Connection Status */}
        <div className="hidden sm:block">
          <ConnectionStatus />
        </div>

        {/* New Chat Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewConversation}
          className="h-10 w-10 text-white hover:bg-white/10 flex-shrink-0"
          title="New conversation"
        >
          <Plus className="h-5 w-5" />
        </Button>

        {/* Mobile Connection Status (shown only on small screens) */}
        <div className="sm:hidden">
          <ConnectionStatus />
        </div>
      </div>
    </div>
  );
}