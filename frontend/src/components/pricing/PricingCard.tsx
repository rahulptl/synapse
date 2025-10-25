import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PricingFeature } from './PricingFeature';
import { plans } from './pricingPlans';
import { cn } from '@/lib/utils';

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  period: string;
  badge?: string;
  popular?: boolean;
  icon: React.ComponentType;
  features: {
    text: string;
    included: boolean;
  }[];
}


interface PricingCardProps {
  plan: PricingPlan;
  onUpgrade?: (planId: string) => void;
  className?: string;
}

export function PricingCard({ plan, onUpgrade, className }: PricingCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = plan.icon;

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-card p-8 transition-all duration-300 hover:shadow-2xl',
        plan.popular
          ? 'border-primary/20 bg-gradient-to-b from-primary/5 to-transparent scale-105 shadow-xl'
          : 'border-border hover:border-primary/30 bg-background',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Popular Badge */}
      {plan.badge && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <Badge variant="secondary" className="bg-primary text-primary-foreground px-3 py-1">
            {plan.badge}
          </Badge>
        </div>
      )}

      {/* Plan Header */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <div className={cn(
            'p-3 rounded-full transition-all duration-300',
            plan.popular
              ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground'
          )}>
            <Icon className={cn(
              'h-8 w-8',
              isHovered && 'scale-110 transition-transform'
            )} />
          </div>
        </div>

        <h3 className="text-2xl font-bold text-foreground mb-2">
          {plan.name}
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          {plan.description}
        </p>

        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-bold text-foreground">
            ${plan.price}
          </span>
          <span className="text-muted-foreground">/{plan.period}</span>
        </div>
      </div>

      {/* Features */}
      <div className="space-y-1 mb-8">
        {plan.features.map((feature, index) => (
          <PricingFeature key={index} included={feature.included}>
            {feature.text}
          </PricingFeature>
        ))}
      </div>

      {/* CTA Button */}
      <Button
        onClick={() => onUpgrade?.(plan.id)}
        className={cn(
          'w-full transition-all duration-200',
          plan.popular
            ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl'
            : 'bg-background hover:bg-accent text-foreground border hover:border-primary/50'
        )}
        size="lg"
      >
        {plan.popular ? 'Start Free Trial' : 'Get Started'}
      </Button>

      {/* Hover Effect */}
      {plan.popular && isHovered && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 pointer-events-none animate-pulse" />
      )}
    </div>
  );
}

