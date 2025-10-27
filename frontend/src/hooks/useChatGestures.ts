import { useState, useRef, useCallback } from 'react';

interface SwipeGesture {
  direction: 'left' | 'right' | 'up' | 'down';
  velocity: number;
  distance: number;
}

interface GestureHandlers {
  onSwipeLeft?: (gesture: SwipeGesture) => void;
  onSwipeRight?: (gesture: SwipeGesture) => void;
  onSwipeUp?: (gesture: SwipeGesture) => void;
  onSwipeDown?: (gesture: SwipeGesture) => void;
  onLongPress?: (position: { x: number; y: number }) => void;
  onTap?: (position: { x: number; y: number }) => void;
}

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

const SWIPE_THRESHOLD = 50; // Minimum distance for swipe
const SWIPE_VELOCITY_THRESHOLD = 0.3; // Minimum velocity for swipe
const LONG_PRESS_DELAY = 500; // Delay for long press in ms
const TAP_THRESHOLD = 10; // Maximum movement for tap

/**
 * Enhanced gesture hook for mobile chat interactions
 * Supports swipe gestures, long press, and tap with proper touch handling
 */
export function useChatGestures(handlers: GestureHandlers = {}) {
  const [isGesturing, setIsGesturing] = useState(false);
  const [gestureState, setGestureState] = useState<string | null>(null);

  const touchStartRef = useRef<TouchPoint | null>(null);
  const touchEndRef = useRef<TouchPoint | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasMoved = useRef(false);

  const resetGestures = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;
    touchEndRef.current = null;
    hasMoved.current = false;
    setIsGesturing(false);
    setGestureState(null);
  }, []);

  const calculateGesture = useCallback((
    start: TouchPoint,
    end: TouchPoint
  ): SwipeGesture | null => {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const deltaTime = end.timestamp - start.timestamp;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = distance / Math.max(deltaTime, 1);

    if (distance < SWIPE_THRESHOLD) return null;
    if (velocity < SWIPE_VELOCITY_THRESHOLD) return null;

    let direction: SwipeGesture['direction'];
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    return { direction, velocity, distance };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const now = Date.now();

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: now
    };

    setIsGesturing(true);
    setGestureState('touch-start');
    hasMoved.current = false;

    // Start long press timer
    if (handlers.onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        if (touchStartRef.current && !hasMoved.current) {
          handlers.onLongPress({
            x: touchStartRef.current.x,
            y: touchStartRef.current.y
          });
          setGestureState('long-press');
        }
      }, LONG_PRESS_DELAY);
    }
  }, [handlers.onLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

    // If moved beyond tap threshold, clear long press timer
    if ((deltaX > TAP_THRESHOLD || deltaY > TAP_THRESHOLD) && !hasMoved.current) {
      hasMoved.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      setGestureState('moving');
    }

    touchEndRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) {
      resetGestures();
      return;
    }

    const touch = e.changedTouches[0];
    const endPoint: TouchPoint = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };

    touchEndRef.current = endPoint;

    // Calculate movement
    const deltaX = Math.abs(endPoint.x - touchStartRef.current.x);
    const deltaY = Math.abs(endPoint.y - touchStartRef.current.y);

    // Check for tap (if hasn't moved much)
    if (deltaX <= TAP_THRESHOLD && deltaY <= TAP_THRESHOLD && !hasMoved.current) {
      if (handlers.onTap) {
        handlers.onTap({ x: endPoint.x, y: endPoint.y });
        setGestureState('tap');
      }
    } else {
      // Check for swipe
      const gesture = calculateGesture(touchStartRef.current, endPoint);
      if (gesture) {
        setGestureState(`swipe-${gesture.direction}`);

        switch (gesture.direction) {
          case 'left':
            handlers.onSwipeLeft?.(gesture);
            break;
          case 'right':
            handlers.onSwipeRight?.(gesture);
            break;
          case 'up':
            handlers.onSwipeUp?.(gesture);
            break;
          case 'down':
            handlers.onSwipeDown?.(gesture);
            break;
        }
      }
    }

    // Cleanup
    setTimeout(resetGestures, 100);
  }, [handlers, calculateGesture, resetGestures]);

  // Mouse event support for testing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    touchStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      timestamp: now
    };
    setIsGesturing(true);
    setGestureState('mouse-down');
    hasMoved.current = false;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!touchStartRef.current || !isGesturing) return;

    const deltaX = Math.abs(e.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(e.clientY - touchStartRef.current.y);

    if (deltaX > TAP_THRESHOLD || deltaY > TAP_THRESHOLD) {
      hasMoved.current = true;
      setGestureState('mouse-moving');
    }

    touchEndRef.current = {
      x: e.clientX,
      y: e.clientY,
      timestamp: Date.now()
    };
  }, [isGesturing]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!touchStartRef.current) {
      resetGestures();
      return;
    }

    const endPoint: TouchPoint = {
      x: e.clientX,
      y: e.clientY,
      timestamp: Date.now()
    };

    const deltaX = Math.abs(endPoint.x - touchStartRef.current.x);
    const deltaY = Math.abs(endPoint.y - touchStartRef.current.y);

    if (deltaX <= TAP_THRESHOLD && deltaY <= TAP_THRESHOLD && !hasMoved.current) {
      handlers.onTap?.({ x: endPoint.x, y: endPoint.y });
      setGestureState('mouse-tap');
    } else {
      const gesture = calculateGesture(touchStartRef.current, endPoint);
      if (gesture) {
        setGestureState(`mouse-swipe-${gesture.direction}`);

        switch (gesture.direction) {
          case 'left':
            handlers.onSwipeLeft?.(gesture);
            break;
          case 'right':
            handlers.onSwipeRight?.(gesture);
            break;
          case 'up':
            handlers.onSwipeUp?.(gesture);
            break;
          case 'down':
            handlers.onSwipeDown?.(gesture);
            break;
        }
      }
    }

    setTimeout(resetGestures, 100);
  }, [handlers, calculateGesture, resetGestures]);

  // Touch event handlers for React elements
  const touchHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
  };

  return {
    isGesturing,
    gestureState,
    touchHandlers,
    resetGestures
  };
}