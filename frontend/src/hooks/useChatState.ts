import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/apiClient';
import { getChatWebSocket, ConnectionState } from '@/services/chatWebSocket';
import type { Message, Conversation, ConversationDrafts, SelectedContextItem } from '@/components/chat/types/chat';
import { StatusType } from '@/components/chat/StatusTile';
import { getConversationDefaultTitle, buildConversationTranscript } from '@/components/chat/utils/chatUtils';
import type { User } from '@/types/auth';

interface UseChatStateProps {
  user?: User;
  accessToken?: string;
  chatStore?: any;
}

interface UseChatStateReturn {
  // Core state
  conversations: Conversation[];
  selectedConversation: string | null;
  messages: Message[];
  inputMessage: string;
  conversationDrafts: ConversationDrafts;
  selectedContextItems: SelectedContextItem[];

  // Streaming state
  streamingConversationId: string | null;
  currentStatus: { type: StatusType; message?: string; details?: string } | null;

  // Actions
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  setSelectedConversation: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setInputMessage: React.Dispatch<React.SetStateAction<string>>;
  setConversationDrafts: React.Dispatch<React.SetStateAction<ConversationDrafts>>;
  setSelectedContextItems: React.Dispatch<React.SetStateAction<SelectedContextItem[]>>;
  setStreamingConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  setCurrentStatus: React.Dispatch<React.SetStateAction<{ type: StatusType; message?: string; details?: string } | null>>;

  // Core functions
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  createNewConversation: () => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  exportConversation: (conversationId: string, title: string) => Promise<void>;
  sendMessage: () => Promise<void>;
  handleConversationSelect: (conversationId: string | null) => void;
  saveCurrentDraft: (conversationId: string | null) => void;
  restoreDraft: (conversationId: string | null) => void;

  // Refs (for WebSocket integration)
  selectedConversationRef: React.MutableRefObject<string | null>;
  streamingConversationIdRef: React.MutableRefObject<string | null>;
}

export function useChatState({
  user,
  accessToken,
  chatStore
}: UseChatStateProps): UseChatStateReturn {
  const { toast } = useToast();

  // Core state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [conversationDrafts, setConversationDrafts] = useState<ConversationDrafts>({});
  const [selectedContextItems, setSelectedContextItems] = useState<SelectedContextItem[]>([]);

  // Streaming state
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<{ type: StatusType; message?: string; details?: string } | null>(null);

  // Refs for WebSocket integration
  const selectedConversationRef = useRef<string | null>(null);
  const streamingConversationIdRef = useRef<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    streamingConversationIdRef.current = streamingConversationId;
  }, [streamingConversationId]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!user || !accessToken) return;

    try {
      const response = await apiClient.getConversations({
        userId: user.id,
        accessToken: accessToken
      });

      const conversationsData = (response as any).conversations ?? (response as any).data ?? response ?? [];
      const conversationArray = Array.isArray(conversationsData) ? conversationsData : [];

      const formattedConversations = conversationArray.map((conv: any) => ({
        id: conv.id,
        title: conv.title || getConversationDefaultTitle(conv.created_at),
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        last_message_at: conv.last_message_at || conv.updated_at,
        message_count: conv.message_count || 0
      }));

      setConversations(formattedConversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast({
        title: "Failed to load conversations",
        description: "Unable to load your conversations. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, accessToken, toast]);

  // Load messages for a conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    if (!user || !accessToken) return;

    try {
      const response = await apiClient.getConversationMessages(
        conversationId,
        { userId: user.id, accessToken: accessToken }
      );

      const messagesData = (response as any).messages ?? (response as any).data ?? response ?? [];
      const messageArray = Array.isArray(messagesData) ? messagesData : [];

      const formattedMessages: Message[] = messageArray.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        created_at: msg.created_at,
        metadata: msg.metadata
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast({
        title: "Failed to load messages",
        description: "Unable to load messages for this conversation.",
        variant: "destructive",
      });
    }
  }, [user, accessToken, toast]);

  // Create new conversation
  const createNewConversation = useCallback(async () => {
    if (!user || !accessToken) return;

    try {
      console.log('[CREATE_CONVERSATION] Creating new conversation via API');

      // Create conversation via REST API
      const response = await apiClient.createConversation(
        { title: 'New Conversation' },
        { userId: user.id, accessToken }
      );

      const newConversation = response.data || response;
      console.log('[CREATE_CONVERSATION] Conversation created:', newConversation.id);

      // Add to conversations list
      setConversations(prev => [newConversation, ...prev]);

      // Select the new conversation
      setSelectedConversation(newConversation.id);
      setMessages([]);
      setInputMessage('');
      setSelectedContextItems([]);

      toast({
        title: "New conversation created",
        description: "Start chatting!",
      });
    } catch (error) {
      console.error('[CREATE_CONVERSATION] Error creating conversation:', error);
      toast({
        title: "Failed to create conversation",
        description: "Unable to create a new conversation. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, accessToken, toast, setConversations, setSelectedConversation, setMessages, setInputMessage, setSelectedContextItems]);

  // Delete conversation
  const deleteConversation = useCallback(async (conversationId: string) => {
    if (!user || !accessToken) return;

    try {
      await apiClient.deleteConversation({
        userId: user.id,
        conversationId: conversationId,
        accessToken: accessToken
      });

      setConversations(prev => prev.filter(conv => conv.id !== conversationId));

      if (selectedConversation === conversationId) {
        setSelectedConversation(null);
        setMessages([]);
        setInputMessage('');
      }

      // Remove draft for deleted conversation
      setConversationDrafts(prev => {
        const newDrafts = { ...prev };
        delete newDrafts[conversationId];
        return newDrafts;
      });

      toast({
        title: "Conversation deleted",
        description: "The conversation has been deleted successfully.",
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: "Failed to delete conversation",
        description: "Unable to delete the conversation. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, accessToken, selectedConversation, toast]);

  // Rename conversation
  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    if (!user || !accessToken) return;

    try {
      await apiClient.updateConversation({
        userId: user.id,
        conversationId: conversationId,
        title: title,
        accessToken: accessToken
      });

      setConversations(prev => prev.map(conv =>
        conv.id === conversationId ? { ...conv, title } : conv
      ));

      toast({
        title: "Conversation renamed",
        description: "The conversation has been renamed successfully.",
      });
    } catch (error) {
      console.error('Error renaming conversation:', error);
      toast({
        title: "Failed to rename conversation",
        description: "Unable to rename the conversation. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, accessToken, toast]);

  // Export conversation
  const exportConversation = useCallback(async (conversationId: string, title: string) => {
    try {
      const transcript = buildConversationTranscript(messages);
      const blob = new Blob([transcript], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_${conversationId.substring(0, 8)}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Conversation exported",
        description: "The conversation has been exported successfully.",
      });
    } catch (error) {
      console.error('Error exporting conversation:', error);
      toast({
        title: "Failed to export conversation",
        description: "Unable to export the conversation. Please try again.",
        variant: "destructive",
      });
    }
  }, [messages, toast]);

  // Send message
  const sendMessage = useCallback(async () => {
    if (!inputMessage.trim() || !user || !accessToken) return;

    try {
      const ws = getChatWebSocket();
      if (!ws?.isConnected) {
        toast({
          title: "Connection Error",
          description: "Please wait for the connection to be established.",
          variant: "destructive",
        });
        return;
      }

      // Create temporary message for immediate UI feedback
      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: inputMessage,
        created_at: new Date().toISOString(),
        metadata: {
          context_items: selectedContextItems
        }
      };

      setMessages(prev => [...prev, tempMessage]);
      setInputMessage('');
      setSelectedContextItems([]);

      // Send message via WebSocket
      const event = {
        type: 'message.create',
        data: {
          user_id: user.id,
          conversation_id: selectedConversation || null,
          content: inputMessage,
          metadata: {
            context_items: selectedContextItems
          }
        }
      };

      ws.sendEvent(event);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Failed to send message",
        description: "Unable to send your message. Please try again.",
        variant: "destructive",
      });
    }
  }, [inputMessage, user, accessToken, selectedConversation, selectedContextItems, toast]);

  // Handle conversation selection
  const handleConversationSelect = useCallback((conversationId: string | null) => {
    saveCurrentDraft(selectedConversation);
    setSelectedConversation(conversationId);
  }, [selectedConversation]);

  // Save current draft
  const saveCurrentDraft = useCallback((conversationId: string | null) => {
    if (!conversationId || !inputMessage.trim()) return;

    setConversationDrafts(prev => ({
      ...prev,
      [conversationId]: {
        message: inputMessage,
        contextItems: selectedContextItems,
        timestamp: new Date().toISOString()
      }
    }));
  }, [inputMessage, selectedContextItems]);

  // Restore draft
  const restoreDraft = useCallback((conversationId: string | null) => {
    if (!conversationId) return;

    const draft = conversationDrafts[conversationId];
    if (draft) {
      setInputMessage(draft.message || '');
      setSelectedContextItems(draft.contextItems || []);
    }
  }, [conversationDrafts]);

  return {
    // State
    conversations,
    selectedConversation,
    messages,
    inputMessage,
    conversationDrafts,
    selectedContextItems,
    streamingConversationId,
    currentStatus,

    // Actions
    setConversations,
    setSelectedConversation,
    setMessages,
    setInputMessage,
    setConversationDrafts,
    setSelectedContextItems,
    setStreamingConversationId,
    setCurrentStatus,

    // Functions
    loadConversations,
    loadMessages,
    createNewConversation,
    deleteConversation,
    renameConversation,
    exportConversation,
    sendMessage,
    handleConversationSelect,
    saveCurrentDraft,
    restoreDraft,

    // Refs
    selectedConversationRef,
    streamingConversationIdRef
  };
}