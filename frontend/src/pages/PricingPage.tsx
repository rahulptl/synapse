import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PricingCard } from '@/components/pricing/PricingCard';
import { plans } from '@/components/pricing/pricingPlans';
import { CheckCircle, ArrowLeft, Shield, Star, Zap, CreditCard, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function PricingPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleUpgrade = (planId: string) => {
    console.log('[PRICING_PAGE] Upgrade requested for plan:', planId);
    setSelectedPlan(planId);
    setShowPaymentDialog(true);
  };

  const handlePaymentDialogClose = () => {
    setShowPaymentDialog(false);
    setSelectedPlan(null);
  };

  const handleBack = () => {
    navigate(-1);
  };

  // Calculate annual savings
  const getAnnualSavings = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return 0;
    return Math.round(plan.price * 12 * 0.2); // 20% annual discount
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-muted/20">
      {/* Header */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Secure Payment</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5" />
        <div className="absolute top-20 right-10 w-72 h-72 bg-primary/10 rounded-full filter blur-3xl animate-pulse" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-blue-500/10 rounded-full filter blur-3xl animate-pulse delay-1000" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 mb-6">
              <Star className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Flexible pricing for every need</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
              Choose Your Perfect Plan
            </h1>

            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed">
              Unlock the full power of AI-powered knowledge management with plans designed for individuals, teams, and enterprises.
            </p>

            {/* Billing Toggle */}
            <div className="inline-flex items-center gap-1 bg-muted/50 border border-border rounded-full p-1">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  billingCycle === 'monthly'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  billingCycle === 'annual'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Annual
                <span className="ml-2 text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-20 animate-fade-in-up">
            {plans.map((plan, index) => {
              const displayPrice = billingCycle === 'annual'
                ? Math.round(plan.price * 12 * 0.8)
                : plan.price;
              const displayPeriod = billingCycle === 'annual' ? 'year' : 'month';
              const savings = billingCycle === 'annual' ? getAnnualSavings(plan.id) : 0;

              return (
                <div
                  key={plan.id}
                  className="relative animate-fade-in-up"
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  {/* Annual savings badge */}
                  {billingCycle === 'annual' && savings > 0 && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                      <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        Save ${savings}/year
                      </div>
                    </div>
                  )}

                  <PricingCard
                    plan={{
                      ...plan,
                      price: displayPrice,
                      period: displayPeriod
                    }}
                    onUpgrade={handleUpgrade}
                    className="h-full"
                  />
                </div>
              );
            })}
          </div>

          {/* Features Comparison */}
          <div className="mb-20">
            <h2 className="text-3xl font-bold text-center mb-12">Compare Features</h2>
            <div className="bg-card/50 border border-border rounded-2xl p-8 backdrop-blur-sm">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                {/* Feature categories */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground mb-4">Core Features</h3>
                  <div className="space-y-3 text-sm">
                    <div className="text-muted-foreground">Storage Space</div>
                    <div className="text-muted-foreground">Daily Requests</div>
                    <div className="text-muted-foreground">AI Models</div>
                    <div className="text-muted-foreground">Support</div>
                  </div>
                </div>

                {/* Basic Plan */}
                <div className="text-center space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Basic</h4>
                    <div className="text-2xl font-bold">$5<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div>1 GB</div>
                    <div>50/day</div>
                    <div>Basic only</div>
                    <div>Email</div>
                  </div>
                </div>

                {/* Pro Plan */}
                <div className="text-center space-y-4">
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 relative">
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground px-2 py-1 rounded-full text-xs font-medium">
                        Popular
                      </span>
                    </div>
                    <h4 className="font-semibold mb-2">Pro</h4>
                    <div className="text-2xl font-bold">$20<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div>100 GB</div>
                    <div>500/day</div>
                    <div>All + 3rd party</div>
                    <div>Priority chat</div>
                  </div>
                </div>

                {/* Enterprise Plan */}
                <div className="text-center space-y-4">
                  <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-4">
                    <h4 className="font-semibold mb-2">Enterprise</h4>
                    <div className="text-2xl font-bold">$200<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div>Unlimited</div>
                    <div>Unlimited</div>
                    <div>Everything</div>
                    <div>Dedicated team</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="text-center">
            <div className="inline-flex items-center gap-8 text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm">30-day money-back guarantee</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm">Cancel anytime</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm">24/7 support</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={handlePaymentDialogClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Stripe Payment Coming Soon
            </DialogTitle>
            <DialogDescription>
              We're working hard to bring you secure payment processing through Stripe.
              Please leave your contact details and we'll reach out as soon as payment processing is available.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="bg-muted/50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Selected Plan:</span>
                <span className="text-sm font-bold text-primary capitalize">
                  {selectedPlan} {plans.find(p => p.id === selectedPlan)?.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Price:</span>
                <span className="text-sm font-bold">
                  ${plans.find(p => p.id === selectedPlan)?.price}/{plans.find(p => p.id === selectedPlan)?.period}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>We'll contact you at your registered email address</span>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Early Bird Special:</strong> First 100 customers will get 20% off their first 3 months!
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handlePaymentDialogClose}>
              Maybe Later
            </Button>
            <Button
              onClick={() => {
                toast({
                  title: "Request Received!",
                  description: "We'll contact you soon when payment processing is available.",
                });
                handlePaymentDialogClose();
              }}
              className="bg-primary hover:bg-primary/90"
            >
              Notify Me When Available
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}