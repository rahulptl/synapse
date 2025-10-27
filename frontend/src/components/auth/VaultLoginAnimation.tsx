import { useState, useEffect } from 'react';
import { Lock, CheckCircle2 } from 'lucide-react';

interface VaultLoginAnimationProps {
  isVisible: boolean;
  onComplete: () => void;
}

export function VaultLoginAnimation({ isVisible, onComplete }: VaultLoginAnimationProps) {
  const [animationPhase, setAnimationPhase] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    console.log('[VAULT_LOGIN_ANIMATION] Starting simplified vault animation');

    const phases = [
      { delay: 0, action: () => { console.log('[VAULT_LOGIN_ANIMATION] Phase 1: Lock secured'); setAnimationPhase(1); } },
      { delay: 800, action: () => { console.log('[VAULT_LOGIN_ANIMATION] Phase 2: Authenticating'); setAnimationPhase(2); } },
      { delay: 1600, action: () => { console.log('[VAULT_LOGIN_ANIMATION] Phase 3: Unlocking'); setAnimationPhase(3); } },
      { delay: 2000, action: () => {
        console.log('[VAULT_LOGIN_ANIMATION] Phase 4: Access granted');
        setAnimationPhase(4);
        setTimeout(() => {
          console.log('[VAULT_LOGIN_ANIMATION] Calling onComplete callback');
          onComplete();
        }, 400);
      } },
    ];

    const timers = phases.map(({ delay, action }) =>
      setTimeout(action, delay)
    );

    return () => {
      console.log('[VAULT_LOGIN_ANIMATION] Cleaning up animation timers');
      timers.forEach(clearTimeout);
    };
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-8 max-w-md mx-auto p-8">
        {/* Simple Lock Animation */}
        <div className="relative w-32 h-32 mx-auto">
          {/* Vault Background */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl transition-all duration-1000">
            <div className="absolute inset-2 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center">
              {/* Lock Icon - Main Focus */}
              <div className={`transition-all duration-700 ${
                animationPhase >= 3 ? 'scale-125 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
              }`}>
                <Lock className={`w-16 h-16 transition-all duration-500 ${
                  animationPhase >= 2 ? 'text-yellow-400' : 'text-slate-400'
                }`} />
              </div>

              {/* Success Check */}
              <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
                animationPhase >= 4 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
              }`}>
                <CheckCircle2 className="w-16 h-16 text-green-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Simple Status Messages */}
        <div className="space-y-4 min-h-[60px]">
          <div className={`transition-all duration-700 ${
            animationPhase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}>
            <p className="text-lg font-semibold text-foreground">Securing your vault...</p>
          </div>

          <div className={`transition-all duration-700 ${
            animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}>
            <p className="text-sm text-muted-foreground">Authenticating credentials</p>
          </div>

          <div className={`transition-all duration-700 ${
            animationPhase >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}>
            <p className="text-sm text-muted-foreground">Unlocking access</p>
          </div>

          {animationPhase >= 4 && (
            <div className="transition-all duration-700 opacity-100 translate-y-0">
              <p className="text-lg font-semibold text-green-600">Access granted!</p>
            </div>
          )}
        </div>

        {/* Simple Progress Indicator */}
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-slate-600 to-green-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(animationPhase / 4) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}