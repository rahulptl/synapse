import { Brain } from 'lucide-react';

interface ChatStatusBarProps {
  isConnected: boolean;
  isConnecting: boolean;
}

export const ChatStatusBar = ({ isConnected, isConnecting }: ChatStatusBarProps) => {
  return (
    <>
      {/* WebSocket Connection Status */}
      {isConnecting && (
        <div className="flex items-center justify-center space-x-2 text-sidebar-muted bg-sidebar-accent/50 border border-sidebar-border rounded-lg px-3 py-2">
          <div className="animate-spin">
            <Brain className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs">Connecting...</span>
        </div>
      )}

      {isConnected && (
        <div className="flex items-center justify-center space-x-2 text-sidebar-muted bg-sidebar-accent/30 border border-sidebar-border rounded-lg px-3 py-1.5">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs">Connected</span>
        </div>
      )}
    </>
  );
};