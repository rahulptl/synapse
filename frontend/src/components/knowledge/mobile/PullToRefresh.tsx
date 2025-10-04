import { ReactNode, useRef, useEffect } from 'react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Loader2, ArrowDown } from 'lucide-react';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPullDistance?: number;
  disabled?: boolean;
}

/**
 * Pull-to-refresh wrapper component for mobile
 * Enables native-like pull-to-refresh functionality
 */
export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  maxPullDistance = 150,
  disabled = false,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { pullState, touchHandlers, setScrollContainer } = usePullToRefresh(
    onRefresh,
    threshold,
    maxPullDistance
  );

  useEffect(() => {
    if (containerRef.current) {
      setScrollContainer(containerRef.current);
    }
  }, [setScrollContainer]);

  // Calculate refresh indicator opacity
  const getIndicatorOpacity = () => {
    if (pullState.refreshing) return 1;
    return Math.min(pullState.distance / threshold, 1);
  };

  // Get indicator rotation for arrow
  const getIndicatorRotation = () => {
    if (pullState.refreshing) return 0;
    const progress = Math.min(pullState.distance / threshold, 1);
    return progress * 180; // Rotate 180 degrees at threshold
  };

  // Show loading spinner when refreshing, arrow when pulling
  const getIndicatorIcon = () => {
    if (pullState.refreshing) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }

    return (
      <ArrowDown
        className="h-5 w-5 text-blue-500 transition-transform duration-200"
        style={{ transform: `rotate(${getIndicatorRotation()}deg)` }}
      />
    );
  };

  const handlers = disabled ? {} : touchHandlers;

  return (
    <div className="relative h-full overflow-hidden" ref={containerRef}>
      {/* Pull indicator */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center transition-all duration-200 z-10"
        style={{
          height: pullState.refreshing ? '60px' : `${pullState.distance}px`,
          opacity: getIndicatorOpacity(),
        }}
      >
        <div className="bg-white/10 backdrop-blur-sm rounded-full p-2 shadow-lg">
          {getIndicatorIcon()}
        </div>
      </div>

      {/* Scrollable content */}
      <div
        {...handlers}
        className="h-full overflow-y-auto overflow-x-hidden transition-transform duration-200"
        style={{
          transform: `translateY(${
            pullState.refreshing ? '60px' : pullState.pulling ? `${pullState.distance}px` : '0px'
          })`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
