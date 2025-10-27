import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useChatWebSocket } from '@/hooks/useChatWebSocket';
import { useNotifications } from '@/hooks/useNotifications';
import { useChatStore } from '@/stores/chatStore';
import { useChatState } from '@/hooks/useChatState';
import { useAutocomplete } from '@/hooks/useAutocomplete';
import type { ChatEvent } from '@/services/chatWebSocket';
import { useToast } from '@/hooks/use-toast';
import { FolderSelectorDialog } from '@/components/chat/FolderSelectorDialog';
import { FileUploadDialog } from '@/components/chat/FileUploadDialog';
import { useFileOperations } from '@/utils/chatFileOperations';
import { apiClient } from '@/services/apiClient';
import type {
  Message,
  SelectedContextItem,
  SelectedSource
} from '@/components/chat/types/chat';
import { type StatusType } from '@/components/chat/StatusTile';
import {
  PLACEHOLDER_TEXTS,
  ANIMATION_CSS
} from '@/components/chat/utils/chatConstants';
import {
  parseAtRefs,
  getConversationDefaultTitle
} from '@/components/chat/utils/chatUtils';
import { ChatEmptyState } from '@/components/chat/components/ChatEmptyState';
import { SourceContentDialog } from '@/components/chat/components/SourceContentDialog';
import { DeleteConversationDialog } from '@/components/chat/components/DeleteConversationDialog';
import { useViewportInfo } from '@/hooks/useViewportInfo';
import { useMobilePerformance } from '@/hooks/useMobilePerformance';
import { PullToRefresh } from '@/components/knowledge/mobile/PullToRefresh';
import { MobileChatHeader } from '@/components/chat/mobile/MobileChatHeader';
import { MobileMessagesList } from '@/components/chat/mobile/MobileMessagesList';
import { MobileChatInput } from '@/components/chat/mobile/MobileChatInput';

/**
 * Mobile-optimized chat page with touch gestures, keyboard awareness, and native mobile UX
 * Features: pull-to-refresh, swipe gestures, keyboard-aware input, mobile-optimized layout
 */
export default function MobileChatPage() {
  const { user, loading, accessToken } = useAuth();
  const { isKeyboardVisible } = useViewportInfo();

  // Mobile performance optimization
  useMobilePerformance({
    enableMetrics: true,
    messageVirtualizationThreshold: 30,
    performanceMonitoringInterval: 3000
  });

  // Store and notification hooks for background generation
  const chatStore = useChatStore();
  const { requestPermission, isGranted } = useNotifications();
  const hasRequestedNotifications = useRef(false);

  // Chat state using the dedicated hook
  const {
    conversations,
    selectedConversation,
    messages,
    inputMessage,
    selectedContextItems,
    setSelectedConversation,
    setMessages,
    setInputMessage,
    setSelectedContextItems,
    loadConversations,
    loadMessages,
    createNewConversation,
    handleConversationSelect,
    renameConversation,
    deleteConversation,
    exportConversation,
    saveCurrentDraft,
    restoreDraft
  } = useChatState({
    user,
    accessToken,
    chatStore
  });

  // WebSocket connection with state tracking
  const { isConnected, isConnecting, addEventListener: addWebSocketEventListener, sendMessage: sendWebSocketMessage, reconnect } = useChatWebSocket();

  // Initialize toast hook
  const { toast } = useToast();

  // Handle WebSocket events - complete streaming implementation
  const handleWebSocketEvent = useCallback((event: ChatEvent) => {
    console.log('[MOBILE_CHAT_WS] Received event:', event.type);

    switch (event.type) {
      case 'conversation.created':
        // Update conversation list when a new conversation is created
        console.log('[MOBILE_CHAT_WS] New conversation created:', event.data.conversation_id);
        loadConversations();
        if (event.data.conversation_id) {
          setSelectedConversation(event.data.conversation_id);
        }
        break;

      case 'response.created':
        console.log('[MOBILE_CHAT_WS] Response started for conversation:', event.data.conversation_id);
        setIsStreaming(true);
        setStreamingMessage('');
        setStreamingConversationId(event.data.conversation_id);
        setCurrentStatus({ type: 'starting', message: 'Thinking...' });
        break;

      case 'tool.web_search.start':
        console.log('[MOBILE_CHAT_WS] Web search started');
        setCurrentStatus({ type: 'web_search', message: 'Searching the web...' });
        break;

      case 'tool.web_search.complete':
        console.log('[MOBILE_CHAT_WS] Web search completed');
        setCurrentStatus({ type: 'generating', message: 'Processing search results...' });
        break;

      case 'tool.file_search.start':
        console.log('[MOBILE_CHAT_WS] File search started with queries:', event.data.queries);
        const queries = event.data.queries?.join(', ') || 'your files';
        setCurrentStatus({
          type: 'file_search',
          message: 'Searching files for',
          details: `"${queries}"`
        });
        break;

      case 'tool.file_search.complete':
        console.log('[MOBILE_CHAT_WS] File search completed');
        setCurrentStatus({ type: 'generating', message: 'Processing file results...' });
        break;

      case 'tool.code_interpreter.start':
        console.log('[MOBILE_CHAT_WS] Code interpreter started');
        setCurrentStatus({ type: 'code_interpreter', message: 'Running code interpreter...' });
        break;

      case 'tool.code_interpreter.code_delta':
        console.log('[MOBILE_CHAT_WS] Code delta:', event.data.delta?.substring(0, 60));
        setCurrentStatus({
          type: 'code_interpreter',
          message: 'Writing code:',
          details: event.data.delta?.substring(0, 60) + '...'
        });
        break;

      case 'tool.code_interpreter.complete':
        console.log('[MOBILE_CHAT_WS] Code interpreter completed');
        setCurrentStatus({ type: 'generating', message: 'Processing code results...' });
        break;

      case 'text.delta':
        console.log('[MOBILE_CHAT_WS] Streaming text delta:', event.data.delta.substring(0, 50));
        setStreamingMessage(prev => prev + event.data.delta);
        setCurrentStatus({ type: 'generating', message: 'Generating response' });
        break;

      case 'response.completed':
        console.log('[MOBILE_CHAT_WS] Response completed for conversation:', event.data.conversation_id);

        // Show complete status briefly
        setCurrentStatus({ type: 'complete', message: 'Response complete' });
        setTimeout(() => {
          setCurrentStatus(null);
          setIsStreaming(false);
          setStreamingMessage('');
          setStreamingConversationId(null);
        }, 1000);

        // Add final message to array
        const newMessage: Message = {
          id: event.data.message_id,
          role: 'assistant',
          content: event.data.content,
          created_at: new Date().toISOString(),
          metadata: {
            sources: event.data.sources
          }
        };

        setMessages(prev => [...prev, newMessage]);

        // Refresh conversations to update title
        loadConversations();
        break;

      case 'error':
        const errorMsg = event.data?.message || event.message || 'An error occurred';
        console.error('[MOBILE_CHAT_WS] Error:', errorMsg);
        setCurrentStatus(null);
        setIsStreaming(false);
        setStreamingMessage('');
        setStreamingConversationId(null);
        toast({
          title: "Error",
          description: errorMsg,
          variant: "destructive",
        });
        break;

      default:
        // Log other events for debugging
        console.log('[MOBILE_CHAT_WS] Unhandled event:', event.type);
        break;
    }
  }, [loadConversations, setSelectedConversation, setMessages, toast]);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Autocomplete functionality
  const {
    showAutocomplete,
    autocompleteType,
    unifiedSuggestions,
    selectedAutocompleteIndex,
    selectUnifiedSuggestion
  } = useAutocomplete({
    inputMessage,
    setInputMessage,
    setSelectedContextItems,
    inputRef
  });

  // File operations hook
  const {
    downloadSourceFile
  } = useFileOperations({ user, accessToken });

  // Local state for folder operations
  const [showFileUploadDialog, setShowFileUploadDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showFolderSelectForUpload, setShowFolderSelectForUpload] = useState(false);
  const [messageToSave, setMessageToSave] = useState<Message | null>(null);
  const [userFolders, setUserFolders] = useState<any[]>([]);

  // Handler functions for file operations
  const handleFileUpload = async (file: File, folderId: string) => {
    if (!user || !accessToken) {
      toast({
        title: 'Upload failed',
        description: 'You must be logged in to upload files',
        variant: 'destructive',
      });
      return;
    }

    try {
      console.log('[MOBILE_CHAT_FILE_UPLOAD] Uploading file:', file.name, 'to folder:', folderId);

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_id', folderId);

      // Upload file with progress tracking
      const result = await apiClient.uploadFileWithProgress(
        formData,
        { userId: user.id, accessToken },
        (progress) => {
          console.log('[MOBILE_CHAT_FILE_UPLOAD] Upload progress:', progress, '%');
        }
      );

      console.log('[MOBILE_CHAT_FILE_UPLOAD] Upload successful:', result);

      toast({
        title: 'File uploaded',
        description: `${file.name} uploaded successfully`,
      });

      setShowFileUploadDialog(false);
    } catch (error) {
      console.error('[MOBILE_CHAT_FILE_UPLOAD] Failed to upload file:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload file',
        variant: 'destructive',
      });
    }
  };

  const handleSaveToKnowledgeBase = async (folderId: string, customTitle?: string) => {
    if (!user || !accessToken || !messageToSave) {
      toast({
        title: 'Save failed',
        description: 'Missing required information',
        variant: 'destructive',
      });
      return;
    }

    try {
      console.log('[MOBILE_CHAT_SAVE_KB] Saving message to knowledge base:', {
        messageId: messageToSave.id,
        folderId,
        title: customTitle
      });

      // Save the message to knowledge base using the API
      await apiClient.saveMessageToKnowledgeBase(
        messageToSave.id,
        {
          folder_id: folderId,
          title: customTitle || `Chat Response: ${messageToSave.content.split('\n')[0].slice(0, 100)}`,
          add_context: true
        },
        { userId: user.id, accessToken }
      );

      console.log('[MOBILE_CHAT_SAVE_KB] Save successful');

      toast({
        title: 'Saved to knowledge base',
        description: 'Content saved successfully',
      });

      setShowSaveDialog(false);
      setMessageToSave(null);
    } catch (error) {
      console.error('[MOBILE_CHAT_SAVE_KB] Failed to save to knowledge base:', error);
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save content',
        variant: 'destructive',
      });
    }
  };

  const handleFolderSelectedForUpload = async (folderId: string, customTitle?: string) => {
    if (!user || !accessToken || !selectedConversation) {
      toast({
        title: 'Save failed',
        description: 'No conversation selected',
        variant: 'destructive',
      });
      return;
    }

    try {
      console.log('[MOBILE_CHAT_SAVE_CONV] Saving conversation to folder:', folderId, 'with title:', customTitle);

      // Get conversation title
      const conversation = conversations.find(conv => conv.id === selectedConversation);
      const title = customTitle || getConversationDefaultTitle(conversation, messages);

      // Create text content from conversation
      const content = messages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');

      // Save as text content to knowledge base
      await apiClient.createContent(
        {
          title,
          content,
          content_type: 'text/plain',
          folder_id: folderId,
          metadata: {
            description: `Chat conversation saved on ${new Date().toLocaleDateString()}`,
            tags: ['chat', 'conversation']
          }
        },
        { userId: user.id, accessToken }
      );

      console.log('[MOBILE_CHAT_SAVE_CONV] Conversation saved successfully');

      setShowFolderSelectForUpload(false);
      toast({
        title: 'Conversation saved',
        description: `Saved to knowledge base as "${title}"`,
      });
    } catch (error) {
      console.error('[MOBILE_CHAT_SAVE_CONV] Failed to save conversation:', error);
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save conversation',
        variant: 'destructive',
      });
    }
  };

  // Additional state
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(null);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  // Streaming state management (new approach)
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [currentStatus, setCurrentStatus] = useState<{type: StatusType; message?: string; details?: string} | null>(null);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);

  // Add custom CSS animations
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

  // Load conversations on mount
  useEffect(() => {
    if (user && accessToken) {
      loadConversations();
    }
  }, [user, accessToken, loadConversations]);

  // Load user folders for file upload and save dialogs
  useEffect(() => {
    const loadFolders = async () => {
      if (!user || !accessToken) return;

      try {
        console.log('[MOBILE_CHAT_FOLDERS] Loading user folders...');
        const folders = await apiClient.getFolders({ userId: user.id, accessToken });
        const folderArray = Array.isArray(folders) ? folders : [];
        setUserFolders(folderArray);
        console.log('[MOBILE_CHAT_FOLDERS] Loaded', folderArray.length, 'folders');
      } catch (error) {
        console.error('[MOBILE_CHAT_FOLDERS] Failed to load folders:', error);
        // Don't show error toast here, as it's not critical for chat functionality
      }
    };

    loadFolders();
  }, [user, accessToken]);

  // Request notification permission for mobile
  useEffect(() => {
    if (!hasRequestedNotifications.current && user && !isGranted) {
      hasRequestedNotifications.current = true;
      requestPermission();
    }
  }, [user, isGranted, requestPermission]);

  // WebSocket event handling
  useEffect(() => {
    const unsubscribe = addWebSocketEventListener(handleWebSocketEvent);

    return () => {
      unsubscribe();
    };
  }, [handleWebSocketEvent, addWebSocketEventListener]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamingMessage]);

  // Restore draft when conversation changes
  useEffect(() => {
    if (selectedConversation) {
      restoreDraft(selectedConversation);
    } else {
      setInputMessage('');
    }
  }, [selectedConversation, restoreDraft, setInputMessage]);

  // Save draft as user types
  useEffect(() => {
    if (selectedConversation && inputMessage.trim()) {
      const timeoutId = setTimeout(() => {
        saveCurrentDraft(selectedConversation);
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [inputMessage, selectedConversation, saveCurrentDraft]);

  // Event handlers
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputMessage(value);

    // Handle @mentions for autocomplete
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^@\s]*)$/);

    if (atMatch) {
      // Trigger autocomplete for @mentions
      // This would integrate with the existing autocomplete system
    }
  }, [setInputMessage]);

  const sendMessage = useCallback(async () => {
    if (!inputMessage.trim() || isConnecting || !user || !accessToken) return;

    const messageText = inputMessage.trim();
    setInputMessage('');

    if (selectedConversation) {
      // Clear the draft by setting it to empty
      saveCurrentDraft(selectedConversation);
    }

    // Create user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageText,
      role: 'user',
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);

    // Process @mentions in message
    const mentionedNames = parseAtRefs(messageText);
    const mentionedItems: SelectedContextItem[] = mentionedNames.map((name) => ({
      id: name, // Use name as ID temporarily
      name: name,
      type: 'file' as const // Default to file type
    }));
    if (mentionedItems.length > 0) {
      setSelectedContextItems(mentionedItems);
    }

    try {
      // Send message via WebSocket - convert to format expected by WebSocket
      const contextItems = mentionedItems.map(item => ({
        id: item.id,
        type: item.type
      }));

      await sendWebSocketMessage(
        messageText,
        selectedConversation,
        contextItems
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: 'Failed to send message',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    }
  }, [inputMessage, isConnecting, user, accessToken, selectedConversation,
      setInputMessage, setMessages, setSelectedContextItems, saveCurrentDraft, sendWebSocketMessage, toast]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && inputMessage.trim() && !isConnecting) {
      e.preventDefault();
      sendMessage();
    }
    // Autocomplete handling removed for mobile - not needed in mobile UI
  }, [inputMessage, isConnecting, sendMessage]);

  const onSelectConversation = useCallback(async (conversationId: string) => {
    console.log('[MOBILE_CHAT_SELECT] Selecting conversation:', conversationId);
    handleConversationSelect(conversationId);
    setShowMobileSidebar(false);

    // Load messages for the selected conversation
    await loadMessages(conversationId);
  }, [handleConversationSelect, loadMessages]);

  const handleNewConversation = useCallback(() => {
    createNewConversation();
    setShowMobileSidebar(false);
  }, [createNewConversation]);

  const handleRefresh = useCallback(async () => {
    if (selectedConversation) {
      handleConversationSelect(selectedConversation);
    }
    await loadConversations();
    if (!isConnected) {
      reconnect();
    }
  }, [selectedConversation, handleConversationSelect, loadConversations, isConnected, reconnect]);

  // Placeholder text that changes based on state
  const placeholderText = useMemo(() => {
    if (isConnecting) return 'Connecting...';
    if (!isConnected) return 'Reconnecting...';
    return PLACEHOLDER_TEXTS[Math.floor(Math.random() * PLACEHOLDER_TEXTS.length)];
  }, [isConnecting, isConnected]);

  // Mobile layout style with proper viewport handling
  const layoutStyle = useMemo(
    () => ({
      minHeight: 'calc(var(--app-vh, 100vh) - 3.5rem)',
      height: 'calc(var(--app-vh, 100vh) - 3.5rem)',
    }),
    []
  );

  // Content style that adjusts for keyboard
  const contentStyle = useMemo(
    () => ({
      height: isKeyboardVisible ? 'calc(var(--app-vh, 100vh) - 8rem)' : 'calc(var(--app-vh, 100vh) - 6rem)',
      transition: 'height 0.3s ease-out'
    }),
    [isKeyboardVisible]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div
      className="bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800 flex flex-col overflow-hidden"
      style={layoutStyle}
    >
      {/* Mobile Header */}
      <MobileChatHeader
        conversations={conversations}
        selectedConversation={selectedConversation}
        onConversationSelect={onSelectConversation}
        onNewConversation={handleNewConversation}
        isConnected={isConnected}
        isConnecting={isConnecting}
        showMobileSidebar={showMobileSidebar}
        setShowMobileSidebar={setShowMobileSidebar}
        onRenameConversation={renameConversation}
        onExportConversation={exportConversation}
        onDeleteConversation={(id) => setConversationToDelete(id)}
        chatStore={chatStore}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden" style={contentStyle}>
        {selectedConversation || messages.length > 0 || inputMessage.trim() ? (
          <>
            {/* Messages List with Pull-to-Refresh */}
            <PullToRefresh onRefresh={handleRefresh}>
              <MobileMessagesList
                messages={messages}
                isStreaming={isStreaming}
                streamingMessage={streamingMessage}
                streamingConversationId={streamingConversationId}
                selectedConversation={selectedConversation}
                currentStatus={currentStatus}
                selectedContextItems={selectedContextItems}
                user={user}
                onSourceClick={(source) => {
                  setSelectedSource(source);
                  setShowSourceDialog(true);
                }}
                onSaveMessage={(message) => {
                  console.log('[MOBILE_CHAT_SAVE] User requested to save message:', message.id);
                  setMessageToSave(message);
                  setShowSaveDialog(true);
                }}
                onCopyMessage={(content) => {
                  navigator.clipboard.writeText(content);
                }}
                messagesEndRef={messagesEndRef}
              />
            </PullToRefresh>

            {/* Mobile Chat Input */}
            <MobileChatInput
              inputMessage={inputMessage}
              isLoading={isConnecting}
              placeholder={placeholderText}
              showAutocomplete={showAutocomplete}
              autocompleteType={autocompleteType}
              unifiedSuggestions={unifiedSuggestions}
              selectedAutocompleteIndex={selectedAutocompleteIndex}
              inputRef={inputRef}
              onInputChange={handleInputChange}
              onKeyPress={handleKeyPress}
              onSendMessage={sendMessage}
              onFileUploadClick={() => setShowFileUploadDialog(true)}
              onSaveConversationClick={() => setShowFolderSelectForUpload(true)}
              onSelectUnifiedSuggestion={selectUnifiedSuggestion}
              isKeyboardVisible={isKeyboardVisible}
            />
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center p-6">
            <PullToRefresh onRefresh={handleRefresh}>
              <ChatEmptyState user={user} isKeyboardOpen={isKeyboardVisible} />
            </PullToRefresh>
          </div>
        )}
      </div>

      {/* Dialogs and Overlays */}
      <SourceContentDialog
        showSourceDialog={showSourceDialog}
        setShowSourceDialog={setShowSourceDialog}
        selectedSource={selectedSource}
        onDownloadSourceFile={downloadSourceFile}
      />

      <DeleteConversationDialog
        conversationToDelete={conversationToDelete}
        onOpenChange={(open) => !open && setConversationToDelete(null)}
        onConfirmDelete={() => {
          if (conversationToDelete) {
            deleteConversation(conversationToDelete);
            setConversationToDelete(null);
          }
        }}
      />

      <FolderSelectorDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        folders={userFolders}
        onSelect={handleSaveToKnowledgeBase}
        defaultTitle={messageToSave ? `Chat Response: ${messageToSave.content.split('\n')[0].slice(0, 100)}` : ''}
        showTitleInput={true}
      />

      <FolderSelectorDialog
        open={showFolderSelectForUpload}
        onOpenChange={setShowFolderSelectForUpload}
        folders={userFolders}
        onSelect={handleFolderSelectedForUpload}
        defaultTitle={getConversationDefaultTitle(
          conversations.find(conv => conv.id === selectedConversation),
          messages
        )}
        showTitleInput={true}
      />

      <FileUploadDialog
        open={showFileUploadDialog}
        onOpenChange={setShowFileUploadDialog}
        folders={userFolders}
        onUpload={handleFileUpload}
      />
    </div>
  );
}