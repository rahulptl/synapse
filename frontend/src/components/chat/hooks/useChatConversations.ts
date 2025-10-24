import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/apiClient';
import type { Conversation, Message, ConversationDrafts } from '../types/chat';
import { buildConversationTranscript, getConversationDefaultTitle } from '../utils/chatUtils';

interface UseChatConversationsParams {
  user: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  } | null;
  accessToken: string | null;
  selectedConversation: string | null;
  messages: Message[];
  conversations: Conversation[];
  onConversationsChange: (conversations: Conversation[]) => void;
  onConversationSelect: (conversationId: string | null) => void;
  onMessagesChange: (messages: Message[]) => void;
  onConversationToDeleteChange: (conversationId: string | null) => void;
  inputMessage: string;
  onInputMessageChange: (message: string) => void;
}

export const useChatConversations = ({
  user,
  accessToken,
  selectedConversation,
  messages,
  conversations,
  onConversationsChange,
  onConversationSelect,
  onMessagesChange,
  onConversationToDeleteChange,
  inputMessage,
  onInputMessageChange
}: UseChatConversationsParams) => {
  const { toast } = useToast();
  const [conversationDrafts, setConversationDrafts] = useState<ConversationDrafts>({});

  // Save current draft before switching conversations
  const saveCurrentDraft = (conversationId: string | null) => {
    console.log('[DRAFT] saveCurrentDraft called for:', conversationId);
    console.log('[DRAFT] Current inputMessage:', inputMessage.substring(0, 50));
    if (conversationId && inputMessage.trim()) {
      console.log('[DRAFT] ✅ Saving draft');
      setConversationDrafts(prev => ({
        ...prev,
        [conversationId]: inputMessage.trim()
      }));
    } else {
      console.log('[DRAFT] ⏭️ Not saving (no conversation or empty message)');
    }
  };

  // Restore draft for a specific conversation
  const restoreDraft = (conversationId: string | null) => {
    console.log('[DRAFT] restoreDraft called for:', conversationId);
    if (conversationId && conversationDrafts[conversationId]) {
      console.log('[DRAFT] ✅ Restoring draft:', conversationDrafts[conversationId].substring(0, 50));
      onInputMessageChange(conversationDrafts[conversationId]);
    } else {
      console.log('[DRAFT] 🗑️ No draft to restore, clearing input');
      onInputMessageChange('');
    }
  };

  // Create a wrapper for setSelectedConversation that saves draft first
  const handleConversationSelect = (conversationId: string | null) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔀 [CONVERSATION_SWITCH] handleConversationSelect called');
    console.log('[CONVERSATION_SWITCH] From:', selectedConversation);
    console.log('[CONVERSATION_SWITCH] To:', conversationId);
    console.log('[CONVERSATION_SWITCH] Current messages count:', messages.length);

    if (selectedConversation !== conversationId) {
      console.log('[CONVERSATION_SWITCH] ✅ Switching conversation');
      saveCurrentDraft(selectedConversation);
      console.log('[CONVERSATION_SWITCH] Setting selectedConversation to:', conversationId);
      onConversationSelect(conversationId);
    } else {
      console.log('[CONVERSATION_SWITCH] ⏭️ Same conversation, skipping');
    }
  };

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!user || !accessToken) return;

    try {
      const response = await apiClient.getConversations({
        userId: user.id,
        accessToken: accessToken
      });

      onConversationsChange(response.data || response || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive",
      });
    }
  }, [user, accessToken, toast, onConversationsChange]);

  // Create new conversation
  const createNewConversation = async () => {
    if (!user || !accessToken) return;

    try {
      const response = await apiClient.createConversation(
        { title: 'New Conversation' },
        {
          userId: user.id,
          accessToken: accessToken
        }
      );

      const newConversation = response.data || response;
      onConversationsChange(prev => [newConversation, ...prev]);
      handleConversationSelect(newConversation.id);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
    }
  };

  // Initiate delete conversation
  const initiateDeleteConversation = (conversationId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // Prevent selecting the conversation when clicking delete
    }
    onConversationToDeleteChange(conversationId);
  };

  // Confirm delete conversation
  const confirmDeleteConversation = async (conversationToDelete: string | null) => {
    if (!conversationToDelete || !user || !accessToken) return;

    try {
      await apiClient.deleteConversation(conversationToDelete, {
        userId: user.id,
        accessToken: accessToken
      });

      // Remove from conversations list
      onConversationsChange(prev => prev.filter(conv => conv.id !== conversationToDelete));

      // If this was the selected conversation, clear selection
      if (selectedConversation === conversationToDelete) {
        handleConversationSelect(null);
        onMessagesChange([]);
      }

      toast({
        title: "Deleted",
        description: "Conversation deleted",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive",
      });
    }
  };

  // Rename conversation
  const handleRenameConversation = async (conversationId: string, currentTitle: string) => {
    const newTitle = prompt('Enter new conversation title:', currentTitle);
    if (!newTitle || !newTitle.trim() || newTitle === currentTitle) return;

    if (!user || !accessToken) {
      toast({
        title: "Error",
        description: "Authentication required",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiClient.updateConversation(conversationId, { title: newTitle.trim() }, {
        userId: user.id,
        accessToken: accessToken
      });

      // Update local state
      onConversationsChange(prev => prev.map(conv =>
        conv.id === conversationId ? { ...conv, title: newTitle.trim() } : conv
      ));

      toast({
        title: "Renamed",
        description: `Conversation renamed to "${newTitle.trim()}"`,
      });
    } catch (error) {
      console.error('Failed to rename conversation:', error);
      toast({
        title: "Error",
        description: "Failed to rename conversation",
        variant: "destructive",
      });
    }
  };

  // Export conversation
  const handleExportConversation = async (conversationId: string, title: string) => {
    try {
      // Get the conversation's messages
      const conversation = conversations.find(c => c.id === conversationId);
      if (!conversation) return;

      // If this is the currently selected conversation, use current messages
      // Otherwise, we'd need to fetch them
      const messagesToExport = conversationId === selectedConversation ? messages : [];

      if (messagesToExport.length === 0) {
        toast({
          title: "Export",
          description: "Please select the conversation first to export it",
        });
        return;
      }

      // Build transcript
      const transcript = messagesToExport
        .map((msg) => {
          const roleLabel = msg.role === 'assistant' ? 'Assistant' : msg.role === 'system' ? 'System' : 'You';
          const timestamp = new Date(msg.created_at).toLocaleString();
          return `${roleLabel} (${timestamp})\n${msg.content}\n`;
        })
        .join('\n---\n\n');

      const fullTranscript = `${title}\n${'='.repeat(title.length)}\n\n${transcript}`;

      // Create and download file
      const blob = new Blob([fullTranscript], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[^a-zA-Z0-9\s]/g, '_')}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Exported",
        description: "Conversation transcript downloaded",
      });
    } catch (error) {
      console.error('Failed to export conversation:', error);
      toast({
        title: "Error",
        description: "Failed to export conversation",
        variant: "destructive",
      });
    }
  };

  // Handle folder selection for uploading conversation transcript
  const handleFolderSelectedForUpload = async (
    folderId: string,
    customTitle?: string
  ) => {
    if (!user || !accessToken || !selectedConversation) {
      return;
    }

    const transcriptBody = buildConversationTranscript(messages);
    if (!transcriptBody.trim()) {
      toast({
        title: "Nothing to save",
        description: "The current conversation is empty.",
        variant: "destructive",
      });
      return;
    }

    const baseTitle = getConversationDefaultTitle(
      conversations.find(conv => conv.id === selectedConversation),
      messages
    );
    const title = customTitle && customTitle.trim().length > 0 ? customTitle.trim() : baseTitle;
    const savedAt = new Date();
    const header = `Conversation Title: ${title}\nSaved On: ${savedAt.toLocaleString()}`;
    const transcript = `${header}\n\n${transcriptBody}`;

    try {
      await apiClient.createTextEntry(
        {
          title,
          content: transcript,
          folder_id: folderId,
          metadata: {
            source: 'conversation',
            conversation_id: selectedConversation,
            conversation_title: baseTitle,
            message_count: messages.length,
            saved_from_chat: true,
            saved_at: savedAt.toISOString(),
          },
        },
        {
          userId: user.id,
          accessToken,
        }
      );

      toast({
        title: "Conversation saved",
        description: `"${title}" has been added to your memory`,
      });

      window.dispatchEvent(new CustomEvent('knowledge-item-added', {
        detail: {
          folderId,
          title,
        },
      }));
    } catch (error) {
      console.error('Failed to save conversation:', error);
      toast({
        title: "Error",
        description: "Failed to save conversation to knowledge base",
        variant: "destructive",
      });
    }
  };

  return {
    // State
    conversationDrafts,

    // Actions
    handleConversationSelect,
    loadConversations,
    createNewConversation,
    initiateDeleteConversation,
    confirmDeleteConversation,
    handleRenameConversation,
    handleExportConversation,
    handleFolderSelectedForUpload,

    // Utilities
    saveCurrentDraft,
    restoreDraft
  };
};