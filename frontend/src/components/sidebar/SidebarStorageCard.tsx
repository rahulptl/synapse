import { HardDrive, Rocket, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface SidebarStorageCardProps {
  usedBytes: number;
  totalBytes: number;
  onUpgrade?: () => void;
  className?: string;
}

export function SidebarStorageCard({ usedBytes, totalBytes, onUpgrade, className }: SidebarStorageCardProps) {
  const navigate = useNavigate();
  const usagePercentage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
  const isNearCapacity = usagePercentage > 80;
  const isAlmostFull = usagePercentage > 90;

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  };

  const handleUpgrade = () => {
    console.log('[SIDEBAR_STORAGE_CARD] Upgrade clicked - navigating to pricing page');
    if (onUpgrade) {
      onUpgrade();
    } else {
      // Default behavior: navigate to pricing page
      navigate('/pricing');
    }
  };

  return (
    <div className={cn('px-4 pb-4', className)}>
      {/* Storage Usage Card */}
      <div
        className={cn(
          'rounded-xl p-4 mb-3',
          'bg-gradient-to-br from-sidebar-accent/40 to-sidebar-accent/20',
          'border border-sidebar-border/50',
          'transition-all duration-300 hover:border-sidebar-border/80',
          'relative overflow-hidden'
        )}
      >
        {/* Storage Icon and Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className={cn(
            'p-1.5 rounded-lg',
            isAlmostFull ? 'bg-red-500/10' : 'bg-sidebar-primary/10'
          )}>
            <HardDrive className={cn(
              'h-4 w-4',
              isAlmostFull ? 'text-red-400' : 'text-sidebar-primary'
            )} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-sidebar-foreground">
              Storage Usage
            </h3>
            <p className="text-xs text-sidebar-muted">
              {formatBytes(usedBytes)} of {formatBytes(totalBytes)}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <Progress
            value={usagePercentage}
            className={cn(
              'h-2',
              isNearCapacity && '[&>div]:bg-gradient-to-r from-orange-400 to-orange-500',
              isAlmostFull && '[&>div]:bg-gradient-to-r from-red-400 to-red-500'
            )}
          />
        </div>

        {/* Usage Percentage */}
        <div className="flex items-center justify-between">
          <span className={cn(
            'text-xs font-medium',
            isAlmostFull ? 'text-red-400' : isNearCapacity ? 'text-orange-400' : 'text-sidebar-muted'
          )}>
            {usagePercentage.toFixed(1)}% used
          </span>
          {isNearCapacity && (
            <TrendingUp className="h-3 w-3 text-orange-400" />
          )}
        </div>
      </div>

      {/* Upgrade CTA Card */}
      <div
        className={cn(
          'rounded-xl p-4',
          'bg-gradient-to-br from-primary/20 to-primary/5',
          'border border-primary/30 hover:border-primary/50',
          'transition-all duration-300 hover:shadow-lg',
          'relative overflow-hidden group cursor-pointer',
          'hover:scale-[1.02] active:scale-[0.98]'
        )}
        onClick={handleUpgrade}
      >
        {/* Background decoration */}
        <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
          <Rocket className="h-32 w-32 text-primary" />
        </div>

        {/* Content */}
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/20 group-hover:bg-primary/30 transition-colors">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-sidebar-foreground mb-1">
                Want more storage?
              </h3>
              <p className="text-xs text-sidebar-muted leading-tight">
                Upgrade to Pro plan for unlimited possibilities
              </p>
            </div>
          </div>

          <Button
            variant="default"
            size="sm"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground group-hover:shadow-lg transition-all duration-200"
          >
            <span className="flex items-center gap-2">
              Upgrade to Pro
              <TrendingUp className="h-3 w-3" />
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
