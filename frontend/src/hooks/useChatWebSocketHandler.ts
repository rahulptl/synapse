import { useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { ChatEvent } from '@/services/chatWebSocket';
import type { Message } from '@/components/chat/types/chat';
import { StatusType } from '@/components/chat/StatusTile';

interface UseChatWebSocketHandlerProps {
  isConnected: boolean;
  selectedConversationRef: React.MutableRefObject<string | null>;
  streamingConversationIdRef: React.MutableRefObject<string | null>;
  isCreatingNewConversation: React.MutableRefObject<boolean>;
  addEventListener: (handler: (event: ChatEvent) => void) => () => void;
  loadConversations: () => void;
  onSetSelectedConversation: (id: string) => void;
  onSetMessages: (updater: (prev: Message[]) => Message[]) => void;
  onSetStreamingMessage: (message: string) => void;
  onSetIsStreaming: (streaming: boolean) => void;
  onSetStreamingConversationId: (id: string | null) => void;
  onSetIsLoading: (loading: boolean) => void;
  onSetCurrentStatus: (status: {type: StatusType; message?: string; details?: string;} | null) => void;
}

export function useChatWebSocketHandler({
  isConnected,
  selectedConversationRef,
  streamingConversationIdRef,
  isCreatingNewConversation,
  addEventListener,
  loadConversations,
  onSetSelectedConversation,
  onSetMessages,
  onSetStreamingMessage,
  onSetIsStreaming,
  onSetStreamingConversationId,
  onSetIsLoading,
  onSetCurrentStatus
}: UseChatWebSocketHandlerProps) {
  const { toast } = useToast();

  const handleEvent = useCallback((event: ChatEvent) => {
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
          onSetStreamingConversationId(event.data.conversation_id || selectedConversationRef.current);
          // Initialize streaming immediately to show loading state
          onSetIsStreaming(true);
          onSetStreamingMessage(''); // Empty message initially
          onSetCurrentStatus({
            type: 'starting',
            message: 'Thinking...'
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
        onSetSelectedConversation(event.data.conversation_id);

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
          onSetMessages(prev => {
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
          onSetStreamingMessage(prev => {
            const newContent = prev + event.data.delta;
            console.log('[STREAM] Total content length:', newContent.length);
            return newContent;
          });
          onSetIsStreaming(true);
          onSetCurrentStatus({
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
        onSetCurrentStatus({
          type: 'web_search',
          message: 'Searching the web...',
          details: undefined
        });
        break;

      case 'tool.web_search.complete':
        onSetCurrentStatus({
          type: 'generating',
          message: 'Processing search results...',
          details: undefined
        });
        break;

      case 'tool.file_search.start':
        const queries = event.data.queries?.join(', ') || 'your files';
        onSetCurrentStatus({
          type: 'file_search',
          message: 'Searching files for',
          details: `"${queries}"`
        });
        break;

      case 'tool.file_search.complete':
        onSetCurrentStatus({
          type: 'generating',
          message: 'Processing file results...',
          details: undefined
        });
        break;

      case 'tool.code_interpreter.start':
        onSetCurrentStatus({
          type: 'code_interpreter',
          message: 'Running code interpreter...',
          details: undefined
        });
        break;

      case 'tool.code_interpreter.code_delta':
        onSetCurrentStatus({
          type: 'code_interpreter',
          message: 'Writing code:',
          details: event.data.delta ? `${event.data.delta.substring(0, 60)}...` : undefined
        });
        break;

      case 'tool.code_interpreter.complete':
        onSetCurrentStatus({
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
            onSetCurrentStatus({
              type: 'complete',
              message: 'Response complete'
            });

            // Hide after 1 second
            setTimeout(() => {
              onSetCurrentStatus(null);
            }, 1000);

            // Clear streaming state
            onSetStreamingMessage('');
            onSetIsStreaming(false);
            onSetStreamingConversationId(null);
            onSetIsLoading(false);
          }

          // Add complete message to messages array with sources and generated files
          const newMessage: Message = {
            id: event.data.message_id,
            role: 'assistant',
            content: event.data.content,
            created_at: new Date().toISOString(),
            metadata: {
              sources: event.data.sources,
              generated_files: event.data.generated_files
            }
          };

          console.log('[STREAM] Final message content:', event.data.content.substring(0, 100));
          onSetMessages(prev => [...prev, newMessage]);

          // Show toast notifications for generated files
          if (event.data.generated_files && event.data.generated_files.length > 0) {
            event.data.generated_files.forEach((file: any) => {
              toast({
                title: "File Saved to AI Artifacts",
                description: file.filename,
                duration: 4000,
              });
            });
          }

          // Update conversation ID if this was a new conversation
          if (!selectedConversationRef.current && event.data.conversation_id) {
            console.log('[STREAM] Setting conversation ID from completed event:', event.data.conversation_id);
            onSetSelectedConversation(event.data.conversation_id);
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
        onSetIsStreaming(false);
        onSetIsLoading(false);
        onSetStreamingMessage('');
        onSetStreamingConversationId(null);
        onSetCurrentStatus(null);
        break;
    }
  }, [
    selectedConversationRef,
    streamingConversationIdRef,
    isCreatingNewConversation,
    loadConversations,
    toast,
    onSetSelectedConversation,
    onSetMessages,
    onSetStreamingMessage,
    onSetIsStreaming,
    onSetStreamingConversationId,
    onSetIsLoading,
    onSetCurrentStatus
  ]);

  return {
    handleEvent
  };
}