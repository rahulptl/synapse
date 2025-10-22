import { HardDrive } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface SidebarStorageCardProps {
  usedBytes: number;
  totalBytes: number;
  onUpgrade?: () => void;
  className?: string;
}

export function SidebarStorageCard({ usedBytes, totalBytes, onUpgrade, className }: SidebarStorageCardProps) {
  const usagePercentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  const isNearCapacity = usagePercentage > 80;

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      // Default behavior: navigate to settings/billing
      window.location.href = '/settings?tab=billing';
    }
  };

  return (
    <div
      className={cn(
        'mx-4 p-3 rounded-lg',
        'bg-sidebar-accent/30 border border-sidebar-border',
        'transition-all duration-200 hover:border-sidebar-border/60',
        className
      )}
    >
      {/* Header with inline Upgrade CTA */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5 text-sidebar-icon" />
          <span className="text-xs font-semibold text-sidebar-foreground uppercase tracking-wide">
            Storage
          </span>
        </div>
        <button
          onClick={handleUpgrade}
          className="text-xs font-medium text-sidebar-primary hover:text-sidebar-primary/80 transition-colors"
        >
          Upgrade
        </button>
      </div>

      {/* Progress Bar with Percentage */}
      <div className="flex items-center gap-2">
        <Progress
          value={usagePercentage}
          className={cn(
            'h-1.5 flex-1',
            isNearCapacity && '[&>div]:bg-orange-500'
          )}
        />
        <span className={cn(
          'text-xs font-medium tabular-nums min-w-[32px] text-right',
          isNearCapacity ? 'text-orange-400' : 'text-sidebar-primary'
        )}>
          {usagePercentage.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
