import { Bot, Sparkles, Search, Folder } from 'lucide-react';
import { CONTEXT_HELPER_TEXT } from '../utils/chatConstants';
import { useState, useEffect } from 'react';
import type { User } from '@/types/auth';

interface ChatEmptyStateProps {
  user: User | null;
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

export const ChatEmptyState = ({ user }: ChatEmptyStateProps) => {
  // Get username following app patterns: full_name if available, fallback to email prefix
  const getUsername = (user: User | null) => {
    if (!user) return 'User';
    return user.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'User';
  };

  // Cycling greeting state
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Randomly select greeting every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setGreetingIndex((prev) => {
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
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 px-6">
        <div className="p-8 rounded-2xl bg-sidebar-accent/30 w-fit mx-auto">
          <Bot className="h-16 w-16 text-sidebar-icon" />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <h3 className={`text-3xl font-black text-white drop-shadow-lg transition-opacity duration-150 ${
              isTransitioning ? 'opacity-0' : 'opacity-100'
            }`}>
              {GREETINGS[greetingIndex].script}
            </h3>
            <div className="relative">
              <span className="text-3xl font-black bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-lg animate-pulse">
                {getUsername(user)}
              </span>
              <div className="absolute inset-0 blur-xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 -z-10"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};