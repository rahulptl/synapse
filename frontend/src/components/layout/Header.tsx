import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useChatStore } from '@/stores/chatStore';
import { LogOut, User, HardDrive, Menu, X, MessageSquare, Settings } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function Header() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const chatStore = useChatStore();
  const pendingCount = chatStore.getPendingResponsesCount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    { name: 'Memory', href: '/knowledge' },
    { name: 'Chat', href: '/chat' },
    { name: 'Settings', href: '/settings' },
  ];

  const isActive = (href: string) => location.pathname.startsWith(href);

  return (
    <header className="border-b border-sidebar-border bg-sidebar/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="relative flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          {/* Logo - Clean & Minimal */}
          <Link
            to="/"
            className="group flex items-center gap-2.5 transition-transform duration-200 hover:scale-[1.02]"
          >
            <HardDrive className="h-5 w-5 text-sidebar-primary transition-colors" />
            <span className="text-lg font-semibold text-sidebar-foreground">
              Memory Bay
            </span>
          </Link>

          {/* Desktop Navigation - Sidebar Style */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'relative px-4 py-2 text-sm font-medium transition-all duration-200',
                  'flex items-center gap-2 rounded-md',
                  isActive(item.href)
                    ? 'text-sidebar-foreground bg-sidebar-accent/50'
                    : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/30'
                )}
              >
                {/* Icon for Chat */}
                {item.name === 'Chat' && <MessageSquare className="h-4 w-4" />}

                <span>{item.name}</span>

                {/* Notification badge for Chat */}
                {item.name === 'Chat' && pendingCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-primary text-[10px] text-white font-bold">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}

                {/* Active bottom border */}
                {isActive(item.href) && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sidebar-primary" />
                )}
              </Link>
            ))}
          </nav>
        </div>

        {/* User section - Dropdown Menu */}
        <div className="flex items-center gap-2">
          {user && (
            <>
              {/* User Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden md:flex h-9 px-3 gap-2 text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-sidebar-primary/20 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-sidebar-primary" />
                    </div>
                    <span className="text-sm font-medium max-w-[120px] truncate">
                      {user.email?.split('@')[0] || 'User'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium text-sidebar-foreground">{user.email?.split('@')[0]}</p>
                    <p className="text-xs text-sidebar-muted truncate">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="flex items-center">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile: Just logout button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="md:hidden h-9 w-9 p-0 text-sidebar-icon hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden h-9 w-9 p-0 text-sidebar-icon hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation - Sidebar Style */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-sidebar-border bg-sidebar">
          <div className="px-4 py-2 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'block px-4 py-3 text-base font-medium rounded-md transition-all duration-200',
                  isActive(item.href)
                    ? 'bg-sidebar-accent text-sidebar-foreground'
                    : 'text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.name === 'Chat' && <MessageSquare className="h-5 w-5" />}
                    <span>{item.name}</span>
                  </div>

                  {/* Notification badge for Chat */}
                  {item.name === 'Chat' && pendingCount > 0 && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-primary text-xs text-white font-bold">
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}