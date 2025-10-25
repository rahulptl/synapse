import { useState } from 'react';
import {
  Clock,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { SwipeableItem } from './SwipeableItem';
import type { KnowledgeItemMetadata } from '@/types/knowledge';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  content_type: string;
  source_url?: string;
  metadata?: KnowledgeItemMetadata | null;
  created_at: string;
  updated_at: string;
  is_chunked?: boolean;
  total_chunks?: number;
  processing_status?: string;
  vector_count?: number;
  vectors_with_embeddings?: number;
  is_searchable?: boolean;
}

interface MobileItemCardProps {
  item: KnowledgeItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

/**
 * Mobile-optimized item card with swipe actions
 * Features: status indicators, swipe to delete
 */
export function MobileItemCard({
  item,
  isSelected,
  onSelect,
  onDelete,
}: MobileItemCardProps) {
  const { user, accessToken } = useAuth();
  const { toast } = useToast();
  const [showSwipeHint, setShowSwipeHint] = useState(true);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  
  const getProcessingStatusIcon = (status?: string) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />;
      case 'completed':
        return <Loader2 className="h-3 w-3 text-green-400" />;
      case 'failed':
        return <Loader2 className="h-3 w-3 text-red-400" />;
      default:
        return null;
    }
  };

  
  return (
    <SwipeableItem
      onDelete={onDelete}
      onSwipe={() => setShowSwipeHint(false)}
    >
      <Card
        className={`transition-all duration-200 border-0 ${
          isSelected
            ? 'bg-gradient-to-r from-blue-500/25 to-purple-500/25 ring-1 ring-blue-400/50'
            : 'bg-white/8 active:bg-white/12'
        }`}
        onClick={() => onSelect()}
      >
        <CardContent className="p-3">
          {/* Compact Header - Always Visible */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-white leading-tight mb-1 line-clamp-2">
                {item.title}
              </h3>
              {item.processing_status && (
                  <div className="flex items-center gap-1">
                    {getProcessingStatusIcon(item.processing_status)}
                    <span className="text-xs text-gray-400">
                      {item.is_chunked && item.total_chunks
                        ? `${item.total_chunks} chunks`
                        : item.processing_status}
                    </span>
                  </div>
                )}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="h-3 w-3" />
              <span>{formatDate(item.created_at)}</span>
            </div>
          </div>

                  </CardContent>
      </Card>
    </SwipeableItem>
  );
}