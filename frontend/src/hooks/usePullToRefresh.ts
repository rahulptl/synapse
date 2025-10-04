import { useRef, useState, useEffect, TouchEvent } from 'react';

export interface PullToRefreshState {
  pulling: boolean;
  distance: number;
  refreshing: boolean;
}

/**
 * Hook for implementing pull-to-refresh functionality
 * @param onRefresh - Async callback function to execute on refresh
 * @param threshold - Distance (px) to pull before triggering refresh (default: 80)
 * @param maxPullDistance - Maximum pull distance (default: 150)
 * @returns Touch handlers and current pull state
 */
export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  threshold: number = 80,
  maxPullDistance: number = 150
) {
  const [pullState, setPullState] = useState<PullToRefreshState>({
    pulling: false,
    distance: 0,
    refreshing: false,
  });

  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  const handleTouchStart = (e: TouchEvent) => {
    // Only allow pull-to-refresh when at the top of the scroll container
    const container = scrollContainerRef.current || window;
    const scrollTop = container === window
      ? window.scrollY
      : (container as HTMLElement).scrollTop;

    if (scrollTop > 0 || pullState.refreshing) return;

    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (pullState.refreshing) return;

    currentY.current = e.touches[0].clientY;
    const diff = currentY.current - startY.current;

    // Only pull down
    if (diff > 0) {
      // Prevent default scroll behavior when pulling
      e.preventDefault();

      // Apply resistance - pull gets harder as distance increases
      const resistance = 0.5;
      const distance = Math.min(diff * resistance, maxPullDistance);

      setPullState({
        pulling: true,
        distance,
        refreshing: false,
      });
    }
  };

  const handleTouchEnd = async () => {
    if (pullState.refreshing) return;

    if (pullState.distance >= threshold) {
      // Trigger refresh
      setPullState({
        pulling: false,
        distance: threshold,
        refreshing: true,
      });

      try {
        await onRefresh();
      } finally {
        setPullState({
          pulling: false,
          distance: 0,
          refreshing: false,
        });
      }
    } else {
      // Reset if threshold not reached
      setPullState({
        pulling: false,
        distance: 0,
        refreshing: false,
      });
    }

    // Reset refs
    startY.current = 0;
    currentY.current = 0;
  };

  const setScrollContainer = (element: HTMLElement | null) => {
    scrollContainerRef.current = element;
  };

  return {
    pullState,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    setScrollContainer,
  };
}
