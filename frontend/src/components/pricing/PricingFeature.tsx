import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PricingFeatureProps {
  included: boolean;
  children: React.ReactNode;
  className?: string;
}

export function PricingFeature({ included, children, className }: PricingFeatureProps) {
  return (
    <div className={cn(
      'flex items-center gap-3 py-2 text-sm',
      'transition-colors duration-200',
      included ? 'text-foreground' : 'text-muted-foreground',
      className
    )}>
      <div className={cn(
        'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center',
        'transition-all duration-200',
        included
          ? 'bg-green-500 text-white'
          : 'bg-muted text-muted-foreground'
      )}>
        {included ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </div>
      <span className={cn(
        'transition-all duration-200',
        included ? 'font-medium' : 'line-through opacity-50'
      )}>
        {children}
      </span>
    </div>
  );
}