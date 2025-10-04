import { useRef, useState, useEffect, TouchEvent } from 'react';

export interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
}

export interface SwipeState {
  swiping: boolean;
  direction: 'left' | 'right' | null;
  offset: number;
}

/**
 * Hook for detecting swipe gestures on touch devices
 * @param handlers - Callback functions for swipe events
 * @param threshold - Minimum distance (px) to trigger swipe (default: 50)
 * @returns Touch event handlers and current swipe state
 */
export function useSwipe(
  handlers: SwipeHandlers,
  threshold: number = 50
) {
  const [swipeState, setSwipeState] = useState<SwipeState>({
    swiping: false,
    direction: null,
    offset: 0,
  });

  const startX = useRef<number>(0);
  const currentX = useRef<number>(0);

  const handleTouchStart = (e: TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = e.touches[0].clientX;

    setSwipeState({
      swiping: true,
      direction: null,
      offset: 0,
    });

    handlers.onSwipeStart?.();
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!swipeState.swiping) return;

    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    const direction = diff > 0 ? 'right' : 'left';

    setSwipeState({
      swiping: true,
      direction,
      offset: diff,
    });
  };

  const handleTouchEnd = () => {
    const diff = currentX.current - startX.current;
    const absDiff = Math.abs(diff);

    if (absDiff >= threshold) {
      if (diff > 0) {
        handlers.onSwipeRight?.();
      } else {
        handlers.onSwipeLeft?.();
      }
    }

    setSwipeState({
      swiping: false,
      direction: null,
      offset: 0,
    });

    handlers.onSwipeEnd?.();

    // Reset refs
    startX.current = 0;
    currentX.current = 0;
  };

  return {
    swipeState,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
