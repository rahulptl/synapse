import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getChatWebSocket, ChatEvent, ConnectionState, type ChatWebSocketService } from '@/services/chatWebSocket';

/**
 * React hook for managing WebSocket connection with streaming chat
 * Uses lazy initialization to avoid module timing issues
 */
export function useChatWebSocket() {
  const { accessToken, user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Use lazy initialization - do not call getChatWebSocket() during render
  const wsRef = useRef<ChatWebSocketService | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize WebSocket service lazily in useEffect, not during render
  useEffect(() => {
    if (!wsRef.current) {
      console.log('Lazy initializing WebSocket service...');
      wsRef.current = getChatWebSocket();
    }
  }, []); // Run once on mount

  // Connection management effect
  useEffect(() => {
    // Guard against null ref (should not happen, but defensive programming)
    if (!wsRef.current) {
      console.warn('WebSocket service not initialized');
      return;
    }

    // Only attempt connection if we have auth and are not already connected/connecting
    if (accessToken && user && !isConnected && !isConnecting) {
      console.log('Attempting WebSocket connection for user:', user.email);
      setIsConnecting(true);
      setConnectionError(null);

      wsRef.current.connect(accessToken)
        .then(() => {
          console.log('WebSocket connected successfully');
          setIsConnected(true);
          setIsConnecting(false);
          setConnectionError(null);

          // Start ping interval to keep connection alive
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
          }

          pingIntervalRef.current = setInterval(() => {
            if (wsRef.current) {
              wsRef.current.ping();
            }
          }, 30000); // Ping every 30 seconds
        })
        .catch((error) => {
          console.error('Failed to connect WebSocket:', error);
          setIsConnecting(false);
          setIsConnected(false);
          setConnectionError(error.message || 'Connection failed');
        });
    }

    // Cleanup function
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // Only disconnect if we're actually cleaning up the component
      // Don't disconnect on every effect re-run
      if (wsRef.current && isConnected) {
        console.log('Cleaning up WebSocket connection');
        wsRef.current.disconnect();
        setIsConnected(false);
      }
    };
  }, [accessToken, user, isConnected, isConnecting]);

  /**
   * Add event listener for WebSocket events
   * Returns cleanup function to remove the listener
   */
  const addEventListener = useCallback((handler: (event: ChatEvent) => void) => {
    if (!wsRef.current) {
      console.warn('Cannot add event listener: WebSocket service not initialized');
      return () => {}; // Return no-op cleanup
    }

    wsRef.current.addEventHandler(handler);
    return () => {
      if (wsRef.current) {
        wsRef.current.removeEventHandler(handler);
      }
    };
  }, []);

  /**
   * Send a chat message via WebSocket
   */
  const sendMessage = useCallback(
    async (
      message: string,
      conversationId: string | null,
      contextItems: Array<{ id: string; type: string }> = []
    ) => {
      // Defensive null checks
      if (!wsRef.current) {
        throw new Error('WebSocket service not initialized');
      }

      if (!isConnected) {
        throw new Error('WebSocket not connected');
      }

      // Additional state check for robustness
      const state = wsRef.current.getConnectionState();
      if (state !== ConnectionState.CONNECTED) {
        throw new Error(`WebSocket in invalid state: ${state}`);
      }

      await wsRef.current.sendMessage(message, conversationId, contextItems);
    },
    [isConnected]
  );

  return {
    isConnected,
    isConnecting,
    connectionError,
    sendMessage,
    addEventListener
  };
}