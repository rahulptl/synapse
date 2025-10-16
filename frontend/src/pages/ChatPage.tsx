import { useState, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Send, MessageSquare, Plus, Folder, Bot, Search, Brain, Sparkles, ExternalLink, AlertTriangle, Trash2, Menu, FileText, Bookmark, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/apiClient';
import { FolderSelectorDialog } from '@/components/chat/FolderSelectorDialog';
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
  const { toast } = useToast();

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
    if (conversationId && inputMessage.trim()) {
      setConversationDrafts(prev => ({
        ...prev,
        [conversationId]: inputMessage.trim()
      }));
    }
  };

  // Restore draft for a specific conversation
  const restoreDraft = (conversationId: string | null) => {
    if (conversationId && conversationDrafts[conversationId]) {
      setInputMessage(conversationDrafts[conversationId]);
    } else {
      setInputMessage('');
    }
  };

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation);
      restoreDraft(selectedConversation);
    } else {
      setMessages([]);
      setInputMessage('');
    }
  }, [selectedConversation, conversationDrafts]);

  // Create a wrapper for setSelectedConversation that saves draft first
  const handleConversationSelect = (conversationId: string | null) => {
    if (selectedConversation !== conversationId) {
      saveCurrentDraft(selectedConversation);
      setSelectedConversation(conversationId);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversations = async () => {
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
  };

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
      setMessages(messages.map((msg: any) => ({
        ...msg,
        metadata: msg.metadata as Message['metadata']
      })));
    } catch (error) {
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

  const initiateDeleteConversation = (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the conversation when clicking delete
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

  const sendMessage = async () => {
    if (!inputMessage.trim() || !user || !accessToken) return;

    const userMessage = inputMessage.trim();
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
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      // Prepare context items for backend
      const contextItems = contextItemsCopy.map(item => ({
        id: item.id,
        type: item.type
      }));

      // Use the backend RAG chat endpoint
      const response = await apiClient.chatWithRag(
        {
          message: userMessage,
          conversation_id: selectedConversation,
          user_id: user.id,
          context_items: contextItems  // Pass folder and file IDs with types
        },
        {
          userId: user.id,
          accessToken: accessToken
        }
      );

      const { conversation_id: convId, sources: aiSources, hashtag_info } = response.data || response;

      // If this was a new conversation, update the selected conversation
      if (!selectedConversation && convId) {
        handleConversationSelect(convId);
        await loadConversations(); // Refresh conversations list
      }

      // Sources will be displayed from message metadata

      // Update hashtag info if available
      if (hashtag_info) {
        setHashtagInfo(hashtag_info);

        // Show simple hashtag recognition feedback
        if (hashtag_info.unrecognized_hashtags.length > 0) {
          toast({
            title: "Unknown folders",
            description: hashtag_info.unrecognized_hashtags.map((tag: string) => `#${tag}`).join(', '),
            variant: "destructive",
          });
        }
      }

      // Refresh messages to show the new conversation
      if (convId) {
        await loadMessages(convId);
      }

      // Refresh conversations to show any new conversation or updated title
      if (convId) {
        await loadConversations();
      }

    } catch (error) {
      console.error('Send message error:', error);
      // Remove the temporary message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMessage.id));
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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

  // Conversation sidebar content component
  const ConversationSidebar = () => (
    <>
      <div className="p-6 border-b border-white/10">
        <Button
          onClick={createNewConversation}
          className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 text-white shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.03] border-0 h-12 font-semibold rounded-xl"
        >
          <Plus className="h-5 w-5 mr-3" />
          New Conversation
        </Button>
      </div>

      <ScrollArea className="h-[calc(100%-5rem)]">
        <div className="p-5 space-y-3">
          {conversations.map((conversation) => (
            <Card
              key={conversation.id}
              className={`group cursor-pointer transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 border-0 backdrop-blur-lg ${
                selectedConversation === conversation.id
                  ? 'bg-gradient-to-r from-blue-500/25 to-purple-500/25 shadow-xl ring-2 ring-blue-400/40 scale-[1.02]'
                  : 'bg-white/8 hover:bg-white/12 shadow-lg hover:shadow-xl'
              }`}
              onClick={() => handleConversationSelect(conversation.id)}
            >
              <CardContent className="p-5">
                <div className="flex items-start space-x-3">
                  <div className={`flex-shrink-0 p-2.5 rounded-lg transition-all duration-300 ${
                    selectedConversation === conversation.id
                      ? 'bg-gradient-to-br from-blue-400/30 to-purple-400/30 text-white shadow-lg'
                      : 'bg-white/10 text-gray-300 group-hover:bg-white/20 group-hover:text-white'
                  }`}>
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <h3 className={`text-sm font-semibold leading-tight transition-colors duration-300 ${
                      selectedConversation === conversation.id
                        ? 'text-white'
                        : 'text-gray-200 group-hover:text-white'
                    }`}
                    title={conversation.title}
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                      hyphens: 'auto'
                    }}>
                      {conversation.title}
                    </h3>
                    <p className="text-xs text-gray-400 mt-2 font-medium">
                      {new Date(conversation.updated_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => initiateDeleteConversation(conversation.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-950 via-gray-900 to-slate-800">
      {/* Desktop Left Sidebar - Conversations */}
      <div className="hidden md:block w-96 bg-white/5 backdrop-blur-2xl border-r border-white/10 shadow-2xl">
        <ConversationSidebar />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-900/80 to-gray-800/80 backdrop-blur-sm">
        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-white/10 bg-slate-900/80">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white hover:bg-white/10"
              >
                <Menu className="h-5 w-5 mr-2" />
                Conversations
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 bg-slate-900/95 backdrop-blur-2xl border-white/10 p-0">
              <ConversationSidebar />
            </SheetContent>
          </Sheet>
        </div>

        {selectedConversation || messages.length > 0 || inputMessage.trim() ? (
          <>
            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4 md:p-8">
              <div className="space-y-8 max-w-4xl mx-auto">
                {messages.map((message) => (
                  <div key={message.id} className="group message-appear">
                    {message.role === 'user' ? (
                      // User message layout - modern bubble design
                      <div className="flex justify-end group">
                        <div className="flex flex-row-reverse items-start space-x-reverse space-x-5 max-w-[80%]">
                          {/* Avatar */}
                          <div className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 shadow-xl ring-2 ring-blue-400/30 backdrop-blur-sm">
                            <span className="text-sm font-bold text-white">You</span>
                          </div>

                          <div className="space-y-3 flex-1 min-w-0">
                            <div className="relative bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 text-white rounded-3xl rounded-tr-lg shadow-2xl px-6 py-4 transition-all duration-300 hover:shadow-3xl backdrop-blur-sm group-hover:scale-[1.02]">
                              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
                                {hashtagInfo
                                  ? renderMessageWithHashtags(message.content, hashtagInfo)
                                  : message.content
                                }
                              </div>
                              <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/20">
                                <button
                                  onClick={() => initiateSaveMessage(message)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 px-2.5 py-1.5 rounded-lg"
                                  title="Save to Memory"
                                >
                                  <Bookmark className="h-3.5 w-3.5" />
                                  <span className="font-medium">Save</span>
                                </button>
                                <p className="text-xs opacity-90 font-medium">
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
                      // AI message layout - modern bubble design
                      <div className="flex justify-start group">
                        <div className="flex items-start space-x-5 max-w-[85%]">
                          {/* Avatar */}
                          <div className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-xl ring-2 ring-emerald-400/30 backdrop-blur-sm">
                            <Bot className="h-6 w-6 text-white" />
                          </div>

                          <div className="space-y-4 flex-1 min-w-0">
                            <div className="relative bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl rounded-tl-lg shadow-2xl px-6 py-5 transition-all duration-300 hover:shadow-3xl group-hover:bg-white/15">
                              <div className="text-sm leading-7 whitespace-pre-wrap text-gray-100 break-words">
                                {message.content}
                              </div>
                              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                                <div className="flex items-center space-x-3">
                                  <p className="text-xs text-gray-400 font-medium">
                                    {new Date(message.created_at).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </p>
                                  <button
                                    onClick={() => initiateSaveMessage(message)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 px-2.5 py-1.5 rounded-lg"
                                    title="Save to Memory"
                                  >
                                    <Bookmark className="h-3.5 w-3.5" />
                                    <span className="font-medium">Save</span>
                                  </button>
                                </div>
                              </div>
                                                          </div>

                            {/* Sources for AI messages - Modern design */}
                            {message.metadata?.sources && message.metadata.sources.length > 0 && (
                              <div className="bg-gradient-to-br from-blue-500/15 to-purple-500/15 backdrop-blur-xl border border-blue-400/30 rounded-2xl px-5 py-4 shadow-xl">
                                <div className="flex items-center space-x-3 mb-4">
                                  <div className="p-2 bg-gradient-to-br from-blue-500/30 to-purple-500/30 rounded-xl backdrop-blur-sm">
                                    <Search className="h-5 w-5 text-blue-300" />
                                  </div>
                                  <h4 className="text-sm font-bold text-blue-200">Knowledge Sources ({message.metadata.sources.length})</h4>
                                </div>
                                <div className="space-y-3 max-h-64 overflow-y-auto">
                                  {message.metadata.sources.slice(0, 3).map((source, idx) => (
                                    <div
                                      key={idx}
                                      className="group bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 hover:bg-white/15 hover:shadow-lg transition-all duration-300 cursor-pointer transform hover:scale-[1.02]"
                                      onClick={() => viewSource(source)}
                                    >
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0 space-y-2">
                                          <div className="flex items-center space-x-2">
                                            <span className="text-sm font-semibold text-white truncate">{source.title}</span>
                                            <ExternalLink className="h-4 w-4 text-blue-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110" />
                                          </div>
                                          {source.source && (
                                            <div className="flex items-center space-x-2 text-xs text-gray-300">
                                              <Folder className="h-3.5 w-3.5" />
                                              <span className="font-medium">{source.source}</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center space-x-2 ml-3">
                                          <Badge className="bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-300 hover:from-emerald-500/30 hover:to-green-500/30 text-xs px-3 py-1 border border-emerald-500/30 rounded-full font-semibold">
                                            {Math.round(source.similarity * 100)}%
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  {message.metadata.sources.length > 3 && (
                                    <div className="text-xs text-blue-300 font-semibold text-center py-2 bg-blue-900/20 rounded-lg border border-blue-700/30">
                                      +{message.metadata.sources.length - 3} more sources available
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
                {isLoading && (
                  <div className="flex justify-start group">
                    <div className="flex items-start space-x-3">
                      {/* AI Avatar for loading */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg ring-2 ring-emerald-500/30">
                        <Bot className="h-5 w-5 text-white" />
                      </div>

                      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl rounded-tl-lg shadow-lg px-5 py-3">
                        <div className="flex items-center space-x-3">
                          <TypingIndicator />
                          <span className="text-sm text-gray-300 animate-pulse">{searchMessage}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t border-white/10 bg-slate-900/80 backdrop-blur-xl p-4 md:p-6">
              <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
                {/* Unified Autocomplete Dropdown - Above input */}
                {showAutocomplete && autocompleteType === 'unified' && (
                  <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl max-h-64 overflow-y-auto animate-fade-in">
                    {unifiedSuggestions.length > 0 ? (
                      unifiedSuggestions.map((suggestion, index) => (
                        <div
                          key={`${suggestion.type}-${suggestion.id}`}
                          data-suggestion-index={index}
                          className={`px-4 py-3 cursor-pointer flex items-center transition-all duration-200 ${
                            index === selectedAutocompleteIndex
                              ? 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 text-blue-200 scale-[1.02]'
                              : 'hover:bg-white/10 text-gray-300 hover:text-white'
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
                      <div className="px-4 py-3 text-sm text-gray-400">
                        {autocompleteQuery
                          ? `No items found matching "${autocompleteQuery}"`
                          : "No folders or files available"
                        }
                      </div>
                    )}

                    {/* Instructions */}
                    <div className="px-4 py-2 text-xs text-gray-400 border-t border-white/10 bg-black/20 rounded-b-2xl">
                      ↑↓ Navigate • Tab/Enter Select • Esc Close • Folders and files are shown hierarchically
                    </div>
                  </div>
                )}

                {/* @ References Preview with Type Indicators */}
                {selectedContextItems.length > 0 && (
                  <div className="p-5 bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-400/40 rounded-2xl animate-fade-in backdrop-blur-xl">
                    <div className="flex items-center space-x-3 text-sm text-gray-200 mb-3">
                      <div className="p-1.5 bg-purple-500/30 rounded-lg">
                        <Search className="h-4 w-4 text-purple-300" />
                      </div>
                      <span className="font-semibold">Context ({selectedContextItems.length} {selectedContextItems.length === 1 ? 'item' : 'items'}):</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {selectedContextItems.map((item, index) => (
                        <Badge
                          key={index}
                          className={`${
                            item.type === 'folder'
                              ? 'bg-gradient-to-r from-blue-500/30 to-cyan-500/30 text-blue-200 hover:from-blue-500/40 hover:to-cyan-500/40 border-blue-400/30'
                              : 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-purple-200 hover:from-purple-500/40 hover:to-pink-500/40 border-purple-400/30'
                          } text-sm px-3 py-1 border rounded-full font-semibold flex items-center gap-2`}
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
                <div className="relative flex items-end space-x-4">
                  {/* Upload Button */}
                  <Button
                    onClick={handleUploadClick}
                    className="h-14 w-14 rounded-2xl border-0 bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white shadow-xl transition-all duration-300 hover:scale-110"
                    title="Upload files to Memory"
                  >
                    <Upload className="h-5 w-5" />
                  </Button>

                  <div className="relative flex-1">
                    <div className="relative">
                      <Input
                        ref={inputRef}
                        value={inputMessage}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyPress}
                        placeholder={placeholder}
                        className="chat-input w-full h-14 px-6 py-4 text-sm bg-white/10 backdrop-blur-xl border-2 border-white/20 rounded-2xl shadow-xl hover:shadow-2xl focus:shadow-2xl transition-all duration-500 focus:border-blue-400/60 focus:outline-none focus:ring-0 placeholder:text-gray-400 text-white font-medium hover:bg-white/15 focus:bg-white/15"
                        disabled={isLoading}
                      />
                      {/* Floating label effect */}
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 opacity-0 hover:opacity-100 transition-opacity duration-500 -z-10 blur-sm"></div>
                    </div>
                  </div>

                  <Button
                    onClick={sendMessage}
                    disabled={!inputMessage.trim() || isLoading}
                    className={`h-14 w-14 rounded-2xl border-0 shadow-xl transition-all duration-500 transform ${
                      inputMessage.trim() && !isLoading
                        ? 'bg-gradient-to-br from-blue-500 via-purple-600 to-blue-500 hover:from-blue-400 hover:via-purple-500 hover:to-blue-400 hover:shadow-2xl hover:scale-110 text-white animate-pulse'
                        : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-gray-300'
                    }`}
                  >
                    {isLoading ? (
                      <div className="animate-spin">
                        <Brain className="h-5 w-5" />
                      </div>
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </Button>
                </div>

                {/* Filter Hint */}
                <div className="flex items-center justify-center space-x-2 text-xs text-blue-200/70">
                  <span>💡 Use</span>
                  <code className="bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded font-mono">@</code>
                  <span>to reference specific files and folders</span>
                </div>

                {/* AI Disclaimer */}
                <div className="flex items-center justify-center space-x-3 text-xs text-amber-200 bg-gradient-to-r from-amber-900/20 to-yellow-900/20 border border-amber-600/30 rounded-xl px-4 py-3 backdrop-blur-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <span className="font-medium">AI can hallucinate. Please verify important findings and check original sources.</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-8 animate-fade-in px-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/30 via-emerald-400/30 to-indigo-400/30 rounded-full blur-2xl animate-pulse"></div>
                <div className="relative bg-gradient-to-br from-blue-600 via-emerald-500 to-indigo-600 p-8 rounded-4xl mx-auto w-fit shadow-2xl">
                  <Bot className="h-16 w-16 text-white drop-shadow-lg" />
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-emerald-400 to-indigo-400 bg-clip-text text-transparent">
                  Ready to explore your knowledge?
                </h3>
                <p className="text-gray-300 max-w-lg mx-auto text-lg leading-relaxed">
                  Start a conversation with your AI assistant. Use <code className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded-md font-mono text-sm">@symbol</code> to reference both folders and files, with hierarchical suggestions showing your knowledge base structure.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <div className="flex items-center space-x-2 bg-gray-800/80 backdrop-blur-sm border border-blue-700/40 px-4 py-2 rounded-xl shadow-sm">
                  <div className="p-1 bg-blue-900/50 rounded-md">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-blue-300">AI-powered</span>
                </div>
                <div className="flex items-center space-x-2 bg-gray-800/80 backdrop-blur-sm border border-emerald-700/40 px-4 py-2 rounded-xl shadow-sm">
                  <div className="p-1 bg-emerald-900/50 rounded-md">
                    <Search className="h-4 w-4 text-emerald-400" />
                  </div>
                  <span className="text-sm font-medium text-emerald-300">Semantic search</span>
                </div>
                <div className="flex items-center space-x-2 bg-gray-800/80 backdrop-blur-sm border border-indigo-700/40 px-4 py-2 rounded-xl shadow-sm">
                  <div className="p-1 bg-indigo-900/50 rounded-md">
                    <Folder className="h-4 w-4 text-indigo-400" />
                  </div>
                  <span className="text-sm font-medium text-indigo-300">Folder filtering</span>
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

      {/* Save to Knowledge Base Dialog */}
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
