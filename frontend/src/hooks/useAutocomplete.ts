import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/services/apiClient';
import { parseAtRefs } from '@/components/chat/utils/chatUtils';
import type { UnifiedSuggestion, SelectedContextItem } from '@/components/chat/types/chat';
import type { User } from '@/types/auth';

interface UseAutocompleteProps {
  user?: User;
  accessToken?: string;
  inputMessage: string;
  setInputMessage: (message: string) => void;
  setSelectedContextItems: (items: SelectedContextItem[] | ((prev: SelectedContextItem[]) => SelectedContextItem[])) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

interface UseAutocompleteReturn {
  // Autocomplete state
  showAutocomplete: boolean;
  autocompleteType: 'unified' | null;
  autocompleteQuery: string;
  selectedAutocompleteIndex: number;
  cursorPosition: number;
  unifiedSuggestions: UnifiedSuggestion[];

  // Autocomplete actions
  setAutocompleteQuery: (query: string) => void;
  setAutocompleteType: (type: 'unified' | null) => void;
  setSelectedAutocompleteIndex: (index: number) => void;
  setCursorPosition: (position: number) => void;

  // Autocomplete functions
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  selectUnifiedSuggestion: (suggestion: UnifiedSuggestion) => void;
  handleAutocompleteNavigation: (
    direction: 'up' | 'down' | 'enter' | 'escape'
  ) => void;
}

export function useAutocomplete({
  user,
  accessToken,
  inputMessage,
  setInputMessage,
  setSelectedContextItems,
  inputRef
}: UseAutocompleteProps): UseAutocompleteReturn {
  // Autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<'unified' | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [unifiedSuggestions, setUnifiedSuggestions] = useState<UnifiedSuggestion[]>([]);

  // Handle input changes with autocomplete logic
  const handleInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setInputMessage(value);
    setCursorPosition(cursorPos);

    // Sync selected context items with message content
    const currentRefs = parseAtRefs(value);

    // Remove items that are no longer in the message
    setSelectedContextItems(prev => {
      return prev.filter(item => {
        const isStillReferenced = currentRefs.some(ref => {
          const normalizedRef = ref.toLowerCase();
          const normalizedName = item.name.toLowerCase();
          return normalizedRef === normalizedName;
        });
        return isStillReferenced;
      });
    });

    // Check if we're typing @ for unified suggestions
    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\S*)$/);

    if (atMatch && user && accessToken) {
      // Unified autocomplete for both folders and files
      const query = atMatch[1];
      setAutocompleteQuery(query);
      setAutocompleteType('unified');
      setShowAutocomplete(true);
      setSelectedAutocompleteIndex(0);

      try {
        const auth = { userId: user.id, accessToken };
        const suggestions = await apiClient.getUnifiedSuggestions(query, auth, 25);
        console.log('Unified suggestions received:', suggestions);
        setUnifiedSuggestions(suggestions as UnifiedSuggestion[]);
      } catch (error) {
        console.error('Failed to fetch unified suggestions:', error);
        setUnifiedSuggestions([]);
      }
    } else {
      setShowAutocomplete(false);
      setAutocompleteType(null);
      setUnifiedSuggestions([]);
    }
  }, [user, accessToken, setInputMessage, setSelectedContextItems]);

  // Handle unified autocomplete selection
  const selectUnifiedSuggestion = useCallback((suggestion: UnifiedSuggestion) => {
    const textBeforeCursor = inputMessage.substring(0, cursorPosition);
    const textAfterCursor = inputMessage.substring(cursorPosition);
    const atMatch = textBeforeCursor.match(/@(\S*)$/);

    if (atMatch) {
      const beforeAt = textBeforeCursor.substring(0, atMatch.index);
      // If name contains spaces, wrap it in quotes
      const formattedName = suggestion.name.includes(' ') ? `"${suggestion.name}"` : suggestion.name;
      const newText = beforeAt + '@' + formattedName + ' ' + textAfterCursor;

      setInputMessage(newText);
      setShowAutocomplete(false);

      // Add to selected context items
      setSelectedContextItems(prev => {
        const exists = prev.some(item => item.id === suggestion.id && item.type === suggestion.type);
        if (exists) return prev;
        return [...prev, {
          id: suggestion.id,
          name: suggestion.name,
          type: suggestion.type
        }];
      });

      // Focus back to input and set cursor position
      setTimeout(() => {
        if (inputRef.current) {
          const newCursorPos = beforeAt.length + formattedName.length + 2; // +2 for @ and space
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  }, [inputMessage, cursorPosition, setInputMessage, setSelectedContextItems, inputRef]);

  // Handle keyboard navigation for autocomplete
  const handleAutocompleteNavigation = useCallback((direction: 'up' | 'down' | 'enter' | 'escape') => {
    if (!showAutocomplete || autocompleteType !== 'unified') return;

    const items = unifiedSuggestions;

    switch (direction) {
      case 'down':
        if (items.length > 0) {
          const newIndex = selectedAutocompleteIndex < items.length - 1 ? selectedAutocompleteIndex + 1 : 0;
          setSelectedAutocompleteIndex(newIndex);
        }
        break;

      case 'up':
        if (items.length > 0) {
          const newIndex = selectedAutocompleteIndex > 0 ? selectedAutocompleteIndex - 1 : items.length - 1;
          setSelectedAutocompleteIndex(newIndex);
        }
        break;

      case 'enter':
        if (items[selectedAutocompleteIndex]) {
          selectUnifiedSuggestion(items[selectedAutocompleteIndex]);
        }
        break;

      case 'escape':
        setShowAutocomplete(false);
        setAutocompleteType(null);
        break;
    }
  }, [showAutocomplete, autocompleteType, unifiedSuggestions, selectedAutocompleteIndex, selectUnifiedSuggestion]);

  return {
    // State
    showAutocomplete,
    autocompleteType,
    autocompleteQuery,
    selectedAutocompleteIndex,
    cursorPosition,
    unifiedSuggestions,

    // Actions
    setAutocompleteQuery,
    setAutocompleteType,
    setSelectedAutocompleteIndex,
    setCursorPosition,

    // Functions
    handleInputChange,
    selectUnifiedSuggestion,
    handleAutocompleteNavigation
  };
}