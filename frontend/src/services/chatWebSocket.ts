import { resolveBackendBaseUrl, resolveBackendWebSocketUrl } from '@/utils/backendUrl';

/**
 * ChatWebSocket Service with Native WebSocket and Custom Reconnection
 *
 * This implementation uses native WebSocket instead of reconnecting-websocket library
 * to avoid module bundling issues with Vite.
 * Supports background generation tracking when user navigates away from chat page.
 */

export type ChatEvent =
  | { type: 'auth_success'; user_id: string }
  | { type: 'auth_error'; message: string }
  | { type: 'response.created'; data: { conversation_id: string | null }; sequence_number: number }
  | { type: 'conversation.created'; data: { conversation_id: string; title: string }; sequence_number: number }
  | { type: 'message.created'; data: { message_id: string; role: string; content: string }; sequence_number: number }
  | { type: 'text.delta'; data: { delta: string; conversation_id: string }; sequence_number: number }
  | { type: 'tool.web_search.start'; data: { status: string; query?: string }; sequence_number: number }
  | { type: 'tool.web_search.complete'; data: { status: string; query?: string }; sequence_number: number }
  | { type: 'tool.file_search.start'; data: { status: string; queries: string[] }; sequence_number: number }
  | { type: 'tool.file_search.complete'; data: { status: string }; sequence_number: number }
  | { type: 'tool.code_interpreter.start'; data: { status: string }; sequence_number: number }
  | { type: 'tool.code_interpreter.code_delta'; data: { delta: string }; sequence_number: number }
  | { type: 'tool.code_interpreter.complete'; data: { status: string }; sequence_number: number }
  | { type: 'response.completed'; data: { conversation_id: string; message_id: string; content: string; sources?: any[] }; sequence_number: number }
  | { type: 'error'; data?: { message: string }; message?: string; sequence_number?: number }
  | { type: 'pong' };

export type UpdateConversationEvent = {
  type: 'update_conversation';
  data: {
    conversation_id: string;
    title?: string;
    updated_at?: string;
  };
}

type EventHandler = (event: ChatEvent) => void;

/**
 * WebSocket connection states for better state management
 */
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  AUTHENTICATING = 'AUTHENTICATING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

/**
 * Custom reconnecting WebSocket implementation
 * Uses native WebSocket with automatic reconnection logic
 */
export class ChatWebSocketService {
  private ws: WebSocket | null = null;
  private eventHandlers: Set<EventHandler> = new Set();
  private isAuthenticated = false;
  private authPromise: Promise<void> | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private currentAccessToken: string | null = null;
  private wsUrl: string = '';

  // Background generation tracking
  private backgroundModeActive = false;
  private currentConversationId: string | null = null;

  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Resolve backend base URL lazily to support LAN access
    this.baseUrl = resolveBackendBaseUrl(baseUrl);
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Calculate reconnection delay with exponential backoff
   */
  private getReconnectDelay(): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(1.5, this.reconnectAttempts), maxDelay);
    return delay + Math.random() * 1000; // Add jitter
  }

  /**
   * Attempt to reconnect the WebSocket
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Reconnection stopped:', { shouldReconnect: this.shouldReconnect, attempts: this.reconnectAttempts });
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = this.getReconnectDelay();
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts + 1} in ${delay}ms...`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.currentAccessToken && this.shouldReconnect) {
        console.log(`Reconnecting... (attempt ${this.reconnectAttempts + 1})`);
        this.connectWebSocket(this.currentAccessToken);
      }
    }, delay);
  }

  /**
   * Set background mode for generation tracking
   * When active, track generation progress in global store
   */
  setBackgroundMode(active: boolean, conversationId: string | null = null): void {
    this.backgroundModeActive = active;
    this.currentConversationId = conversationId;
    console.log(`Background mode ${active ? 'activated' : 'deactivated'}${conversationId ? ` for conversation ${conversationId}` : ''}`);
  }

  /**
   * Handle background generation events
   * Updates global store when user is not on chat page
   */
  private handleBackgroundGeneration(event: ChatEvent): void {
    if (!this.backgroundModeActive || !this.currentConversationId) {
      return;
    }

    // Dynamically import store to avoid circular dependencies
    import('@/stores/chatStore').then(({ useChatStore }) => {
      const store = useChatStore.getState();

      switch (event.type) {
        case 'text.delta':
          store.updateStreamingContent(this.currentConversationId!, event.data.delta);
          break;

        case 'response.completed':
          const finalMessage = {
            id: event.data.message_id,
            role: 'assistant' as const,
            content: event.data.content,
            created_at: new Date().toISOString(),
          };
          store.completeGeneration(this.currentConversationId!, finalMessage);

          // Show notification if page is not visible
          if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Chat Response Ready', {
              body: 'Your AI assistant has finished responding',
              icon: '/favicon.ico',
              tag: this.currentConversationId!,
            });
          }
          break;
      }
    }).catch(error => {
      console.error('Failed to load chat store for background generation:', error);
    });
  }

  /**
   * Internal method to create and setup WebSocket connection
   */
  private connectWebSocket(accessToken: string): void {
    // Clean up existing connection
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch (e) {
        console.warn('Error closing existing WebSocket:', e);
      }
      this.ws = null;
    }

    this.connectionState = ConnectionState.CONNECTING;
    this.isAuthenticated = false;

    try {
      // Create native WebSocket
      this.ws = new WebSocket(this.wsUrl);

      // Handle connection open
      this.ws.onopen = () => {
        console.log('WebSocket opened, authenticating...');
        this.connectionState = ConnectionState.AUTHENTICATING;
        this.reconnectAttempts = 0; // Reset on successful connection

        // Send authentication message
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          console.log('Sending authentication message...');
          this.ws.send(JSON.stringify({
            type: 'auth',
            token: `Bearer ${accessToken}`
          }));
        }
      };

      // Handle incoming messages
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ChatEvent;

          // Handle authentication response
          if (data.type === 'auth_success') {
            console.log('WebSocket authenticated successfully');
            this.isAuthenticated = true;
            this.connectionState = ConnectionState.CONNECTED;
          } else if (data.type === 'auth_error') {
            console.error('WebSocket authentication failed:', data.message);
            this.connectionState = ConnectionState.ERROR;
            this.shouldReconnect = false; // Don't reconnect on auth failure
          }

          // Handle background generation
          this.handleBackgroundGeneration(data);

          // Notify all handlers
          this.notifyHandlers(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      // Handle errors
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.connectionState = ConnectionState.ERROR;
      };

      // Handle connection close
      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        this.isAuthenticated = false;
        this.connectionState = ConnectionState.DISCONNECTED;

        // Attempt to reconnect if appropriate
        if (this.shouldReconnect && event.code !== 1000) { // 1000 = normal closure
          this.reconnectAttempts++;
          this.scheduleReconnect();
        }
      };

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.connectionState = ConnectionState.ERROR;
      this.reconnectAttempts++;
      this.scheduleReconnect();
    }
  }

  /**
   * Connect to WebSocket with authentication
   * Uses native WebSocket with custom reconnection logic
   */
  connect(accessToken: string): Promise<void> {
    // If already connected and authenticated, return immediately
    if (this.ws && this.isAuthenticated && this.connectionState === ConnectionState.CONNECTED) {
      console.log('WebSocket already connected');
      return Promise.resolve();
    }

    // If connection in progress, return existing promise
    if (this.authPromise && (this.connectionState === ConnectionState.CONNECTING || this.connectionState === ConnectionState.AUTHENTICATING)) {
      console.log('WebSocket connection already in progress');
      return this.authPromise;
    }

    console.log('Initializing WebSocket connection...');

    // Store access token for reconnection
    this.currentAccessToken = accessToken;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;

    // Determine WebSocket URL
    const wsUrlBase = resolveBackendWebSocketUrl(this.baseUrl);
    this.wsUrl = `${wsUrlBase}/api/v1/chat/ws`;

    // Create authentication promise
    this.authPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeEventHandler(authHandler);
        this.connectionState = ConnectionState.ERROR;
        reject(new Error('Authentication timeout'));
      }, 10000); // 10 second timeout

      const authHandler = (event: ChatEvent) => {
        if (event.type === 'auth_success') {
          clearTimeout(timeout);
          this.removeEventHandler(authHandler);
          resolve();
        } else if (event.type === 'auth_error') {
          clearTimeout(timeout);
          this.removeEventHandler(authHandler);
          reject(new Error(event.message));
        }
      };

      this.addEventHandler(authHandler);
    });

    // Initiate connection
    this.connectWebSocket(accessToken);

    return this.authPromise;
  }

  async sendMessage(
    message: string,
    conversationId: string | null,
    contextItems: Array<{ id: string; type: string }> = []
  ): Promise<void> {
    if (!this.ws || !this.isAuthenticated) {
      throw new Error('WebSocket not connected or not authenticated');
    }

    await this.authPromise;

    this.ws.send(JSON.stringify({
      type: 'chat',
      message,
      conversation_id: conversationId,
      context_items: contextItems
    }));
  }

  addEventHandler(handler: EventHandler): void {
    this.eventHandlers.add(handler);
  }

  removeEventHandler(handler: EventHandler): void {
    this.eventHandlers.delete(handler);
  }

  private notifyHandlers(event: ChatEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    });
  }

  disconnect(): void {
    console.log('Disconnecting WebSocket...');
    this.shouldReconnect = false; // Prevent reconnection

    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close WebSocket connection
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close(1000, 'Client disconnect'); // 1000 = normal closure
      } catch (e) {
        console.warn('Error closing WebSocket:', e);
      }
      this.ws = null;
    }

    // Reset state
    this.isAuthenticated = false;
    this.connectionState = ConnectionState.DISCONNECTED;
    this.currentAccessToken = null;
    this.authPromise = null;
    this.eventHandlers.clear();
  }

  // Ping to keep connection alive
  ping(): void {
    if (this.ws && this.isAuthenticated) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }
}

/**
 * Singleton instance - uses lazy initialization pattern
 * This avoids module initialization timing issues with Vite/React
 */
let chatWSInstance: ChatWebSocketService | null = null;

/**
 * Get or create the singleton WebSocket service instance
 * Uses lazy initialization to prevent module timing issues
 *
 * @param baseUrl - Optional base URL override (primarily for testing)
 * @returns ChatWebSocketService singleton instance
 */
export function getChatWebSocket(baseUrl?: string): ChatWebSocketService {
  if (!chatWSInstance) {
    const url = resolveBackendBaseUrl(baseUrl);
    console.log('Creating new ChatWebSocketService instance with base URL:', url);
    chatWSInstance = new ChatWebSocketService(url);
  }
  return chatWSInstance;
}

/**
 * Reset the singleton instance (primarily for testing)
 */
export function resetChatWebSocket(): void {
  if (chatWSInstance) {
    chatWSInstance.disconnect();
    chatWSInstance = null;
  }
}
