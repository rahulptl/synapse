import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useChatWebSocket } from '@/hooks/useChatWebSocket';
import { useNotifications } from '@/hooks/useNotifications';
import { useChatStore } from '@/stores/chatStore';
import { useSidebarState } from '@/hooks/useSidebarState';
import { getChatWebSocket } from '@/services/chatWebSocket';
import type { ChatEvent } from '@/services/chatWebSocket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Send, MessageSquare, Plus, Folder, Bot, Search, Brain, Sparkles, ExternalLink, AlertTriangle, Trash2, Menu, FileText, Bookmark, Upload, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { apiClient } from '@/services/apiClient';
import { FolderSelectorDialog } from '@/components/chat/FolderSelectorDialog';
import { StatusTilesContainer } from '@/components/chat/StatusTilesContainer';
import { StatusType } from '@/components/chat/StatusTile';
import { ModernConversationList } from '@/components/chat/ModernConversationList';

// Lazy load MarkdownMessage to prevent highlight.js initialization issues
const MarkdownMessage = lazy(() => import('@/components/chat/MarkdownMessage').then(module => ({ default: module.MarkdownMessage })));
interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
  metadata?: {
    sources?: Array<{
      title: string;
      source: string;
      similarity: number;
    }>;
  };
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatSource {
  title: string;
  source: string;
  similarity: number;
}

interface HashtagInfo {
  detected_hashtags: string[];
  detected_file_refs?: string[];
  recognized_folders: Array<{ id: string; name: string }>;
  recognized_files?: Array<{
    id: string;
    title: string;
    folder_id?: string | null;
    reference: string;
    match_score: number;
    matched_field: string;
  }>;
  unrecognized_hashtags: string[];
  unrecognized_file_refs?: string[];
  folder_filtered: boolean;
  file_filtered?: boolean;
}

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
    style.textContent = `
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fade-in {
        animation: fade-in 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      }
      @keyframes message-appear {
        from { opacity: 0; transform: translateX(-15px) scale(0.95); }
        to { opacity: 1; transform: translateX(0) scale(1); }
      }
      .message-appear {
        animation: message-appear 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      }
      @keyframes glow {
        0%, 100% { box-shadow: 0 0 10px rgba(59, 130, 246, 0.3); }
        50% { box-shadow: 0 0 25px rgba(59, 130, 246, 0.6); }
      }
      .glow-animation {
        animation: glow 2.5s ease-in-out infinite;
      }
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      .float-animation {
        animation: float 6s ease-in-out infinite;
      }

        `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationDrafts, setConversationDrafts] = useState<Record<string, string>>({});
  const [hashtagInfo, setHashtagInfo] = useState<HashtagInfo | null>(null);
  const [userFolders, setUserFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<'unified' | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [unifiedSuggestions, setUnifiedSuggestions] = useState<Array<{
    id: string;
    name: string;
    type: 'folder' | 'file';
    depth: number;
    match_score: number;
    content_type?: string;
    folder_id?: string;
    folder_name?: string;
    path?: string;
    has_children?: boolean;
  }>>([]);
  const [selectedSource, setSelectedSource] = useState<any | null>(null);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [messageToSave, setMessageToSave] = useState<Message | null>(null);
  const [showFolderSelectForUpload, setShowFolderSelectForUpload] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isCreatingNewConversation = useRef(false);
  const selectedConversationRef = useRef<string | null>(null);
  const streamingConversationIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  // WebSocket hook
  const { isConnected, isConnecting, sendMessage: sendWSMessage, addEventListener } = useChatWebSocket();

  // State for streaming message
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingConversationId, setStreamingConversationId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<{
    type: StatusType;
    message?: string;
    details?: string;
  } | null>(null);

  // Single quirky search message
  const searchMessages = [
    "Rummaging through your brain files... 🧠",
    "Shaking the knowledge tree... 🌳",
    "Following the digital breadcrumbs... 🍞",
    "Consulting the data spirits... 👻",
    "Brewing some answer magic... ✨",
    "Digging through the archives... 🕵️",
    "Whispering to the algorithms... 🤫"
  ];
  const [searchMessage] = useState(
    searchMessages[Math.floor(Math.random() * searchMessages.length)]
  );

  // Quirky AI placeholder texts
  const placeholderTexts = [
    "Ask me anything... I don't bite! 🤖",
    "Scratch your brain, I'll scratch mine... 🧠✨",
    "What's cooking in that brilliant mind? 💭",
    "Ready to explore your knowledge galaxy? 🚀",
    "Let's turn questions into answers! ⚡",
    "Your thoughts + My processing = Magic! ✨",
    "Curiosity called, I answered! 📞",
    "Ask away, I'm all ears... well, all code! 👂",
    "What mysteries shall we unravel today? 🔮",
    "Feed me questions, I'll serve wisdom! 🍽️"
  ];
  const [placeholder, setPlaceholder] = useState(
    placeholderTexts[Math.floor(Math.random() * placeholderTexts.length)]
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

  // Track selected context items (folders and files) with their types and IDs
  const [selectedContextItems, setSelectedContextItems] = useState<Array<{
    id: string;
    name: string;
    type: 'folder' | 'file';
  }>>([]);

  // Parse @ references from input message (now for both folders and files)
  const parseAtRefs = (message: string) => {
    // Handle both quoted names (@"About Me") and unquoted (@About)
    const atRefRegex = /@"([^"]+)"|@(\S+)/g;
    const atRefs: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = atRefRegex.exec(message)) !== null) {
      // Use group 1 for quoted names, group 2 for unquoted
      const refName = match[1] || match[2];
      atRefs.push(refName);
    }

    return atRefs;
  };

  // Render message with highlighted hashtags
  const renderMessageWithHashtags = (message: string, hashtagInfo?: HashtagInfo) => {
    if (!hashtagInfo || hashtagInfo.detected_hashtags.length === 0) {
      return message;
    }

    const hashtagRegex = /#([\w\-_]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = hashtagRegex.exec(message)) !== null) {
      // Add text before hashtag
      if (match.index > lastIndex) {
        parts.push(message.slice(lastIndex, match.index));
      }

      const hashtagName = match[1];
      const isRecognized = hashtagInfo.recognized_folders.some(f => f.name === hashtagName);

      // Add highlighted hashtag
      parts.push(
        <Badge
          key={match.index}
          variant={isRecognized ? "default" : "secondary"}
          className={`mx-1 ${isRecognized ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}
        >
          <Folder className="h-3 w-3 mr-1" />
          #{hashtagName}
        </Badge>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < message.length) {
      parts.push(message.slice(lastIndex));
    }

    return parts;
  };

  const getConversationDefaultTitle = () => {
    const conversation = conversations.find(conv => conv.id === selectedConversation);
    const normalizedTitle = conversation?.title?.trim();
    if (normalizedTitle && normalizedTitle.toLowerCase() !== 'new conversation') {
      return normalizedTitle;
    }

    const firstAssistantMessage = messages.find(msg => msg.role === 'assistant');
    if (firstAssistantMessage?.content) {
      return `Chat Insight: ${firstAssistantMessage.content.split('\n')[0].slice(0, 80)}`;
    }

    const firstUserMessage = messages.find(
      msg => msg.role !== 'assistant' && msg.role !== 'system'
    );
    if (firstUserMessage?.content) {
      return `Chat Thread: ${firstUserMessage.content.split('\n')[0].slice(0, 80)}`;
    }

    const referenceTimestamp =
      conversation?.created_at || messages[0]?.created_at || new Date().toISOString();
    return `Conversation ${new Date(referenceTimestamp).toLocaleString()}`;
  };

  const buildConversationTranscript = () => {
    if (messages.length === 0) {
      return '';
    }

    return messages
      .map((msg) => {
        const roleLabel =
          msg.role === 'assistant'
            ? 'Assistant'
            : msg.role === 'system'
              ? 'System'
              : 'You';
        const timestamp = new Date(msg.created_at).toLocaleString();
        const body = msg.content?.trim() ?? '';
        return `${roleLabel} (${timestamp})\n${body}`;
      })
      .join('\n\n');
  };

  // Keep refs in sync with state for WebSocket event handler
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    streamingConversationIdRef.current = streamingConversationId;
  }, [streamingConversationId]);

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

  // Handle WebSocket events
  useEffect(() => {
    if (!isConnected) return;

    const handleEvent = (event: ChatEvent) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📨 [WS EVENT]', event.type);
      console.log('[WS EVENT] Data:', event.data);
      console.log('[WS EVENT] Current selectedConversationRef:', selectedConversationRef.current);
      console.log('[WS EVENT] Current streamingConversationIdRef:', streamingConversationIdRef.current);

      switch (event.type) {
        case 'response.created':
          // Always accept response.created for new conversations or matching conversation
          // This handles: null/undefined conversation_id (new conv) OR matching existing conv
          if (!selectedConversationRef.current || !event.data.conversation_id || event.data.conversation_id === selectedConversationRef.current) {
            console.log('[STREAM] Initializing streaming on response.created');
            // Track which conversation is streaming
            setStreamingConversationId(event.data.conversation_id || selectedConversationRef.current);
            // Initialize streaming immediately to show loading state
            setIsStreaming(true);
            setStreamingMessage(''); // Empty message initially
            setCurrentStatus({
              type: 'starting',
              message: 'Starting generation'
            });
          } else {
            console.log('[STREAM] Skipping response.created - conversation mismatch', {
              selected: selectedConversationRef.current,
              event: event.data.conversation_id
            });
          }
          break;

        case 'conversation.created':
          console.log('[CONVERSATION.CREATED] New conversation ID:', event.data.conversation_id);
          console.log('[CONVERSATION.CREATED] Previous selectedConversation:', selectedConversationRef.current);
          console.log('[CONVERSATION.CREATED] isCreatingNewConversation flag:', isCreatingNewConversation.current);

          // Update conversation ID
          console.log('[CONVERSATION.CREATED] Setting selectedConversation to:', event.data.conversation_id);
          setSelectedConversation(event.data.conversation_id);

          console.log('[CONVERSATION.CREATED] Loading conversations list');
          loadConversations();
          // Clear the flag after conversation is created and selectedConversation is set
          // We'll wait for message.created to actually clear it to ensure temp message is replaced first
          break;

        case 'message.created':
          console.log('[MESSAGE.CREATED] Role:', event.data.role);
          console.log('[MESSAGE.CREATED] Conversation ID:', event.data.conversation_id);
          console.log('[MESSAGE.CREATED] Message ID:', event.data.message_id);
          console.log('[MESSAGE.CREATED] Content preview:', event.data.content?.substring(0, 50));

          // Replace temporary user message with real one from backend
          // Accept for new conversations or matching conversation
          const shouldProcessMessage = event.data.role === 'user' && (!selectedConversationRef.current || event.data.conversation_id === selectedConversationRef.current);
          console.log('[MESSAGE.CREATED] Should process?', shouldProcessMessage);
          console.log('[MESSAGE.CREATED] Condition breakdown:');
          console.log('  - Is user message?', event.data.role === 'user');
          console.log('  - No selected conversation?', !selectedConversationRef.current);
          console.log('  - Matches selected?', event.data.conversation_id === selectedConversationRef.current);

          if (shouldProcessMessage) {
            console.log('[MESSAGE] ✅ Processing - Replacing temp user message with real one');
            setMessages(prev => {
              console.log('[MESSAGE] Current messages count:', prev.length);
              console.log('[MESSAGE] Current messages:', prev.map(m => ({ id: m.id, role: m.role, content: m.content.substring(0, 30) })));

              // Find and replace the temporary message
              const tempMessageIndex = prev.findIndex(msg => msg.id.startsWith('temp-'));
              console.log('[MESSAGE] Temp message index found:', tempMessageIndex);

              if (tempMessageIndex !== -1) {
                const newMessages = [...prev];
                newMessages[tempMessageIndex] = {
                  id: event.data.message_id,
                  role: 'user',
                  content: event.data.content,
                  created_at: new Date().toISOString(),
                  metadata: event.data.metadata // Include context items from backend
                };
                console.log('[MESSAGE] ✅ Replaced temp message with real message:', event.data.message_id);
                console.log('[MESSAGE] New messages count:', newMessages.length);
                return newMessages;
              } else {
                console.log('[MESSAGE] ⚠️ No temp message found to replace!');
              }
              return prev;
            });
          } else {
            console.log('[MESSAGE] ❌ Skipping - conditions not met');
          }
          break;

        case 'text.delta':
          // Only process streaming for currently selected conversation (or accept if no conversation selected yet)
          if (!selectedConversationRef.current || event.data.conversation_id === selectedConversationRef.current) {
            console.log('[STREAM] Adding delta:', event.data.delta.substring(0, 20));
            setStreamingMessage(prev => {
              const newContent = prev + event.data.delta;
              console.log('[STREAM] Total content length:', newContent.length);
              return newContent;
            });
            setIsStreaming(true);
            setCurrentStatus({
              type: 'generating',
              message: 'Generating response'
            });
          } else {
            console.log('[STREAM] Skipping delta - conversation mismatch', {
              selected: selectedConversationRef.current,
              event: event.data.conversation_id
            });
          }
          break;

        case 'tool.web_search.start':
          setCurrentStatus({
            type: 'web_search',
            message: 'Searching the web for',
            details: event.data.query ? `"${event.data.query}"` : undefined
          });
          break;

        case 'tool.web_search.complete':
          setCurrentStatus({
            type: 'generating',
            message: 'Processing search results...',
            details: undefined
          });
          break;

        case 'tool.file_search.start':
          const queries = event.data.queries?.join(', ') || 'your files';
          setCurrentStatus({
            type: 'file_search',
            message: 'Searching files for',
            details: `"${queries}"`
          });
          break;

        case 'tool.file_search.complete':
          setCurrentStatus({
            type: 'generating',
            message: 'Processing file results...',
            details: undefined
          });
          break;

        case 'tool.code_interpreter.start':
          setCurrentStatus({
            type: 'code_interpreter',
            message: 'Running code interpreter...',
            details: undefined
          });
          break;

        case 'tool.code_interpreter.code_delta':
          setCurrentStatus({
            type: 'code_interpreter',
            message: 'Writing code:',
            details: event.data.delta ? `${event.data.delta.substring(0, 60)}...` : undefined
          });
          break;

        case 'tool.code_interpreter.complete':
          setCurrentStatus({
            type: 'generating',
            message: 'Processing code results...',
            details: undefined
          });
          break;

        case 'response.completed':
          // Process response completion (accept for new conversations or matching conversation)
          if (!selectedConversationRef.current || event.data.conversation_id === selectedConversationRef.current) {
            console.log('[STREAM] Response completed, adding final message');

            // Only clear streaming state if this is the conversation we're tracking
            if (event.data.conversation_id === streamingConversationIdRef.current) {
              // Show complete status briefly
              setCurrentStatus({
                type: 'complete',
                message: 'Response complete'
              });

              // Hide after 1 second
              setTimeout(() => {
                setCurrentStatus(null);
              }, 1000);

              // Clear streaming state
              setStreamingMessage('');
              setIsStreaming(false);
              setStreamingConversationId(null);
              setIsLoading(false);
            }

            // Add complete message to messages array
            const newMessage: Message = {
              id: event.data.message_id,
              role: 'assistant',
              content: event.data.content,
              created_at: new Date().toISOString(),
              metadata: {
                sources: event.data.sources
              }
            };

            console.log('[STREAM] Final message content:', event.data.content.substring(0, 100));
            setMessages(prev => [...prev, newMessage]);

            // Update conversation ID if this was a new conversation
            if (!selectedConversationRef.current && event.data.conversation_id) {
              console.log('[STREAM] Setting conversation ID from completed event:', event.data.conversation_id);
              setSelectedConversation(event.data.conversation_id);
            }

            // Refresh conversations to update title
            loadConversations();
          } else {
            console.log('[STREAM] Skipping response.completed - conversation mismatch', {
              selected: selectedConversationRef.current,
              event: event.data.conversation_id
            });
          }
          break;

        case 'error':
          const errorMsg = event.data?.message || event.message || 'An error occurred';
          toast({
            title: "Error",
            description: errorMsg,
            variant: "destructive",
          });
          setIsStreaming(false);
          setIsLoading(false);
          setStreamingMessage('');
          setStreamingConversationId(null);
          setCurrentStatus(null);
          break;
      }
    };

    const cleanup = addEventListener(handleEvent);
    return cleanup;
  }, [isConnected, addEventListener, loadConversations, toast]);

  const loadUserFolders = async () => {
    if (!user || !accessToken) return;

    try {
      const response = await apiClient.getFolders({
        userId: user.id,
        accessToken: accessToken
      });

      const foldersData = (response as any).folders ?? (response as any).data ?? response ?? [];
      const folderArray = Array.isArray(foldersData) ? foldersData : [];
      setUserFolders(folderArray.map((folder: any) => ({
        id: folder.id,
        name: folder.name
      })));
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

  const handleExportConversation = async (conversationId: string, title: string) => {
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
      // Prepare context items for backend
      const contextItems = contextItemsCopy.map(item => ({
        id: item.id,
        type: item.type
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

  // Handle input changes and detect unified @ autocomplete
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    setInputMessage(value);
    setCursorPosition(cursorPos);

    // Sync selected context items with message content
    // Parse current @ references in message
    const currentRefs = parseAtRefs(value);

    // Remove items that are no longer in the message
    setSelectedContextItems(prev => {
      return prev.filter(item => {
        // Check if this item's name is still referenced in the message
        const isStillReferenced = currentRefs.some(ref => {
          // Handle quoted and unquoted names
          const normalizedRef = ref.toLowerCase();
          const normalizedName = item.name.toLowerCase();
          return normalizedRef === normalizedName;
        });
        return isStillReferenced;
      });
    });

    // Check if we're typing @ for unified suggestions
    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\S*)$/);

    if (atMatch && user && accessToken) {
      // Unified autocomplete for both folders and files
      const query = atMatch[1];
      setAutocompleteQuery(query);
      setAutocompleteType('unified');
      setShowAutocomplete(true);
      setSelectedAutocompleteIndex(0);

      try {
        const auth = { userId: user.id, accessToken };
        const suggestions = await apiClient.getUnifiedSuggestions(
          query,
          auth,
          25
        );
        console.log('Unified suggestions received:', suggestions);
        setUnifiedSuggestions(suggestions as typeof unifiedSuggestions);
      } catch (error) {
        console.error('Failed to fetch unified suggestions:', error);
        setUnifiedSuggestions([]);
      }
    } else {
      setShowAutocomplete(false);
      setAutocompleteType(null);
      setUnifiedSuggestions([]);
    }
  };

  // Handle unified autocomplete selection
  const selectUnifiedSuggestion = (suggestion: typeof unifiedSuggestions[0]) => {
    const textBeforeCursor = inputMessage.substring(0, cursorPosition);
    const textAfterCursor = inputMessage.substring(cursorPosition);
    const atMatch = textBeforeCursor.match(/@(\S*)$/);

    if (atMatch) {
      const beforeAt = textBeforeCursor.substring(0, atMatch.index);
      // If name contains spaces, wrap it in quotes
      const formattedName = suggestion.name.includes(' ') ? `"${suggestion.name}"` : suggestion.name;
      const newText = beforeAt + '@' + formattedName + ' ' + textAfterCursor;
      setInputMessage(newText);
      setShowAutocomplete(false);

      // Add to selected context items
      setSelectedContextItems(prev => {
        // Check if already selected
        const exists = prev.some(item => item.id === suggestion.id && item.type === suggestion.type);
        if (exists) return prev;

        return [...prev, {
          id: suggestion.id,
          name: suggestion.name,
          type: suggestion.type
        }];
      });

      // Focus back to input and set cursor position
      setTimeout(() => {
        if (inputRef.current) {
          const newCursorPos = beforeAt.length + formattedName.length + 2; // +2 for @ and space
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (showAutocomplete && autocompleteType === 'unified') {
      const items = unifiedSuggestions;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = selectedAutocompleteIndex < items.length - 1 ? selectedAutocompleteIndex + 1 : 0;
        setSelectedAutocompleteIndex(newIndex);

        // Scroll the selected item into view
        setTimeout(() => {
          const suggestionElements = document.querySelectorAll('[data-suggestion-index]');
          const selectedElement = suggestionElements[newIndex] as HTMLElement;
          if (selectedElement) {
            selectedElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest'
            });
          }
        }, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = selectedAutocompleteIndex > 0 ? selectedAutocompleteIndex - 1 : items.length - 1;
        setSelectedAutocompleteIndex(newIndex);

        // Scroll the selected item into view
        setTimeout(() => {
          const suggestionElements = document.querySelectorAll('[data-suggestion-index]');
          const selectedElement = suggestionElements[newIndex] as HTMLElement;
          if (selectedElement) {
            selectedElement.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest'
            });
          }
        }, 0);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedAutocompleteIndex]) {
          selectUnifiedSuggestion(items[selectedAutocompleteIndex]);
        }
      } else if (e.key === 'Escape') {
        setShowAutocomplete(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Function to view source content
  const viewSource = async (source: any) => {
    try {
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
          setSelectedSource((prev: any) => prev ? {
            ...prev,
            content: "Authentication required to load source content."
          } : null);
          return;
        }

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

        const results = (response as any).data || response || [];
        if (results.length > 0) {
          const item = results[0];
          setSelectedSource((prev: any) => prev ? {
            ...prev,
            content: item.content || "No content available for this source.",
            id: item.id
          } : null);
        } else {
          setSelectedSource((prev: any) => prev ? {
            ...prev,
            content: "Could not load the full content for this source. The source may have been moved or deleted."
          } : null);
        }
      } catch (fetchError) {
        console.error('Error fetching source content:', fetchError);
        setSelectedSource((prev: any) => prev ? {
          ...prev,
          content: "Error loading source content. Please try again later."
        } : null);
      }
    } catch (error) {
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

    const baseTitle = getConversationDefaultTitle();
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

  // Conversation sidebar content component - now using ModernConversationList
  const ConversationSidebar = ({ collapsed }: { collapsed: boolean }) => (
    <ModernConversationList
      conversations={conversations}
      selectedConversation={selectedConversation}
      onConversationSelect={handleConversationSelect}
      onNewConversation={createNewConversation}
      onRenameConversation={handleRenameConversation}
      onExportConversation={handleExportConversation}
      onDeleteConversation={(conversationId) => initiateDeleteConversation(conversationId)}
      hasPendingResponse={(conversationId) => chatStore.getHasPendingResponse(conversationId)}
      collapsed={collapsed}
    />
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      {/* Desktop Left Sidebar - Conversations */}
      <div
        className={cn(
          'hidden md:flex transition-all duration-300 ease-in-out flex-shrink-0',
          'bg-sidebar/95 backdrop-blur-xl border-r border-sidebar-border',
          collapsed ? 'w-0 overflow-hidden' : 'w-80'
        )}
      >
        {!collapsed && <ConversationSidebar collapsed={collapsed} />}
      </div>

      {/* Floating Toggle Button - Desktop */}
      <div
        className={cn(
          'hidden md:flex fixed top-1/2 -translate-y-1/2 z-50',
          'transition-all duration-300 ease-in-out',
          collapsed ? 'left-[-24px]' : 'left-[296px]' // Peeking from screen edge / sidebar edge
        )}
      >
        <Button
          onClick={toggleCollapsed}
          variant="ghost"
          size="lg"
          className={cn(
            'w-12 h-12 rounded-full bg-sidebar/90 backdrop-blur-xl',
            'border border-sidebar-border transition-all duration-300',
            'hover:bg-sidebar hover:scale-110 active:scale-95',
            'text-sidebar-foreground flex items-center justify-center',
            // Enhanced shadows for depth
            collapsed
              ? 'shadow-[2px_0_8px_rgba(0,0,0,0.1)] shadow-[4px_0_16px_rgba(0,0,0,0.05)]' // Shadow extending right when attached to screen
              : 'shadow-[-2px_0_8px_rgba(0,0,0,0.1)] shadow-[-4px_0_16px_rgba(0,0,0,0.05)]', // Shadow extending left when attached to sidebar
            // Directional styling for attachment
            collapsed
              ? 'border-r-2 border-r-sidebar-border/60 hover:border-r-sidebar-border' // Right edge highlight when attached to screen
              : 'border-l-2 border-l-sidebar-border/60 hover:border-l-sidebar-border',   // Left edge highlight when attached to sidebar
            // Hover glow effect
            'hover:shadow-xl'
          )}
          title={collapsed ? "Open sidebar (⌘B)" : "Close sidebar (⌘B)"}
        >
          <ChevronRight
            className={cn(
              'h-5 w-5 transition-transform duration-300',
              !collapsed && 'rotate-180'
            )}
          />
        </Button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center justify-between p-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <Menu className="h-5 w-5 mr-2" />
                Conversations
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 bg-sidebar/95 backdrop-blur-xl border-sidebar-border p-0">
              <ConversationSidebar />
            </SheetContent>
          </Sheet>
        </div>

        {selectedConversation || messages.length > 0 || inputMessage.trim() ? (
          <>
            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4 md:p-8">
              <div className="space-y-4 max-w-4xl mx-auto">
                {/* WebSocket Connection Status */}
                {isConnecting && (
                  <div className="flex items-center justify-center space-x-2 text-sidebar-muted bg-sidebar-accent/50 border border-sidebar-border rounded-lg px-3 py-2">
                    <div className="animate-spin">
                      <Brain className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs">Connecting...</span>
                  </div>
                )}

                {isConnected && (
                  <div className="flex items-center justify-center space-x-2 text-sidebar-muted bg-sidebar-accent/30 border border-sidebar-border rounded-lg px-3 py-1.5">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs">Connected</span>
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className="group message-appear">
                    {message.role === 'user' ? (
                      // User message layout - minimal design
                      <div className="flex justify-end group">
                        <div className="flex flex-row-reverse items-start space-x-reverse space-x-4 max-w-[80%]">
                          {/* Avatar */}
                          <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-sidebar-primary text-white">
                            <span className="text-xs font-semibold">You</span>
                          </div>

                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="relative bg-sidebar-primary text-white rounded-2xl rounded-tr-md shadow-md px-5 py-3 transition-opacity duration-200 hover:opacity-90">
                              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
                                {hashtagInfo
                                  ? renderMessageWithHashtags(message.content, hashtagInfo)
                                  : message.content
                                }
                              </div>

                              {/* Display context items if present in metadata */}
                              {message.metadata?.context_items && message.metadata.context_items.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-white/20">
                                  <div className="flex flex-wrap gap-1.5">
                                    {message.metadata.context_items.map((item: any, idx: number) => (
                                      <Badge
                                        key={idx}
                                        variant="secondary"
                                        className="text-xs bg-white/15 text-white/90 border-white/20"
                                      >
                                        {item.type === 'folder' ? <Folder className="h-3 w-3 mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                                        @{item.id}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/15">
                                <button
                                  onClick={() => initiateSaveMessage(message)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center space-x-1 text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded"
                                  title="Save to Memory"
                                >
                                  <Bookmark className="h-3 w-3" />
                                  <span>Save</span>
                                </button>
                                <p className="text-xs opacity-70">
                                  {new Date(message.created_at).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                                                          </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // AI message layout - minimal design
                      <div className="flex justify-start group">
                        <div className="flex items-start space-x-4 max-w-[85%]">
                          {/* Avatar */}
                          <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-sidebar-accent text-sidebar-foreground">
                            <Bot className="h-5 w-5" />
                          </div>

                          <div className="space-y-3 flex-1 min-w-0">
                            <div className="relative bg-sidebar-accent/50 border border-sidebar-border rounded-2xl rounded-tl-md shadow-sm px-5 py-4 transition-colors duration-200 hover:bg-sidebar-accent/60">
                              <div className="text-sm leading-7 text-gray-100">
                                <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
                                  <MarkdownMessage content={message.content} />
                                </Suspense>
                              </div>
                              <div className="flex items-center justify-between mt-3 pt-2 border-t border-sidebar-border">
                                <div className="flex items-center space-x-2">
                                  <p className="text-xs text-sidebar-muted">
                                    {new Date(message.created_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                  <button
                                    onClick={() => initiateSaveMessage(message)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center space-x-1 text-xs text-sidebar-muted hover:text-sidebar-foreground bg-sidebar-accent hover:bg-sidebar-accent/80 px-2 py-1 rounded"
                                    title="Save to Memory"
                                  >
                                    <Bookmark className="h-3 w-3" />
                                    <span>Save</span>
                                  </button>
                                </div>
                              </div>
                                                          </div>

                            {/* Sources for AI messages - Minimal design */}
                            {message.metadata?.sources && message.metadata.sources.length > 0 && (
                              <div className="bg-sidebar-accent/30 border border-sidebar-border rounded-xl px-4 py-3">
                                <div className="flex items-center space-x-2 mb-3">
                                  <Search className="h-4 w-4 text-sidebar-muted" />
                                  <h4 className="text-sm font-semibold text-sidebar-foreground">Knowledge Sources ({message.metadata.sources.length})</h4>
                                </div>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                  {message.metadata.sources.slice(0, 3).map((source, idx) => (
                                    <div
                                      key={idx}
                                      className="group bg-sidebar-accent/50 border border-sidebar-border rounded-lg p-3 hover:bg-sidebar-accent transition-colors duration-200 cursor-pointer"
                                      onClick={() => viewSource(source)}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0 space-y-1">
                                          <div className="flex items-center space-x-2">
                                            <span className="text-sm font-medium text-sidebar-foreground truncate">{source.title}</span>
                                            <ExternalLink className="h-3.5 w-3.5 text-sidebar-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                          </div>
                                          {source.source && (
                                            <div className="flex items-center space-x-1.5 text-xs text-sidebar-muted">
                                              <Folder className="h-3 w-3" />
                                              <span>{source.source}</span>
                                            </div>
                                          )}
                                        </div>
                                        <Badge variant="outline" className="text-xs flex-shrink-0">
                                          {Math.round(source.similarity * 100)}%
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                  {message.metadata.sources.length > 3 && (
                                    <div className="text-xs text-sidebar-muted text-center py-1.5 bg-sidebar-accent/30 rounded border border-sidebar-border">
                                      +{message.metadata.sources.length - 3} more sources
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Streaming message indicator */}
                {isStreaming && streamingConversationId === selectedConversation && (
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
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t border-sidebar-border bg-sidebar/80 backdrop-blur-xl p-4 md:p-6">
              <div className="max-w-4xl mx-auto space-y-3">
                {/* Unified Autocomplete Dropdown - Above input */}
                {showAutocomplete && autocompleteType === 'unified' && (
                  <div className="bg-sidebar-accent/95 backdrop-blur-xl border border-sidebar-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {unifiedSuggestions.length > 0 ? (
                      unifiedSuggestions.map((suggestion, index) => (
                        <div
                          key={`${suggestion.type}-${suggestion.id}`}
                          data-suggestion-index={index}
                          className={`px-4 py-2.5 cursor-pointer flex items-center transition-colors ${
                            index === selectedAutocompleteIndex
                              ? 'bg-sidebar-primary text-white'
                              : 'hover:bg-sidebar-accent text-sidebar-foreground'
                          }`}
                          style={{ paddingLeft: `${12 + suggestion.depth * 20}px` }}
                          onClick={() => selectUnifiedSuggestion(suggestion)}
                        >
                          {suggestion.type === 'folder' ? (
                            <>
                              <div className="flex items-center space-x-3 min-w-0 flex-1">
                                <Folder className={`h-4 w-4 flex-shrink-0 ${suggestion.has_children ? 'text-blue-400' : 'text-blue-300'}`} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium">{suggestion.name}</div>
                                  {suggestion.path && (
                                    <div className="text-xs text-gray-400 truncate">{suggestion.path}</div>
                                  )}
                                </div>
                                {suggestion.has_children && (
                                  <div className="text-xs text-gray-400">
                                    <span className="inline-block w-4 h-4 text-center">▶</span>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center space-x-3 min-w-0 flex-1">
                                <FileText className="h-4 w-4 text-purple-400 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">{suggestion.name}</div>
                                  <div className="text-xs text-gray-400 truncate">
                                    in {suggestion.folder_name}
                                  </div>
                                </div>
                                {suggestion.content_type && (
                                  <Badge variant="outline" className="text-xs flex-shrink-0">
                                    {suggestion.content_type.split('/')[0] || 'file'}
                                  </Badge>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-sidebar-muted">
                        {autocompleteQuery
                          ? `No items found matching "${autocompleteQuery}"`
                          : "No folders or files available"
                        }
                      </div>
                    )}

                    {/* Instructions */}
                    <div className="px-4 py-2 text-xs text-sidebar-muted border-t border-sidebar-border bg-sidebar-accent/50 rounded-b-xl">
                      ↑↓ Navigate • Tab/Enter Select • Esc Close
                    </div>
                  </div>
                )}

                {/* @ References Preview */}
                {selectedContextItems.length > 0 && (
                  <div className="p-3 bg-sidebar-accent/50 border border-sidebar-border rounded-xl">
                    <div className="flex items-center space-x-2 text-sm text-sidebar-foreground mb-2">
                      <Search className="h-3.5 w-3.5 text-sidebar-muted" />
                      <span className="font-medium">Context ({selectedContextItems.length}):</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedContextItems.map((item, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="text-xs flex items-center gap-1.5"
                        >
                          {item.type === 'folder' ? (
                            <Folder className="h-3 w-3" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          @{item.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input Bar */}
                <div className="relative flex items-end space-x-3">
                  {/* Upload Button */}
                  <Button
                    onClick={handleUploadClick}
                    variant="ghost"
                    className="h-12 w-12 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-icon hover:text-sidebar-foreground transition-colors"
                    title="Upload files to Memory"
                  >
                    <Upload className="h-4 w-4" />
                  </Button>

                  <div className="relative flex-1">
                    <Input
                      ref={inputRef}
                      value={inputMessage}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyPress}
                      placeholder={placeholder}
                      className="chat-input w-full h-12 px-4 py-3 text-sm bg-sidebar-accent/50 border border-sidebar-border rounded-lg shadow-sm hover:bg-sidebar-accent/60 focus:bg-sidebar-accent/60 transition-colors focus:border-sidebar-primary focus:outline-none focus:ring-0 placeholder:text-sidebar-muted text-sidebar-foreground"
                      disabled={isLoading}
                    />
                  </div>

                  <Button
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || isLoading}
                    className={`h-12 w-12 rounded-lg transition-colors ${
                      inputMessage.trim() && !isLoading
                        ? 'bg-sidebar-primary hover:bg-sidebar-primary/90 text-white'
                        : 'bg-sidebar-accent text-sidebar-muted hover:bg-sidebar-accent/80'
                    }`}
                  >
                    {isLoading ? (
                      <div className="animate-spin">
                        <Brain className="h-4 w-4" />
                      </div>
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Filter Hint */}
                <div className="flex items-center justify-center space-x-1.5 text-xs text-sidebar-muted">
                  <span>Use</span>
                  <code className="bg-sidebar-accent text-sidebar-foreground px-1.5 py-0.5 rounded font-mono">@</code>
                  <span>to reference files and folders</span>
                </div>

                {/* AI Disclaimer */}
                <div className="flex items-center justify-center space-x-2 text-xs text-sidebar-muted bg-sidebar-accent/30 border border-sidebar-border rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>AI responses may contain inaccuracies. Verify important information.</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-6 px-6">
              <div className="p-8 rounded-2xl bg-sidebar-accent/30 w-fit mx-auto">
                <Bot className="h-16 w-16 text-sidebar-icon" />
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-sidebar-foreground">
                  Start a conversation
                </h3>
                <p className="text-sidebar-muted max-w-md mx-auto">
                  Chat with your AI assistant about your knowledge base. Use <code className="bg-sidebar-accent text-sidebar-foreground px-1.5 py-0.5 rounded font-mono text-xs">@</code> to reference files and folders.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <div className="flex items-center space-x-1.5 bg-sidebar-accent/50 border border-sidebar-border px-3 py-1.5 rounded-lg">
                  <Sparkles className="h-3.5 w-3.5 text-sidebar-icon" />
                  <span className="text-xs text-sidebar-muted">AI-powered</span>
                </div>
                <div className="flex items-center space-x-1.5 bg-sidebar-accent/50 border border-sidebar-border px-3 py-1.5 rounded-lg">
                  <Search className="h-3.5 w-3.5 text-sidebar-icon" />
                  <span className="text-xs text-sidebar-muted">Semantic search</span>
                </div>
                <div className="flex items-center space-x-1.5 bg-sidebar-accent/50 border border-sidebar-border px-3 py-1.5 rounded-lg">
                  <Folder className="h-3.5 w-3.5 text-sidebar-icon" />
                  <span className="text-xs text-sidebar-muted">Folder filtering</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Source Content Dialog */}
      <Dialog open={showSourceDialog} onOpenChange={setShowSourceDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Search className="h-4 w-4" />
              <span>Source Content</span>
            </DialogTitle>
          </DialogHeader>

          {selectedSource && (
            <div className="space-y-4">
              {/* Source Info */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <h3 className="font-medium">{selectedSource.title}</h3>
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <Folder className="h-3 w-3" />
                      <span>{selectedSource.source}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {Math.round(selectedSource.similarity * 100)}% match
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <ScrollArea className="h-96 w-full border rounded-md">
                <div className="p-4">
                  <div className="whitespace-pre-wrap text-sm">
                    {selectedSource.content}
                  </div>
                </div>
              </ScrollArea>

              {/* Actions */}
              <div className="flex justify-between items-center pt-4 border-t">
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  <span>This is the source content that was referenced in the AI response</span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowSourceDialog(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Conversation Confirmation Dialog */}
      <AlertDialog open={conversationToDelete !== null} onOpenChange={(open) => !open && setConversationToDelete(null)}>
        <AlertDialogContent className="bg-slate-900 border border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span>Delete Conversation</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Are you sure you want to delete this conversation? This action cannot be undone and all messages will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/10 text-white hover:bg-white/20 border-white/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteConversation}
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save to Memory Dialog */}
      <FolderSelectorDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        folders={userFolders}
        onSelect={handleSaveToKnowledgeBase}
        defaultTitle={messageToSave ? `Chat Response: ${messageToSave.content.split('\n')[0].slice(0, 100)}` : ''}
        showTitleInput={true}
      />

      {/* Folder Selector for Upload */}
      <FolderSelectorDialog
        open={showFolderSelectForUpload}
        onOpenChange={setShowFolderSelectForUpload}
        folders={userFolders}
        onSelect={handleFolderSelectedForUpload}
        defaultTitle={getConversationDefaultTitle()}
        showTitleInput={true}
      />
    </div>
  );
}
