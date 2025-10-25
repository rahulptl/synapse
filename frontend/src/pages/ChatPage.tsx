import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useChatWebSocket } from '@/hooks/useChatWebSocket';
import { useNotifications } from '@/hooks/useNotifications';
import { useChatStore } from '@/stores/chatStore';
import { useSidebarState } from '@/hooks/useSidebarState';
import { useChatWebSocketHandler } from '@/hooks/useChatWebSocketHandler';
import { useChatState } from '@/hooks/useChatState';
import { useAutocomplete } from '@/hooks/useAutocomplete';
import { getChatWebSocket } from '@/services/chatWebSocket';
import type { ChatEvent } from '@/services/chatWebSocket';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Bot, Trash2, Bookmark, PanelLeft, Download, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/apiClient';
import { FolderSelectorDialog } from '@/components/chat/FolderSelectorDialog';
import { FileUploadDialog } from '@/components/chat/FileUploadDialog';
import { useFileOperations } from '@/utils/chatFileOperations';
import { StatusTilesContainer } from '@/components/chat/StatusTilesContainer';
import { StatusType } from '@/components/chat/StatusTile';
import { ModernConversationList } from '@/components/chat/ModernConversationList';
import type {
  Message,
  Conversation,
  ChatSource,
  HashtagInfo,
  UnifiedSuggestion,
  SelectedContextItem,
  ConversationDrafts,
  SelectedSource
} from '@/components/chat/types/chat';
import {
  SEARCH_MESSAGES,
  PLACEHOLDER_TEXTS,
  ANIMATION_CSS
} from '@/components/chat/utils/chatConstants';
import {
  parseAtRefs,
  getConversationDefaultTitle,
  buildConversationTranscript
} from '@/components/chat/utils/chatUtils';
import { ChatEmptyState } from '@/components/chat/components/ChatEmptyState';
import { ChatStatusBar } from '@/components/chat/components/ChatStatusBar';
import { ContextItemsPreview } from '@/components/chat/components/ContextItemsPreview';
import { UserMessage } from '@/components/chat/components/UserMessage';
import { AssistantMessage } from '@/components/chat/components/AssistantMessage';
import { ChatInput } from '@/components/chat/components/ChatInput';
import { StreamingMessage } from '@/components/chat/components/StreamingMessage';
import { SourceContentDialog } from '@/components/chat/components/SourceContentDialog';
import { DeleteConversationDialog } from '@/components/chat/components/DeleteConversationDialog';
import { ConversationSidebar } from '@/components/chat/components/ConversationSidebar';

// Lazy load MarkdownMessage to prevent highlight.js initialization issues
const MarkdownMessage = lazy(() => import('@/components/chat/MarkdownMessage').then(module => ({ default: module.MarkdownMessage })));


export default function ChatPage() {
  const { user, loading, accessToken } = useAuth();
  const location = useLocation();

  // Store and notification hooks for background generation
  const chatStore = useChatStore();
  const { requestPermission, showNotification, isGranted } = useNotifications();
  const hasRequestedNotifications = useRef(false);

  // Sidebar state for toggle functionality (create chat-specific instance)
  const { collapsed, toggleCollapsed } = useSidebarState('chat');

  // Add custom CSS animations and chat tail styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = ANIMATION_CSS;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);
  // TODO: Complete useChatState hook integration after removing duplicates
  // const {
  //   conversations,
  //   selectedConversation,
  //   messages,
  //   inputMessage,
  //   conversationDrafts,
  //   selectedContextItems,
  //   setConversations,
  //   setSelectedConversation,
  //   setMessages,
  //   setInputMessage,
  //   setConversationDrafts,
  //   setSelectedContextItems,
  //   loadConversations,
  //   loadMessages,
  //   createNewConversation,
  //   deleteConversation,
  //   renameConversation,
  //   exportConversation,
  //   sendMessage: sendChatMessage,
  //   handleConversationSelect,
  //   saveCurrentDraft,
  //   restoreDraft,
  //   selectedConversationRef
  // } = useChatState({
  //   user,
  //   accessToken,
  //   chatStore
  // });

  // Original state declarations (to be replaced by hook above)
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [conversationDrafts, setConversationDrafts] = useState<ConversationDrafts>({});
  const [selectedContextItems, setSelectedContextItems] = useState<SelectedContextItem[]>([]);
  const selectedConversationRef = useRef<string | null>(null);
  const streamingConversationIdRef = useRef<string | null>(null);

  // Remaining UI state (not extracted)
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<{
    type: StatusType;
    message?: string;
    details?: string;
  } | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // Keep refs in sync with state for WebSocket event handler
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    streamingConversationIdRef.current = streamingConversationId;
  }, [streamingConversationId]);
  const [hashtagInfo, setHashtagInfo] = useState<HashtagInfo | null>(null);
  const [userFolders, setUserFolders] = useState<Array<{ id: string; name: string }>>([]);

  // Refs need to be declared before hooks that use them
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isCreatingNewConversation = useRef(false);

  // Use extracted autocomplete hook
  const {
    showAutocomplete,
    autocompleteType,
    autocompleteQuery,
    selectedAutocompleteIndex,
    cursorPosition,
    unifiedSuggestions,
    handleInputChange,
    selectUnifiedSuggestion,
    handleAutocompleteNavigation
  } = useAutocomplete({
    user,
    accessToken,
    inputMessage,
    setInputMessage,
    setSelectedContextItems,
    inputRef
  });
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [messageToSave, setMessageToSave] = useState<Message | null>(null);
  const [showFolderSelectForUpload, setShowFolderSelectForUpload] = useState(false);
  const [showFileUploadDialog, setShowFileUploadDialog] = useState(false);
  const { toast } = useToast();

  // File operations utility
  const { exportConversation, downloadGeneratedFile, downloadSourceFile } = useFileOperations({
    user,
    accessToken,
    toast
  });

  // WebSocket hook
  const { isConnected, isConnecting, sendMessage: sendWSMessage, addEventListener } = useChatWebSocket();

  // Streaming state already declared above in "Remaining UI state" section

  // Single quirky search message
  const [searchMessage] = useState(
    SEARCH_MESSAGES[Math.floor(Math.random() * SEARCH_MESSAGES.length)]
  );

  // Quirky AI placeholder texts
  const [placeholder, setPlaceholder] = useState(
    PLACEHOLDER_TEXTS[Math.floor(Math.random() * PLACEHOLDER_TEXTS.length)]
  );

  // Animated typing component
  const TypingIndicator = () => (
    <div className="flex items-center space-x-1">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-current rounded-full animate-bounce"></div>
      </div>
    </div>
  );

  // selectedContextItems and ref sync now handled by useChatState hook

  // Debug: Log when messages state changes
  useEffect(() => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 [MESSAGES STATE] Messages changed, count:', messages.length);
    console.log('[MESSAGES STATE] Messages:', messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content.substring(0, 40) + '...'
    })));
  }, [messages]);

  useEffect(() => {
    if (user) {
      loadConversations();
      loadUserFolders();
    }
  }, [user]);

  // Handle pre-selected context from navigation (Issue 4: Initiate Chat from KB)
  useEffect(() => {
    const state = location.state as any;

    if (state?.preSelectedFolder) {
      // Pre-populate with folder hashtag
      const folderName = state.preSelectedFolder.name;
      setInputMessage(`#${folderName} `);

      // Focus input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);

      // Show helper toast
      toast({
        title: "Chat Context Set",
        description: `Ask questions about "${folderName}"`,
      });

      // Clear the navigation state to prevent re-triggering
      window.history.replaceState({}, document.title);
    } else if (state?.preSelectedItem) {
      // Pre-populate with item reference
      const itemTitle = state.preSelectedItem.title;
      setInputMessage(`@${itemTitle} `);

      // Focus input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);

      // Show helper toast
      toast({
        title: "Chat Context Set",
        description: `Ask questions about "${itemTitle}"`,
      });

      // Clear the navigation state to prevent re-triggering
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

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
      setInputMessage(conversationDrafts[conversationId]);
    } else {
      console.log('[DRAFT] 🗑️ No draft to restore, clearing input');
      setInputMessage('');
    }
  };

  useEffect(() => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 [EFFECT] selectedConversation changed:', selectedConversation);
    console.log('[EFFECT] isCreatingNewConversation.current:', isCreatingNewConversation.current);

    if (selectedConversation) {
      // Skip loadMessages if we're in the middle of creating a new conversation
      // This prevents wiping the temp user message that was just added
      if (!isCreatingNewConversation.current) {
        console.log('[EFFECT] 📥 Calling loadMessages for:', selectedConversation);
        loadMessages(selectedConversation);
      } else {
        console.log('[EFFECT] ⏭️ Skipping loadMessages - creating new conversation');
      }
      restoreDraft(selectedConversation);
      // Don't clear streaming state - let it persist for background conversations
    } else {
      console.log('[EFFECT] 🗑️ Clearing messages - no conversation selected');
      setMessages([]);
      setInputMessage('');
      // Don't clear streaming state - let it persist for background conversations
    }
  }, [selectedConversation]);

  // Request notification permission on mount and handle page visibility
  useEffect(() => {
    // Request notification permission once
    if (!hasRequestedNotifications.current) {
      hasRequestedNotifications.current = true;

      // Optional: Show a friendly prompt first
      if (!isGranted) {
        // You could show a toast/dialog explaining why you want notification permission
        requestPermission();
      }
    }
  }, [isGranted, requestPermission]);

  // Track background mode based on page visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      const ws = getChatWebSocket();

      if (document.hidden) {
        // Page is hidden - activate background mode
        console.log('Chat page hidden - activating background mode');
        ws.setBackgroundMode(true, selectedConversation);
      } else {
        // Page is visible - deactivate background mode
        console.log('Chat page visible - deactivating background mode');
        ws.setBackgroundMode(false, null);

        // Check for pending responses
        if (selectedConversation && chatStore.getHasPendingResponse(selectedConversation)) {
          const pending = chatStore.pendingResponses.get(selectedConversation);
          if (pending) {
            // Add the completed message to UI
            setMessages(prev => [...prev, pending.message]);

            // Clear from pending
            chatStore.clearPendingResponse(selectedConversation);

            // Show toast
            toast({
              title: "✨ Response Ready",
              description: "Your AI assistant finished while you were away!",
            });
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedConversation, chatStore, toast]);

  // Keyboard shortcut for toggling sidebar (Cmd/Ctrl + B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapsed]);

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

      // Don't clear streaming state - let it persist for background conversations
      // The streaming bubble will only show if streamingConversationId === selectedConversation
      console.log('[CONVERSATION_SWITCH] Keeping streaming state for background conversation');
      console.log('[CONVERSATION_SWITCH] Current streamingConversationId:', streamingConversationId);

      console.log('[CONVERSATION_SWITCH] Setting selectedConversation to:', conversationId);
      setSelectedConversation(conversationId);
    } else {
      console.log('[CONVERSATION_SWITCH] ⏭️ Same conversation, skipping');
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Define loadConversations with useCallback BEFORE it's used in useEffect
  const loadConversations = useCallback(async () => {
    if (!user || !accessToken) return;

    try {
      const response = await apiClient.getConversations({
        userId: user.id,
        accessToken: accessToken
      });

      setConversations(response.data || response || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive",
      });
    }
  }, [user, accessToken, toast]);

  // Handle WebSocket events using extracted hook
  const { handleEvent } = useChatWebSocketHandler({
    isConnected,
    selectedConversationRef,
    streamingConversationIdRef,
    isCreatingNewConversation,
    addEventListener,
    loadConversations,
    onSetSelectedConversation: setSelectedConversation,
    onSetMessages: setMessages,
    onSetStreamingMessage: setStreamingMessage,
    onSetIsStreaming: setIsStreaming,
    onSetStreamingConversationId: setStreamingConversationId,
    onSetIsLoading: setIsLoading,
    onSetCurrentStatus: setCurrentStatus
  });

  useEffect(() => {
    if (!isConnected) return;
    const cleanup = addEventListener(handleEvent);
    return cleanup;
  }, [isConnected, addEventListener, handleEvent]);

  const loadUserFolders = async () => {
    if (!user || !accessToken) return;

    try {
      const response = await apiClient.getFolders({
        userId: user.id,
        accessToken: accessToken
      });

      const foldersData = (response as any).folders ?? (response as any).data ?? response ?? [];
      const folderArray = Array.isArray(foldersData) ? foldersData : [];

      console.log('[FOLDER_TREE] Raw folders from API:', folderArray);
      console.log('[FOLDER_TREE] Folders with children:', folderArray.filter((f: any) => f.children && f.children.length > 0).map((f: any) => `${f.name} (${f.children.length})`));

      // The API already returns hierarchical structure with children!
      // Just use it directly instead of rebuilding
      setUserFolders(folderArray);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  };

  const loadMessages = async (conversationId: string) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📥 [LOAD_MESSAGES] Starting for conversation:', conversationId);
    if (!user || !accessToken) return;

    try {
      const response = await apiClient.getConversationMessages(
        conversationId,
        {
          userId: user.id,
          accessToken: accessToken
        }
      );

      const messages = response.data || response || [];
      console.log('[LOAD_MESSAGES] Received from backend:', messages.length, 'messages');
      console.log('[LOAD_MESSAGES] Messages:', messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content?.substring(0, 30), metadata: m.metadata })));

      setMessages(prev => {
        console.log('[LOAD_MESSAGES] Previous messages count:', prev.length);
        const newMessages = messages.map((msg: any) => {
          if (msg.metadata) {
            console.log('[LOAD_MESSAGES] Message', msg.id, 'has metadata:', msg.metadata);
            if (msg.metadata.sources) {
              console.log('[LOAD_MESSAGES] ✅ Message has sources:', msg.metadata.sources.length, 'sources');
            }
            if (msg.metadata.generated_files) {
              console.log('[LOAD_MESSAGES] ✅ Message has generated_files:', msg.metadata.generated_files.length, 'files');
              for (const gf of msg.metadata.generated_files) {
                console.log('[LOAD_MESSAGES] - Generated file:', gf.filename, '(id:', gf.id, ')');
              }
            }
          } else {
            console.log('[LOAD_MESSAGES] Message', msg.id, 'has NO metadata');
          }
          return {
            ...msg,
            metadata: msg.metadata as Message['metadata']
          };
        });
        console.log('[LOAD_MESSAGES] ⚠️ REPLACING all messages with backend data');
        return newMessages;
      });
    } catch (error) {
      console.error('[LOAD_MESSAGES] ❌ Error:', error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive",
      });
    }
  };

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
      setConversations(prev => [newConversation, ...prev]);
      handleConversationSelect(newConversation.id);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
    }
  };

  const initiateDeleteConversation = (conversationId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // Prevent selecting the conversation when clicking delete
    }
    setConversationToDelete(conversationId);
  };

  const confirmDeleteConversation = async () => {
    if (!conversationToDelete || !user || !accessToken) return;

    try {
      await apiClient.deleteConversation(conversationToDelete, {
        userId: user.id,
        accessToken: accessToken
      });

      // Remove from conversations list
      setConversations(prev => prev.filter(conv => conv.id !== conversationToDelete));

      // If this was the selected conversation, clear selection
      if (selectedConversation === conversationToDelete) {
        handleConversationSelect(null);
        setMessages([]);
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
    } finally {
      setConversationToDelete(null);
    }
  };

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
      setConversations(prev => prev.map(conv =>
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

  const handleExportConversation = (conversationId: string, title: string) => {
    // Export the conversation transcript as a text file
    try {
      // Get the conversation's messages
      const conversation = conversations.find(c => c.id === conversationId);
      if (!conversation) return;

      // If this is the currently selected conversation, use current messages
      // Otherwise, we'd need to fetch them
      let messagesToExport = conversationId === selectedConversation ? messages : [];

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

  const sendMessage = async () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📤 [SEND] sendMessage called');
    console.log('[SEND] selectedConversation:', selectedConversation);
    console.log('[SEND] selectedConversationRef.current:', selectedConversationRef.current);

    if (!inputMessage.trim() || !user || !accessToken) return;
    if (!isConnected) {
      toast({
        title: "Connection Error",
        description: "WebSocket not connected. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    const userMessage = inputMessage.trim();
    console.log('[SEND] Message content:', userMessage.substring(0, 50));

    // Track if we're creating a new conversation
    if (!selectedConversation) {
      console.log('[SEND] Creating new conversation, setting flag');
      isCreatingNewConversation.current = true;
    }

    // Track generation start in store
    if (selectedConversation) {
      chatStore.startGeneration(selectedConversation, userMessage);
    }

    // Clear current draft since message is being sent
    if (selectedConversation) {
      setConversationDrafts(prev => {
        const newDrafts = { ...prev };
        delete newDrafts[selectedConversation];
        return newDrafts;
      });
    }

    setInputMessage('');
    setIsLoading(true);
    setHashtagInfo(null);
    setStreamingMessage('');
    setIsStreaming(false);
    setCurrentStatus(null);

    // Clear selected context items after sending
    const contextItemsCopy = [...selectedContextItems];
    setSelectedContextItems([]);

    // Add user message immediately to UI with temporary ID
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    console.log('[SEND] Adding temp message to UI:', tempUserMessage.id);
    console.log('[SEND] Current messages count before add:', messages.length);
    setMessages(prev => {
      const newMessages = [...prev, tempUserMessage];
      console.log('[SEND] Messages after adding temp:', newMessages.length);
      console.log('[SEND] Last message ID:', newMessages[newMessages.length - 1].id);
      return newMessages;
    });

    try {
      // Prepare context items for backend (include name for display)
      const contextItems = contextItemsCopy.map(item => ({
        id: item.id,
        type: item.type,
        name: item.name
      }));

      // Send via WebSocket
      await sendWSMessage(userMessage, selectedConversation, contextItems);

    } catch (error) {
      console.error('Send message error:', error);
      // Remove the temporary message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      setIsLoading(false);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  // handleInputChange now provided by useAutocomplete hook
  // const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  //   // Function body removed - now handled by useAutocomplete hook

  // selectUnifiedSuggestion now provided by useAutocomplete hook
  // const selectUnifiedSuggestion = (suggestion: typeof unifiedSuggestions[0]) => {
  //   // Function body removed - now handled by useAutocomplete hook

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (showAutocomplete && autocompleteType === 'unified') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleAutocompleteNavigation('down');

        // Scroll the selected item into view
        setTimeout(() => {
          const suggestionElements = document.querySelectorAll('[data-suggestion-index]');
          const selectedElement = suggestionElements[selectedAutocompleteIndex] as HTMLElement;
          if (selectedElement) {
            selectedElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest'
            });
          }
        }, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleAutocompleteNavigation('up');

        // Scroll the selected item into view
        setTimeout(() => {
          const suggestionElements = document.querySelectorAll('[data-suggestion-index]');
          const selectedElement = suggestionElements[selectedAutocompleteIndex] as HTMLElement;
          if (selectedElement) {
            selectedElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest'
            });
          }
        }, 0);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        handleAutocompleteNavigation('enter');
      } else if (e.key === 'Escape') {
        handleAutocompleteNavigation('escape');
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Function to view source content
  const viewSource = async (source: any) => {
    try {
      console.log('[VIEW_SOURCE] 🎯 Opening source:', source.title, '(id:', source.id, ')');
      console.log('[VIEW_SOURCE] 📋 Source object:', source);

      setSelectedSource({
        title: source.title,
        source: source.source,
        similarity: source.similarity,
        content: "Loading source content..."
      });
      setShowSourceDialog(true);

      // Try to fetch the actual content from knowledge base via backend API
      try {
        if (!user || !accessToken) {
          console.log('[VIEW_SOURCE] ❌ No authentication - user:', !!user, 'token:', !!accessToken);
          setSelectedSource((prev: any) => prev ? {
            ...prev,
            content: "Authentication required to load source content."
          } : null);
          return;
        }

        console.log('[VIEW_SOURCE] 🔍 Searching for content with query:', source.title);
        const response = await apiClient.searchContent(
          {
            query: source.title,
            search_type: 'text',
            limit: 1
          },
          {
            userId: user.id,
            accessToken
          }
        );

        console.log('[VIEW_SOURCE] 📡 Search API response:', response);
        // Handle different response structures - some APIs return results directly, others nest them
        const apiResponse = (response as any).data || response;
        const results = apiResponse.results || apiResponse || [];
        console.log('[VIEW_SOURCE] 📊 Search results:', results.length, 'items found');
        console.log('[VIEW_SOURCE] 📋 Results array:', results);

        if (results.length > 0) {
          const item = results[0];
          console.log('[VIEW_SOURCE] ✅ Found item:', item.title, 'id:', item.id);
          console.log('[VIEW_SOURCE] 📄 Content length:', item.content?.length || 0);
          console.log('[VIEW_SOURCE] 📄 Content preview:', item.content?.substring(0, 100) + '...' || 'No content');
          console.log('[VIEW_SOURCE] 📁 File metadata:', item.metadata);

          setSelectedSource((prev: any) => prev ? {
            ...prev,
            content: item.content || "No content available for this source.",
            id: item.id,
            fileMetadata: item.metadata, // Store file metadata for download
            contentType: item.content_type
          } : null);
        } else {
          console.log('[VIEW_SOURCE] ❌ No results found for title:', source.title);
          setSelectedSource((prev: any) => prev ? {
            ...prev,
            content: "Could not load the full content for this source. The source may have been moved or deleted."
          } : null);
        }
      } catch (fetchError) {
        console.error('[VIEW_SOURCE] 💥 Error fetching source content:', fetchError);
        console.error('[VIEW_SOURCE] 💥 Error details:', {
          message: fetchError.message,
          status: fetchError.response?.status,
          statusText: fetchError.response?.statusText,
          data: fetchError.response?.data
        });
        setSelectedSource((prev: any) => prev ? {
          ...prev,
          content: `Error loading source content: ${fetchError.message || 'Unknown error'}`
        } : null);
      }
    } catch (error) {
      console.error('[VIEW_SOURCE] 💥 General error:', error);
      toast({
        title: "Error",
        description: "Could not load source",
        variant: "destructive",
      });
    }
  };

  // Function to initiate save message to knowledge base
  const initiateSaveMessage = (message: Message) => {
    setMessageToSave(message);
    setShowSaveDialog(true);
  };

  // Function to save message to knowledge base
  const handleSaveToKnowledgeBase = async (folderId: string, customTitle?: string) => {
    if (!messageToSave || !user || !accessToken) return;

    try {
      // Generate title from message content if not provided
      const title = customTitle || `Chat Response: ${messageToSave.content.split('\n')[0].slice(0, 100)}`;

      await apiClient.saveMessageToKnowledgeBase(
        messageToSave.id,
        {
          folder_id: folderId,
          title,
          add_context: true
        },
        {
          userId: user.id,
          accessToken
        }
      );

      toast({
        title: "Saved to Memory",
        description: `"${title}" has been added to your memory`,
      });

      // Emit event for real-time KB update
      window.dispatchEvent(new CustomEvent('knowledge-item-added', {
        detail: {
          folderId,
          title
        }
      }));
    } catch (error) {
      console.error('Failed to save message:', error);
      toast({
        title: "Error",
        description: "Failed to save message to knowledge base",
        variant: "destructive",
      });
    }
  };

  // Function to handle upload button click
  const handleUploadClick = () => {
    if (userFolders.length === 0) {
      toast({
        title: "No folders available",
        description: "Please create a folder in Memory first",
        variant: "destructive",
      });
      return;
    }

    if (!selectedConversation) {
      toast({
        title: "Select a conversation",
        description: "Open a conversation before saving it to your memory",
        variant: "destructive",
      });
      return;
    }

    if (messages.length === 0) {
      toast({
        title: "Nothing to save yet",
        description: "Send a message to start the conversation before saving it",
        variant: "destructive",
      });
      return;
    }

    setShowFolderSelectForUpload(true);
  };

  // Function to handle folder selection for saving conversation transcript
  const handleFolderSelectedForUpload = async (folderId: string, customTitle?: string) => {
    if (!user || !accessToken || !selectedConversation) {
      return;
    }

    const transcriptBody = buildConversationTranscript();
    if (!transcriptBody.trim()) {
      toast({
        title: "Nothing to save",
        description: "The current conversation is empty.",
        variant: "destructive",
      });
      return;
    }

    const baseTitle = getConversationDefaultTitle(conversations.find(conv => conv.id === selectedConversation), messages);
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
    } finally {
      setShowFolderSelectForUpload(false);
    }
  };


  // File upload handlers
  const handleFileUploadClick = () => {
    console.log("[UPLOAD] Opening file upload dialog");
    setShowFileUploadDialog(true);
  };

  const handleFileUpload = async (file: File, folderId: string, customTitle?: string) => {
    if (!user || !accessToken) return;

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder_id", folderId);
      formData.append("title", customTitle || file.name);

      const response = await apiClient.uploadFile(formData, {
        userId: user.id,
        accessToken: accessToken
      }) as any;

      console.log('[FILE_UPLOAD] Upload response:', response);

      toast({
        title: "File uploaded",
        description: `"${file.name}" has been uploaded to your memory`,
      });

      // Add the uploaded file to chat context
      if (response && response.item && response.item.id) {
        const fileName = response.item.title || customTitle || file.name;
        const uploadedItem: SelectedContextItem = {
          id: response.item.id,
          name: fileName,
          type: 'file'
        };

        // Add to selected context items
        setSelectedContextItems(prev => [...prev, uploadedItem]);

        // Add @reference to input message
        // Wrap filename in quotes if it contains spaces
        const formattedName = fileName.includes(' ') ? `"${fileName}"` : fileName;
        const reference = `@${formattedName}`;
        setInputMessage(prev => {
          const trimmed = prev.trim();
          return trimmed ? `${trimmed} ${reference} ` : `${reference} `;
        });

        console.log('[FILE_UPLOAD] Added to context:', uploadedItem);

        // Focus the input
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }

      // Emit event for real-time KB update
      window.dispatchEvent(new CustomEvent("knowledge-item-added", {
        detail: {
          folderId
        }
      }));
    } catch (error) {
      console.error("Failed to upload file:", error);
      toast({
        title: "Error",
        description: "Failed to upload file",
        variant: "destructive",
      });
    }
  };
  // Function to download generated files (reuses knowledge base download logic)
  const handleDownloadGeneratedFile = async (file: { id: string; filename: string }) => {
    if (!user || !accessToken) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to download files',
        variant: 'destructive',
      });
      return;
    }

    try {
      const download = await apiClient.downloadItemFile(file.id, {
        userId: user.id,
        accessToken,
      });

      // Use filename from file object, fallback to response filename
      const finalFilename = file.filename || download.filename || 'download';

      // Trigger browser download
      apiClient.downloadBlob(download.blob, finalFilename);

      toast({
        title: 'Download started',
        description: `Downloading ${finalFilename}`,
      });
    } catch (error) {
      console.error('Failed to download generated file:', error);
      toast({
        title: 'Download failed',
        description: 'Failed to download the file. Please try again.',
        variant: 'destructive',
      });
    }
  };


  // Function to download source files
  const handleDownloadSourceFile = async (source: any) => {
    if (!user || !accessToken) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to download files',
        variant: 'destructive',
      });
      return;
    }

    try {
      console.log('[DOWNLOAD_SOURCE] 📥 Downloading source file:', source.title, '(id:', source.id, ')');
      console.log('[DOWNLOAD_SOURCE] 📁 File metadata:', source.fileMetadata);
      console.log('[DOWNLOAD_SOURCE] 🔍 Full source object:', source);

      if (!source.fileMetadata?.original_filename) {
        toast({
          title: 'Download not available',
          description: 'This source does not have a downloadable file.',
          variant: 'destructive',
        });
        return;
      }

      console.log('[DOWNLOAD_SOURCE] 🌐 Making API call to: /files/download/' + source.id);
      console.log('[DOWNLOAD_SOURCE] 🔐 Auth info - User ID:', user.id, 'Token length:', accessToken?.length || 0);
      console.log('[DOWNLOAD_SOURCE] 🔐 Token preview:', accessToken?.substring(0, 20) + '...' || 'No token');

      const download = await apiClient.downloadItemFile(source.id, {
        userId: user.id,
        accessToken,
      });

      // Use filename from file metadata, fallback to response filename
      const finalFilename = source.fileMetadata.original_filename || download.filename || source.title || 'download';

      // Trigger browser download
      apiClient.downloadBlob(download.blob, finalFilename);

      toast({
        title: 'Download started',
        description: `Downloading ${finalFilename}`,
      });
    } catch (error) {
      console.error('Failed to download source file:', error);
      toast({
        title: 'Download failed',
        description: 'Failed to download the source file. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Function to start new chat (currently unused but kept for future use)
  // const startNewChat = async () => {
  //   setSelectedConversation(null);
  //   setMessages([]);
  //   setHashtagInfo(null);
  //   setShowAutocomplete(false);
  // };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {/* Conversation Sidebar - Handles both desktop and mobile */}
      <ConversationSidebar
        conversations={conversations}
        selectedConversation={selectedConversation}
        onConversationSelect={handleConversationSelect}
        onNewConversation={createNewConversation}
        onRenameConversation={handleRenameConversation}
        onExportConversation={handleExportConversation}
        onDeleteConversation={initiateDeleteConversation}
        hasPendingResponse={(conversationId) => chatStore.getHasPendingResponse(conversationId)}
        collapsed={collapsed}
        chatStore={chatStore}
        onToggleCollapsed={toggleCollapsed}
        showMobileSidebar={showMobileSidebar}
        setShowMobileSidebar={setShowMobileSidebar}
      />


      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedConversation || messages.length > 0 || inputMessage.trim() ? (
          <>
            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4 md:p-8">
              <div className="space-y-4 max-w-4xl mx-auto">
                <ChatStatusBar isConnected={isConnected} isConnecting={isConnecting} />

                {messages.map((message) => {
                  return (
                  <div key={message.id} className="group message-appear">
                    {message.role === 'user' ? (
                      <UserMessage
                        message={message}
                        user={user}
                        hashtagInfo={hashtagInfo}
                        onSaveMessage={initiateSaveMessage}
                      />
                    ) : (
                      <AssistantMessage
                        message={message}
                        onViewSource={viewSource}
                        onDownloadGeneratedFile={handleDownloadGeneratedFile}
                        onSaveMessage={initiateSaveMessage}
                      />
                    )}
                  </div>
                  );
                })}

                {/* Streaming message indicator */}
                <StreamingMessage
                  isStreaming={isStreaming}
                  streamingMessage={streamingMessage}
                  streamingConversationId={streamingConversationId}
                  selectedConversation={selectedConversation}
                  currentStatus={currentStatus}
                />
                <div ref={messagesEndRef} />

              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <ChatEmptyState user={user} />
          </div>
        )}

        <div className="flex-shrink-0">
          <ChatInput
            inputMessage={inputMessage}
            isLoading={isLoading}
            placeholder={placeholder}
            showAutocomplete={showAutocomplete}
            autocompleteType={autocompleteType}
            unifiedSuggestions={unifiedSuggestions}
            selectedAutocompleteIndex={selectedAutocompleteIndex}
            inputRef={inputRef}
            onInputChange={handleInputChange}
            onKeyPress={handleKeyPress}
            onFileUploadClick={handleFileUploadClick}
            onSendMessage={sendMessage}
            onSaveConversationClick={handleUploadClick}
            onSelectUnifiedSuggestion={selectUnifiedSuggestion}
          />
        </div>
      </div>

      <SourceContentDialog
        showSourceDialog={showSourceDialog}
        setShowSourceDialog={setShowSourceDialog}
        selectedSource={selectedSource}
        onDownloadSourceFile={handleDownloadSourceFile}
      />

      <DeleteConversationDialog
        conversationToDelete={conversationToDelete}
        onOpenChange={(open) => !open && setConversationToDelete(null)}
        onConfirmDelete={confirmDeleteConversation}
      />

      {/* Save to Memory Dialog */}
      <FolderSelectorDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        folders={userFolders}
        onSelect={handleSaveToKnowledgeBase}
        defaultTitle={messageToSave ? `Chat Response: ${messageToSave.content.split('\n')[0].slice(0, 100)}` : ''}
        showTitleInput={true}
      />

      {/* Folder Selector for Conversation Upload */}
      <FolderSelectorDialog
        open={showFolderSelectForUpload}
        onOpenChange={setShowFolderSelectForUpload}
        folders={userFolders}
        onSelect={handleFolderSelectedForUpload}
        defaultTitle={getConversationDefaultTitle(conversations.find(conv => conv.id === selectedConversation), messages)}
        showTitleInput={true}
      />

      {/* Unified File Upload Dialog */}
      <FileUploadDialog
        open={showFileUploadDialog}
        onOpenChange={setShowFileUploadDialog}
        folders={userFolders}
        onUpload={handleFileUpload}
      />
    </div>
  );
}
