import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Upload, Send, Brain, Bookmark, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedSuggestion } from '../../types/chat';

interface MobileChatInputProps {
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
  isKeyboardVisible: boolean;
}

/**
 * Mobile-optimized chat input with keyboard-aware positioning and touch-friendly controls
 * Features: adaptive layout when keyboard appears, large touch targets, voice input placeholder
 */
export function MobileChatInput({
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
  onSelectUnifiedSuggestion,
  isKeyboardVisible
}: MobileChatInputProps) {
  const handleVoiceInput = () => {
    // Placeholder for future voice input implementation
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      console.log('[MOBILE_CHAT_INPUT] 🎤 Voice input requested');
      // Future: Implement voice input
    }
  };

  // Dynamic styles based on keyboard visibility
  const inputContainerStyle = cn(
    'border-t border-white/10 bg-white/5 backdrop-blur-xl p-4 transition-all duration-300 ease-out',
    isKeyboardVisible ? 'pb-2' : 'pb-4'
  );

  const inputStyle = cn(
    'w-full h-12 px-4 py-3 bg-white/10 border border-white/20 rounded-lg shadow-sm',
    'focus:bg-white/15 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20',
    'placeholder:text-white/50 text-white text-lg',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'transition-all duration-200'
  );

  const buttonStyle = cn(
    'h-12 px-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2',
    'min-w-[44px] min-h-[44px]' // iOS touch target guidelines
  );

  return (
    <div className={inputContainerStyle}>
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Autocomplete Dropdown */}
        {showAutocomplete && autocompleteType === 'unified' && (
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl shadow-lg max-h-64 overflow-y-auto mb-3">
            {unifiedSuggestions && unifiedSuggestions.length > 0 ? (
              unifiedSuggestions.map((suggestion, index) => (
                <div
                  key={suggestion.id}
                  className={cn(
                    'p-3 cursor-pointer transition-colors border-b border-white/10 last:border-b-0',
                    'hover:bg-white/10 active:bg-white/15',
                    index === selectedAutocompleteIndex && 'bg-blue-500/20 border-blue-400/30'
                  )}
                  onClick={() => onSelectUnifiedSuggestion(suggestion)}
                >
                  <div className="flex items-center space-x-3">
                    <div className="text-white/70">
                      {suggestion.type === 'file' ? <Upload className="h-4 w-4" /> :
                       suggestion.type === 'folder' ? <Bookmark className="h-4 w-4" /> :
                       <Brain className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium truncate">
                        {suggestion.display_name || suggestion.name}
                      </div>
                      <div className="text-white/50 text-sm truncate">
                        {suggestion.type === 'file' ? 'File' :
                         suggestion.type === 'folder' ? 'Folder' :
                         'Suggestion'}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-white/50 text-center">
                No suggestions found
              </div>
            )}
          </div>
        )}

        {/* Input Layout - Adaptive based on content */}
        {inputMessage.trim() && !isLoading ? (
          /* Expanded layout when there's text to send */
          <div className="flex items-center space-x-3">
            {/* Primary Actions */}
            <div className="flex items-center space-x-2 flex-1">
              <Button
                variant="ghost"
                onClick={onFileUploadClick}
                className={cn(buttonStyle, 'bg-white/10 hover:bg-white/20 text-white')}
                title="Upload files"
              >
                <Upload className="h-5 w-5" />
              </Button>

              <Input
                ref={inputRef}
                value={inputMessage}
                onChange={onInputChange}
                onKeyDown={onKeyPress}
                placeholder={placeholder}
                className={cn(inputStyle, 'flex-1')}
                disabled={isLoading}
                autoFocus={isKeyboardVisible}
              />
            </div>

            {/* Send Button */}
            <Button
              onClick={onSendMessage}
              className={cn(
                buttonStyle,
                'bg-blue-500 hover:bg-blue-600 text-white shadow-lg',
                'animate-in slide-in-from-right duration-200'
              )}
              title="Send message"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        ) : (
          /* Compact layout when input is empty */
          <div className="space-y-3">
            {/* Main Input Row */}
            <div className="flex items-center space-x-3">
              <Input
                ref={inputRef}
                value={inputMessage}
                onChange={onInputChange}
                onKeyDown={onKeyPress}
                placeholder={placeholder}
                className={cn(inputStyle, 'flex-1')}
                disabled={isLoading}
                autoFocus={isKeyboardVisible}
              />

              {/* Voice Input Button */}
              <Button
                variant="ghost"
                onClick={handleVoiceInput}
                className={cn(buttonStyle, 'bg-white/10 hover:bg-white/20 text-white')}
                title="Voice input (coming soon)"
                disabled={true} // Enable when voice input is implemented
              >
                <Mic className="h-5 w-5" />
              </Button>
            </div>

            {/* Secondary Actions */}
            <div className="flex justify-center space-x-3">
              <Button
                variant="ghost"
                onClick={onFileUploadClick}
                className={cn(
                  buttonStyle,
                  'bg-white/10 hover:bg-white/20 text-white px-6'
                )}
                title="Upload files to Memory"
              >
                <Upload className="h-4 w-4 mr-2" />
                <span className="text-sm font-medium">Upload</span>
              </Button>

              <Button
                variant="ghost"
                onClick={onSaveConversationClick}
                className={cn(
                  buttonStyle,
                  'bg-white/10 hover:bg-white/20 text-white px-6'
                )}
                title="Save conversation to Memory"
              >
                <Bookmark className="h-4 w-4 mr-2" />
                <span className="text-sm font-medium">Save Chat</span>
              </Button>
            </div>
          </div>
        )}

        {/* Helper Text */}
        <div className="flex items-center justify-center space-x-1.5 text-xs text-white/50">
          <span>Use</span>
          <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-white/70">@</code>
          <span>to reference files and folders</span>
        </div>

        {/* Keyboard awareness indicator */}
        {isKeyboardVisible && (
          <div className="flex items-center justify-center text-xs text-blue-400 animate-pulse">
            <Brain className="h-3 w-3 mr-1" />
            AI is ready when you are
          </div>
        )}
      </div>
    </div>
  );
}