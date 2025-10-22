import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SidebarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
}

export function SidebarSearch({
  value,
  onChange,
  placeholder = 'Search folders...',
  onFocus,
  onBlur,
  className,
}: SidebarSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Listen for Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  return (
    <div className={cn('px-4 py-3', className)}>
      <div className="relative group">
        {/* Search Icon */}
        <Search
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-200',
            isFocused ? 'text-sidebar-primary' : 'text-sidebar-icon'
          )}
        />

        {/* Input */}
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={cn(
            'pl-9 pr-20 h-9',
            'bg-sidebar-accent/50 border-sidebar-border',
            'text-sidebar-foreground placeholder:text-sidebar-muted',
            'focus:bg-sidebar-accent focus:border-sidebar-primary',
            'transition-all duration-200'
          )}
        />

        {/* Clear Button & Shortcut Hint */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button
              onClick={handleClear}
              className="p-1 rounded hover:bg-sidebar-background/50 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3 w-3 text-sidebar-muted hover:text-sidebar-foreground" />
            </button>
          )}

          {/* Keyboard Shortcut Hint */}
          {!value && !isFocused && (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-sidebar-muted bg-sidebar-background/50 border border-sidebar-border rounded">
              <span>⌘</span>
              <span>K</span>
            </kbd>
          )}
        </div>
      </div>
    </div>
  );
}
