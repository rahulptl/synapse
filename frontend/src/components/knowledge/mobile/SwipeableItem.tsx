import { ReactNode } from 'react';
import { useSwipe, SwipeHandlers } from '@/hooks/useSwipe';
import { Trash2, RefreshCw } from 'lucide-react';

interface SwipeableItemProps {
  children: ReactNode;
  onDelete?: () => void;
  onReprocess?: () => void;
  threshold?: number;
}

/**
 * Swipeable wrapper component for mobile touch interactions
 * - Swipe left to reveal delete action
 * - Swipe right to reveal reprocess action
 */
export function SwipeableItem({
  children,
  onDelete,
  onReprocess,
  threshold = 80,
}: SwipeableItemProps) {
  const handlers: SwipeHandlers = {
    onSwipeLeft: () => {
      if (onDelete) {
        // Trigger haptic feedback if available
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
        onDelete();
      }
    },
    onSwipeRight: () => {
      if (onReprocess) {
        // Trigger haptic feedback if available
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
        onReprocess();
      }
    },
  };

  const { swipeState, touchHandlers } = useSwipe(handlers, threshold);

  // Calculate transform based on swipe offset
  const getTransform = () => {
    if (!swipeState.swiping) return 'translateX(0)';

    // Limit the swipe distance
    const maxOffset = 100;
    const clampedOffset = Math.max(
      -maxOffset,
      Math.min(maxOffset, swipeState.offset)
    );

    return `translateX(${clampedOffset}px)`;
  };

  // Get background color based on swipe direction
  const getBackgroundColor = () => {
    if (!swipeState.swiping) return 'transparent';

    if (swipeState.direction === 'left' && onDelete) {
      return 'rgba(239, 68, 68, 0.2)'; // Red for delete
    }
    if (swipeState.direction === 'right' && onReprocess) {
      return 'rgba(59, 130, 246, 0.2)'; // Blue for reprocess
    }

    return 'transparent';
  };

  // Show action icon based on swipe direction
  const getActionIcon = () => {
    if (!swipeState.swiping || Math.abs(swipeState.offset) < 30) return null;

    if (swipeState.direction === 'left' && onDelete) {
      return (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
          <div className="bg-red-500 p-3 rounded-full">
            <Trash2 className="h-5 w-5 text-white" />
          </div>
        </div>
      );
    }

    if (swipeState.direction === 'right' && onReprocess) {
      return (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
          <div className="bg-blue-500 p-3 rounded-full">
            <RefreshCw className="h-5 w-5 text-white" />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="relative overflow-hidden">
      {/* Background with action icon */}
      <div
        className="absolute inset-0 transition-colors duration-200"
        style={{ backgroundColor: getBackgroundColor() }}
      >
        {getActionIcon()}
      </div>

      {/* Swipeable content */}
      <div
        {...touchHandlers}
        className="relative transition-transform duration-200 ease-out"
        style={{
          transform: getTransform(),
          touchAction: 'pan-y', // Allow vertical scrolling
        }}
      >
        {children}
      </div>
    </div>
  );
}
