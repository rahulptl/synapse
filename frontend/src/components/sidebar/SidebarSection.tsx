import { ReactNode, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarSectionProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  className?: string;
  extraAction?: ReactNode;
}

export function SidebarSection({
  title,
  children,
  defaultExpanded = true,
  isExpanded: controlledExpanded,
  onToggle,
  collapsible = true,
  className,
  extraAction,
}: SidebarSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  return (
    <div className={cn('border-b border-sidebar-border last:border-0', className)}>
      {/* Section Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={collapsible ? handleToggle : undefined}
          className={cn(
            'flex-1 flex items-center gap-2',
            'sidebar-section-header',
            'transition-colors duration-200',
            collapsible && 'hover:bg-sidebar-accent/30 cursor-pointer',
            !collapsible && 'cursor-default'
          )}
        >
          <span className="text-sidebar-muted">{title}</span>
          {collapsible && (
            <div className="text-sidebar-muted transition-transform duration-200">
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </div>
          )}
        </button>
        {extraAction}
      </div>

      {/* Section Content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-out',
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="py-1">{children}</div>
      </div>
    </div>
  );
}
