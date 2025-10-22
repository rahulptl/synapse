import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface OngoingGeneration {
  conversationId: string;
  userMessage: string;
  streamingContent: string;
  status: 'streaming' | 'completing' | 'complete';
  startedAt: number;
  completedAt?: number;
}

interface ChatStore {
  // Ongoing generations (background)
  ongoingGenerations: Map<string, OngoingGeneration>;

  // Completed responses waiting to be viewed
  pendingResponses: Map<string, {
    conversationId: string;
    message: Message;
    timestamp: number;
  }>;

  // Actions
  startGeneration: (conversationId: string, userMessage: string) => void;
  updateStreamingContent: (conversationId: string, delta: string) => void;
  completeGeneration: (conversationId: string, finalMessage: Message) => void;
  clearPendingResponse: (conversationId: string) => void;
  getHasPendingResponse: (conversationId: string) => boolean;
  getPendingResponsesCount: () => number;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      ongoingGenerations: new Map(),
      pendingResponses: new Map(),

      startGeneration: (conversationId, userMessage) => {
        set((state) => {
          const newOngoing = new Map(state.ongoingGenerations);
          newOngoing.set(conversationId, {
            conversationId,
            userMessage,
            streamingContent: '',
            status: 'streaming',
            startedAt: Date.now(),
          });
          return { ongoingGenerations: newOngoing };
        });
      },

      updateStreamingContent: (conversationId, delta) => {
        set((state) => {
          const newOngoing = new Map(state.ongoingGenerations);
          const current = newOngoing.get(conversationId);
          if (current) {
            newOngoing.set(conversationId, {
              ...current,
              streamingContent: current.streamingContent + delta,
            });
          }
          return { ongoingGenerations: newOngoing };
        });
      },

      completeGeneration: (conversationId, finalMessage) => {
        set((state) => {
          // Remove from ongoing
          const newOngoing = new Map(state.ongoingGenerations);
          newOngoing.delete(conversationId);

          // Add to pending responses
          const newPending = new Map(state.pendingResponses);
          newPending.set(conversationId, {
            conversationId,
            message: finalMessage,
            timestamp: Date.now(),
          });

          return {
            ongoingGenerations: newOngoing,
            pendingResponses: newPending,
          };
        });
      },

      clearPendingResponse: (conversationId) => {
        set((state) => {
          const newPending = new Map(state.pendingResponses);
          newPending.delete(conversationId);
          return { pendingResponses: newPending };
        });
      },

      getHasPendingResponse: (conversationId) => {
        return get().pendingResponses.has(conversationId);
      },

      getPendingResponsesCount: () => {
        return get().pendingResponses.size;
      },
    }),
    {
      name: 'chat-store',
      // Custom storage to handle Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;

          const { state } = JSON.parse(str);
          return {
            state: {
              ...state,
              ongoingGenerations: new Map(state.ongoingGenerations || []),
              pendingResponses: new Map(state.pendingResponses || []),
            },
          };
        },
        setItem: (name, value) => {
          const str = JSON.stringify({
            state: {
              ...value.state,
              ongoingGenerations: Array.from(value.state.ongoingGenerations.entries()),
              pendingResponses: Array.from(value.state.pendingResponses.entries()),
            },
          });
          localStorage.setItem(name, str);
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);