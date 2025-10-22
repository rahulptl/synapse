import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarMenuItemProps {
  icon?: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: number | string;
  rightElement?: ReactNode;
  className?: string;
  depth?: number;
}

export function SidebarMenuItem({
  icon: Icon,
  label,
  active = false,
  onClick,
  badge,
  rightElement,
  className,
  depth = 0,
}: SidebarMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-2.5 flex items-center gap-3',
        'text-sm font-medium transition-all duration-200',
        'sidebar-menu-item-hover',
        active && 'sidebar-menu-item-active',
        !active && 'text-sidebar-foreground hover:text-sidebar-accent-foreground',
        className
      )}
      style={{ paddingLeft: `${16 + depth * 16}px` }}
    >
      {/* Icon */}
      {Icon && (
        <Icon
          className={cn(
            'h-4 w-4 flex-shrink-0',
            active ? 'text-sidebar-primary' : 'text-sidebar-icon'
          )}
        />
      )}

      {/* Label */}
      <span className="flex-1 text-left truncate">{label}</span>

      {/* Badge */}
      {badge !== undefined && (
        <span className={cn(
          'px-2 py-0.5 rounded-full text-xs font-semibold',
          active
            ? 'bg-sidebar-primary/20 text-sidebar-primary'
            : 'bg-sidebar-accent text-sidebar-muted'
        )}>
          {badge}
        </span>
      )}

      {/* Right Element */}
      {rightElement}
    </button>
  );
}
