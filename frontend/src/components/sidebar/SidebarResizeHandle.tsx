import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarResizeHandleProps {
  onResize: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
}

export function SidebarResizeHandle({
  onResize,
  minWidth = 280,
  maxWidth = 400,
  className,
}: SidebarResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const deltaX = e.clientX - startXRef.current;
      const newWidth = startWidthRef.current + deltaX;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      onResize(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize, minWidth, maxWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;

    // Get current sidebar width
    const sidebar = (e.target as HTMLElement).closest('[data-sidebar]');
    if (sidebar) {
      startWidthRef.current = sidebar.getBoundingClientRect().width;
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      className={cn(
        'absolute top-0 right-0 h-full w-1 cursor-col-resize group',
        'hover:w-1.5 transition-all duration-150',
        className
      )}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Invisible wider hit area */}
      <div className="absolute inset-y-0 -left-2 -right-2" />

      {/* Visual indicator */}
      <div
        className={cn(
          'absolute inset-0 bg-sidebar-border',
          'transition-all duration-200',
          (isDragging || isHovered) && 'bg-sidebar-primary'
        )}
      />

      {/* Grip icon - shows on hover */}
      <div
        className={cn(
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'p-1 rounded bg-sidebar-background/90 border border-sidebar-border',
          'opacity-0 transition-opacity duration-200',
          'pointer-events-none',
          (isDragging || isHovered) && 'opacity-100'
        )}
      >
        <GripVertical className="h-3 w-3 text-sidebar-primary" />
      </div>
    </div>
  );
}
