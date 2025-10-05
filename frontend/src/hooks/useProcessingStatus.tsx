import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/services/apiClient';

export interface ProcessingStatusData {
  knowledge_item_id: string;
  processing_status: string;
  is_chunked: boolean;
  total_chunks: number;
  vector_count?: number;
  vectors_with_embeddings?: number;
  is_searchable?: boolean;
  content_type: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface UseProcessingStatusOptions {
  enabled?: boolean;
  pollInterval?: number; // milliseconds
  maxPollDuration?: number; // milliseconds
}

/**
 * Hook to poll processing status for a knowledge item
 *
 * Features:
 * - Automatic polling for pending/processing items
 * - Stops polling when completed/failed
 * - Configurable poll interval and max duration
 * - Returns latest status data
 *
 * @param itemId - Knowledge item ID to poll
 * @param auth - Authentication credentials
 * @param initialStatus - Initial status to avoid unnecessary polling
 * @param options - Configuration options
 */
export function useProcessingStatus(
  itemId: string | null,
  auth: { userId: string; accessToken: string } | null,
  initialStatus?: string,
  options: UseProcessingStatusOptions = {}
) {
  const {
    enabled = true,
    pollInterval = 3000, // Poll every 3 seconds
    maxPollDuration = 300000, // Stop after 5 minutes
  } = options;

  const [status, setStatus] = useState<ProcessingStatusData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollStartTimeRef = useRef<number>(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check if we should poll based on status
  const shouldPoll = (currentStatus: string | undefined) => {
    if (!currentStatus) return true; // Unknown status, poll to check

    // Poll if pending or processing
    if (currentStatus === 'pending' || currentStatus === 'processing') {
      return true;
    }

    // Don't poll if completed or failed
    return false;
  };

  // Clear polling interval
  const clearPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  // Fetch status once
  const fetchStatus = async () => {
    if (!itemId || !auth) return;

    try {
      const result = await apiClient.getProcessingStatus(itemId, auth);
      setStatus(result);
      setError(null);

      // Stop polling if completed or failed
      if (!shouldPoll(result.processing_status)) {
        clearPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
      // Don't stop polling on error - might be temporary network issue
    }
  };

  useEffect(() => {
    // Don't poll if disabled, no item ID, or no auth
    if (!enabled || !itemId || !auth) {
      clearPolling();
      return;
    }

    // Don't poll if initial status is already completed/failed
    if (initialStatus && !shouldPoll(initialStatus)) {
      setIsPolling(false);
      return;
    }

    // Start polling
    setIsPolling(true);
    pollStartTimeRef.current = Date.now();

    // Fetch immediately
    fetchStatus();

    // Set up polling interval
    pollIntervalRef.current = setInterval(() => {
      // Check if max duration exceeded
      const elapsed = Date.now() - pollStartTimeRef.current;
      if (elapsed > maxPollDuration) {
        console.log(`[useProcessingStatus] Max poll duration (${maxPollDuration}ms) exceeded for item ${itemId}`);
        clearPolling();
        return;
      }

      fetchStatus();
    }, pollInterval);

    // Cleanup on unmount or dependency change
    return () => {
      clearPolling();
    };
  }, [itemId, auth?.userId, auth?.accessToken, enabled, initialStatus, pollInterval, maxPollDuration]);

  return {
    status,
    isPolling,
    error,
    refetch: fetchStatus,
  };
}
