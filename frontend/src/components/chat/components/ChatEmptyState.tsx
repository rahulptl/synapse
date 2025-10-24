import { Bot, Sparkles, Search, Folder } from 'lucide-react';
import { CONTEXT_HELPER_TEXT } from '../utils/chatConstants';

export const ChatEmptyState = () => {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 px-6">
        <div className="p-8 rounded-2xl bg-sidebar-accent/30 w-fit mx-auto">
          <Bot className="h-16 w-16 text-sidebar-icon" />
        </div>
        <div className="space-y-3">
          <h3 className="text-xl font-semibold text-sidebar-foreground">
            Start a conversation
          </h3>
          <p className="text-sidebar-muted max-w-md mx-auto">
            Chat with your AI assistant about your knowledge base. Use <code className="bg-sidebar-accent text-sidebar-foreground px-1.5 py-0.5 rounded font-mono text-xs">@</code> {CONTEXT_HELPER_TEXT}.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <div className="flex items-center space-x-1.5 bg-sidebar-accent/50 border border-sidebar-border px-3 py-1.5 rounded-lg">
            <Sparkles className="h-3.5 w-3.5 text-sidebar-icon" />
            <span className="text-xs text-sidebar-muted">AI-powered</span>
          </div>
          <div className="flex items-center space-x-1.5 bg-sidebar-accent/50 border border-sidebar-border px-3 py-1.5 rounded-lg">
            <Search className="h-3.5 w-3.5 text-sidebar-icon" />
            <span className="text-xs text-sidebar-muted">Semantic search</span>
          </div>
          <div className="flex items-center space-x-1.5 bg-sidebar-accent/50 border border-sidebar-border px-3 py-1.5 rounded-lg">
            <Folder className="h-3.5 w-3.5 text-sidebar-icon" />
            <span className="text-xs text-sidebar-muted">Folder filtering</span>
          </div>
        </div>
      </div>
    </div>
  );
};