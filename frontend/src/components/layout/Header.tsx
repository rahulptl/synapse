import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { LogOut, User, Sparkles, Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Header() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    { name: 'Knowledge Base', href: '/knowledge' },
    { name: 'Chat', href: '/chat' },
    { name: 'Settings', href: '/settings' },
  ];

  const isActive = (href: string) => location.pathname.startsWith(href);

  return (
    <header className="border-b border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/95 backdrop-blur-2xl sticky top-0 z-50 shadow-2xl">
      {/* Animated gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5 animate-gradient-x opacity-50"></div>

      <div className="relative flex h-16 items-center justify-between px-4 md:px-8">
        <div className="flex items-center space-x-4 md:space-x-12">
          {/* Logo */}
          <Link
            to="/"
            className="group flex items-center space-x-2.5 hover:scale-105 transition-all duration-300"
          >
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-lg blur opacity-30 group-hover:opacity-60 transition duration-300"></div>
              <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 p-1.5 rounded-lg">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
            </div>
            <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Zyph
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`group relative px-4 py-2 text-sm font-medium transition-all duration-300 rounded-lg ${
                  isActive(item.href)
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {/* Active background */}
                {isActive(item.href) && (
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 rounded-lg border border-white/20 shadow-lg"></div>
                )}

                {/* Hover background */}
                <div className={`absolute inset-0 bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${isActive(item.href) ? 'hidden' : ''}`}></div>

                {/* Text */}
                <span className="relative z-10">{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* User section */}
        <div className="flex items-center space-x-2 md:space-x-3">
          {user && (
            <>
              <div className="hidden lg:flex items-center space-x-2.5 px-4 py-2 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
                  <User className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-300">{user.email}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="h-9 w-9 p-0 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20 transition-all duration-300 rounded-lg group"
              >
                <LogOut className="h-4 w-4 group-hover:scale-110 transition-transform duration-300" />
              </Button>
            </>
          )}

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden h-9 w-9 p-0 text-gray-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20 transition-all duration-300 rounded-lg"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-white/10 bg-slate-900/95 backdrop-blur-xl">
          <div className="px-4 py-2 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-3 text-base font-medium rounded-lg transition-all duration-300 ${
                  isActive(item.href)
                    ? 'bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 text-white border border-white/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}