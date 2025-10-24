import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Upload, Send, Brain, Folder, FileText, AlertTriangle, Bookmark } from 'lucide-react';
import { AI_DISCLAIMER } from '../utils/chatConstants';
import type { UnifiedSuggestion } from '../types/chat';

interface ChatInputProps {
  inputMessage: string;
  isLoading: boolean;
  placeholder: string;
  showAutocomplete: boolean;
  autocompleteType: 'unified' | null;
  unifiedSuggestions: UnifiedSuggestion[];
  selectedAutocompleteIndex: number;
  inputRef: React.RefObject<HTMLInputElement>;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSendMessage: () => void;
  onFileUploadClick: () => void;
  onSaveConversationClick: () => void;
  onSelectUnifiedSuggestion: (suggestion: UnifiedSuggestion) => void;
}

export const ChatInput = ({
  inputMessage,
  isLoading,
  placeholder,
  showAutocomplete,
  autocompleteType,
  unifiedSuggestions,
  selectedAutocompleteIndex,
  inputRef,
  onInputChange,
  onKeyPress,
  onSendMessage,
  onFileUploadClick,
  onSaveConversationClick,
  onSelectUnifiedSuggestion
}: ChatInputProps) => {

  return (
    <>
      {/* Input Area */}
      <div className="border-t border-sidebar-border bg-sidebar/80 backdrop-blur-xl p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Unified Autocomplete Dropdown - Above input */}
          {showAutocomplete && autocompleteType === 'unified' && (
            <div className="bg-sidebar-accent/95 backdrop-blur-xl border border-sidebar-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
              {unifiedSuggestions && unifiedSuggestions.length > 0 ? (
                unifiedSuggestions.map((suggestion, index) => (
                  <div
                    key={`${suggestion.type}-${suggestion.id}`}
                    data-suggestion-index={index}
                    className={`px-4 py-2.5 cursor-pointer flex items-center transition-colors ${
                      index === selectedAutocompleteIndex
                        ? 'bg-sidebar-primary text-white'
                        : 'hover:bg-sidebar-accent text-sidebar-foreground'
                    }`}
                    style={{ paddingLeft: `${12 + suggestion.depth * 20}px` }}
                    onClick={() => onSelectUnifiedSuggestion(suggestion)}
                  >
                    {suggestion.type === 'folder' ? (
                      <>
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <Folder className={`h-4 w-4 flex-shrink-0 ${suggestion.has_children ? 'text-blue-400' : 'text-blue-300'}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{suggestion.name}</div>
                            {suggestion.path && (
                              <div className="text-xs text-gray-400 truncate">{suggestion.path}</div>
                            )}
                          </div>
                          {suggestion.has_children && (
                            <div className="text-xs text-gray-400">
                              <span className="inline-block w-4 h-4 text-center">▶</span>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center space-x-3 min-w-0 flex-1">
                          <FileText className="h-4 w-4 text-purple-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{suggestion.name}</div>
                            <div className="text-xs text-gray-400 truncate">
                              in {suggestion.folder_name}
                            </div>
                          </div>
                          {suggestion.content_type && (
                            <span className="text-xs flex-shrink-0 px-2 py-1 border border-sidebar-border rounded">
                              {suggestion.content_type.split('/')[0] || 'file'}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-sidebar-muted">
                  No folders or files available
                </div>
              )}

              {/* Instructions */}
              <div className="px-4 py-2 text-xs text-sidebar-muted border-t border-sidebar-border bg-sidebar-accent/50 rounded-b-xl">
                ↑↓ Navigate • Tab/Enter Select • Esc Close
              </div>
            </div>
          )}

          {/* Input Bar */}
          <div className="relative flex items-end space-x-3">
            {/* File Upload Button */}
            <Button
              onClick={onFileUploadClick}
              variant="ghost"
              className="h-12 w-12 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-icon hover:text-sidebar-foreground transition-colors"
              title="Upload files to Memory"
            >
              <Upload className="h-4 w-4" />
            </Button>

            {/* Save Conversation Button */}
            <Button
              onClick={onSaveConversationClick}
              variant="ghost"
              className="h-12 w-12 rounded-lg bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-icon hover:text-sidebar-foreground transition-colors"
              title="Save conversation to Memory"
            >
              <Bookmark className="h-4 w-4" />
            </Button>

            {/* Input Field */}
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={inputMessage}
                onChange={onInputChange}
                onKeyDown={onKeyPress}
                placeholder={placeholder}
                className="chat-input w-full h-12 px-4 py-3 bg-sidebar-accent/50 border border-sidebar-border rounded-lg shadow-sm hover:bg-sidebar-accent/60 focus:bg-sidebar-accent/60 transition-colors focus:border-sidebar-primary focus:outline-none focus:ring-0 placeholder:text-sidebar-muted text-sidebar-foreground text-base"
                disabled={isLoading}
              />
            </div>

            {/* Send Button */}
            <Button
              onClick={onSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className={`h-12 w-12 rounded-lg transition-colors ${
                inputMessage.trim() && !isLoading
                  ? 'bg-sidebar-primary hover:bg-sidebar-primary/90 text-white'
                  : 'bg-sidebar-accent text-sidebar-muted hover:bg-sidebar-accent/80'
              }`}
            >
              {isLoading ? (
                <div className="animate-spin">
                  <Brain className="h-4 w-4" />
                </div>
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Filter Hint */}
          <div className="flex items-center justify-center space-x-1.5 text-xs text-sidebar-muted">
            <span>Use</span>
            <code className="bg-sidebar-accent text-sidebar-foreground px-1.5 py-0.5 rounded font-mono">@</code>
            <span>to reference files and folders</span>
          </div>

          {/* AI Disclaimer */}
          <div className="flex items-center justify-center space-x-2 text-xs text-sidebar-muted bg-sidebar-accent/30 border border-sidebar-border rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{AI_DISCLAIMER}</span>
          </div>
        </div>
      </div>
    </>
  );
};
