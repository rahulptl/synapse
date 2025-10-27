import { useState, useEffect } from 'react';
import { Lock, Plus, Key, CheckCircle2, Shield } from 'lucide-react';

interface VaultCreationAnimationProps {
  isVisible: boolean;
  onComplete: () => void;
}

export function VaultCreationAnimation({ isVisible, onComplete }: VaultCreationAnimationProps) {
  const [animationPhase, setAnimationPhase] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    console.log('[VAULT_CREATION_ANIMATION] Starting vault creation animation');

    const phases = [
      { delay: 0, action: () => { console.log('[VAULT_CREATION_ANIMATION] Phase 1: Creating vault'); setAnimationPhase(1); } },
      { delay: 1000, action: () => { console.log('[VAULT_CREATION_ANIMATION] Phase 2: Building structure'); setAnimationPhase(2); } },
      { delay: 2000, action: () => { console.log('[VAULT_CREATION_ANIMATION] Phase 3: Creating passkey'); setAnimationPhase(3); } },
      { delay: 3000, action: () => { console.log('[VAULT_CREATION_ANIMATION] Phase 4: Securing vault'); setAnimationPhase(4); } },
      { delay: 4000, action: () => { console.log('[VAULT_CREATION_ANIMATION] Phase 5: Vault ready'); setAnimationPhase(5); } },
      { delay: 5000, action: () => {
        console.log('[VAULT_CREATION_ANIMATION] Phase 6: Auto-logging into vault');
        setAnimationPhase(6);
        setTimeout(() => {
          console.log('[VAULT_CREATION_ANIMATION] Navigating to memory page');
          onComplete();
        }, 1500);
      } },
    ];

    const timers = phases.map(({ delay, action }) =>
      setTimeout(action, delay)
    );

    return () => {
      console.log('[VAULT_CREATION_ANIMATION] Cleaning up animation timers');
      timers.forEach(clearTimeout);
    };
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-8 max-w-md mx-auto p-8">
        {/* Vault Creation Animation */}
        <div className="relative w-32 h-32 mx-auto">
          {/* Vault Background */}
          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl transition-all duration-1000 ${
            animationPhase >= 2 ? 'scale-110' : 'scale-95 opacity-70'
          }`}>
            <div className="absolute inset-2 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center">

              {/* Phase 1-2: Plus Icon (Creating Vault) */}
              <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
                animationPhase >= 2 ? 'scale-125 opacity-0' : 'scale-100 opacity-100'
              }`}>
                <Plus className="w-16 h-16 text-blue-400" />
              </div>

              {/* Phase 3: Key Icon (Creating Passkey) */}
              <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
                animationPhase >= 3 && animationPhase < 4 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
              }`}>
                <Key className="w-16 h-16 text-yellow-400 animate-pulse" />
              </div>

              {/* Phase 4: Lock Icon (Securing Vault) */}
              <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
                animationPhase >= 4 && animationPhase < 5 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
              }`}>
                <Lock className="w-16 h-16 text-green-400" />
              </div>

              {/* Phase 5: Shield Icon (Vault Secured) */}
              <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
                animationPhase >= 5 && animationPhase < 6 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
              }`}>
                <Shield className="w-16 h-16 text-green-500" />
              </div>

              {/* Phase 6: Success Check */}
              <div className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
                animationPhase >= 6 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
              }`}>
                <CheckCircle2 className="w-16 h-16 text-green-600" />
              </div>
            </div>
          </div>

          {/* Building Effect */}
          {animationPhase >= 1 && animationPhase < 2 && (
            <div className="absolute inset-0 rounded-2xl border-2 border-blue-400 animate-pulse" />
          )}
        </div>

        {/* Creation Status Messages */}
        <div className="space-y-4 min-h-[80px]">
          <div className={`transition-all duration-700 ${
            animationPhase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}>
            <p className="text-lg font-semibold text-foreground">Creating your secure vault...</p>
          </div>

          <div className={`transition-all duration-700 ${
            animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}>
            <p className="text-sm text-muted-foreground">Building vault structure</p>
          </div>

          <div className={`transition-all duration-700 ${
            animationPhase >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Key className="w-4 h-4" />
              Creating your passkey
            </p>
          </div>

          <div className={`transition-all duration-700 ${
            animationPhase >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Lock className="w-4 h-4" />
              Securing your vault
            </p>
          </div>

          <div className={`transition-all duration-700 ${
            animationPhase >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Shield className="w-4 h-4" />
              Vault protection activated
            </p>
          </div>

          {animationPhase >= 6 && (
            <div className="space-y-2 transition-all duration-700 opacity-100 translate-y-0">
              <p className="text-lg font-semibold text-green-600 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Vault created successfully!
              </p>
              <p className="text-sm text-muted-foreground">Logging into your memory vault...</p>
            </div>
          )}
        </div>

        {/* Progress Indicator */}
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(animationPhase / 6) * 100}%` }}
          />
        </div>

        {/* Additional Info for Phase 6 */}
        {animationPhase >= 6 && (
          <div className="text-xs text-muted-foreground animate-pulse">
            Preparing your personal memory space...
          </div>
        )}
      </div>
    </div>
  );
}