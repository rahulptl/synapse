import { Bot } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { User } from '@/types/auth';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface ChatEmptyStateProps {
  user: User | null;
  isKeyboardOpen?: boolean;
}

const GREETINGS = [
  { text: 'Hello', script: 'Hello' },
  { text: 'Namaste', script: 'नमस्ते' },
  { text: 'Hola', script: '¡Hola!' },
  { text: 'Bonjour', script: 'Bonjour' },
  { text: 'Ciao', script: 'Ciao' },
  { text: 'Olá', script: 'Olá' },
  { text: 'Konnichiwa', script: 'こんにちは' },
  { text: 'Annyeonghaseyo', script: '안녕하세요' },
  { text: 'Jambo', script: 'Jambo' },
  { text: 'Guten Tag', script: 'Guten Tag' },
  { text: 'Hej', script: 'Hej' },
  { text: 'Merhaba', script: 'Merhaba' }
];

export const ChatEmptyState = ({ user, isKeyboardOpen = false }: ChatEmptyStateProps) => {
  const getUsername = (currentUser: User | null) => {
    if (!currentUser) return 'User';
    return (
      currentUser.full_name?.split(' ')[0] ||
      currentUser.email?.split('@')[0] ||
      'User'
    );
  };

  const [greetingIndex, setGreetingIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setGreetingIndex(prev => {
          let newIndex;
          do {
            newIndex = Math.floor(Math.random() * GREETINGS.length);
          } while (newIndex === prev && GREETINGS.length > 1);
          return newIndex;
        });
        setIsTransitioning(false);
      }, 150);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const isMobile = useIsMobile();
  const showCondensed = isMobile && isKeyboardOpen;

  const greetingClass = cn(
    'text-3xl font-black text-white drop-shadow-lg transition-opacity duration-150',
    isTransitioning ? 'opacity-0' : 'opacity-100',
    showCondensed && 'text-2xl'
  );

  const usernameClass = cn(
    'text-3xl font-black bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-lg animate-pulse transition-all duration-300 ease-out',
    showCondensed && 'text-2xl'
  );

  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center px-6 min-h-full transition-all duration-300 ease-out',
        showCondensed ? 'justify-start pt-6' : 'justify-center'
      )}
    >
      <div
        className={cn(
          'text-center space-y-6 transition-all duration-300 ease-out',
          showCondensed && 'space-y-4 scale-95 translate-y-[-6px]'
        )}
      >
        <div
          className={cn(
            'relative w-fit mx-auto transition-transform duration-300 ease-out',
            showCondensed && 'scale-90'
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400/30 via-emerald-400/30 to-indigo-400/30 rounded-full blur-2xl animate-pulse" />
          <div className="relative p-8 rounded-2xl bg-sidebar-accent/30 shadow-2xl">
            <Bot className="h-16 w-16 text-sidebar-icon drop-shadow-lg" />
          </div>
        </div>
        <div className="space-y-4">
          <div
            className={cn(
              'flex items-center justify-center space-x-3 transition-all duration-300 ease-out',
              showCondensed && 'space-x-2'
            )}
          >
            <h3 className={greetingClass}>{GREETINGS[greetingIndex].script}</h3>
            <div className="relative">
              <span className={usernameClass}>{getUsername(user)}</span>
              <div className="absolute inset-0 blur-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 -z-10"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
