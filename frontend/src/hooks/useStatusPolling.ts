import { useEffect, useRef, useState, useCallback } from 'react';
import { apiClient } from '@/services/apiClient';

interface ItemStatus {
  itemId: string;
  processing_status: string;
  is_chunked: boolean;
  total_chunks: number;
  vector_count: number;
  is_searchable: boolean;
  updated_at: string;
}

interface UseStatusPollingOptions {
  enabled?: boolean;
  interval?: number; // milliseconds
  onStatusChange?: (itemId: string, status: ItemStatus) => void;
}

/**
 * Hook to poll processing status for knowledge items
 *
 * Automatically stops polling when items reach 'completed' or 'failed' status
 */
export function useStatusPolling(
  itemIds: string[],
  auth: { userId: string; accessToken: string } | null,
  options: UseStatusPollingOptions = {}
) {
  const {
    enabled = true,
    interval = 3000, // 3 seconds
    onStatusChange
  } = options;

  const [statuses, setStatuses] = useState<Map<string, ItemStatus>>(new Map());
  const [isPolling, setIsPolling] = useState(false);
  const pollingItemsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Track which items need polling
  useEffect(() => {
    const newPollingItems = new Set<string>();

    itemIds.forEach(itemId => {
      const status = statuses.get(itemId);
      // Poll if: no status yet, or status is pending/processing
      if (!status ||
          status.processing_status === 'pending' ||
          status.processing_status === 'processing') {
        newPollingItems.add(itemId);
      }
    });

    pollingItemsRef.current = newPollingItems;
  }, [itemIds, statuses]);

  const pollStatuses = useCallback(async () => {
    if (!auth || !enabled || pollingItemsRef.current.size === 0) {
      return;
    }

    setIsPolling(true);

    try {
      const itemsToPoll = Array.from(pollingItemsRef.current);

      // Poll each item's status
      const results = await Promise.allSettled(
        itemsToPoll.map(async (itemId) => {
          try {
            const response = await apiClient.getItemStatus(itemId, auth);
            return { itemId, status: response };
          } catch (error) {
            console.error(`Failed to poll status for ${itemId}:`, error);
            return null;
          }
        })
      );

      // Update statuses
      const newStatuses = new Map(statuses);
      let hasChanges = false;

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const { itemId, status } = result.value;

          // Check if status changed
          const oldStatus = statuses.get(itemId);
          if (!oldStatus ||
              oldStatus.processing_status !== status.processing_status ||
              oldStatus.is_searchable !== status.is_searchable) {
            hasChanges = true;
            newStatuses.set(itemId, status);

            // Call callback if provided
            if (onStatusChange) {
              onStatusChange(itemId, status);
            }

            // Remove from polling if completed or failed
            if (status.processing_status === 'completed' ||
                status.processing_status === 'failed') {
              pollingItemsRef.current.delete(itemId);
            }
          }
        }
      });

      if (hasChanges) {
        setStatuses(newStatuses);
      }

    } catch (error) {
      console.error('Error polling statuses:', error);
    } finally {
      setIsPolling(false);
    }
  }, [auth, enabled, statuses, onStatusChange]);

  // Start polling
  useEffect(() => {
    if (!enabled || !auth || pollingItemsRef.current.size === 0) {
      // Stop polling
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Initial poll
    pollStatuses();

    // Set up interval
    timerRef.current = setInterval(pollStatuses, interval);

    // Cleanup
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, auth, interval, pollStatuses]);

  return {
    statuses,
    isPolling,
    activePollingCount: pollingItemsRef.current.size,
    refetch: pollStatuses
  };
}
