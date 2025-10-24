import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Folder, FileText, Bookmark } from 'lucide-react';
import { getInitials, getAvatarUrl } from '@/utils/avatarHelpers';
import { renderMessageWithHashtags } from '../utils/chatUtils';
import type { Message, HashtagInfo } from '../types/chat';

interface UserMessageProps {
  message: Message;
  user?: {
    id: string;
    full_name?: string;
    avatar_url?: string;
    profile_updated_at?: string;
  } | null;
  hashtagInfo?: HashtagInfo;
  onSaveMessage: (message: Message) => void;
}

export const UserMessage = ({ message, user, hashtagInfo, onSaveMessage }: UserMessageProps) => {
  // Get cache-busted avatar URL
  const avatarUrl = getAvatarUrl(user?.avatar_url, user?.profile_updated_at);

  return (
    <div className="flex justify-end group">
      <div className="flex flex-row-reverse items-start gap-4 max-w-[80%]">
        {/* Avatar */}
        <Avatar className="flex-shrink-0">
          <AvatarImage
            src={avatarUrl}
            alt={user?.full_name || 'You'}
          />
          <AvatarFallback className="bg-sidebar-primary text-white text-xs font-semibold">
            {user?.full_name ? getInitials(user.full_name) : 'You'}
          </AvatarFallback>
        </Avatar>

        <div className="space-y-2 flex-1 min-w-0">
          <div className="relative bg-sidebar-primary text-white rounded-2xl rounded-tr-md shadow-md px-5 py-3 transition-opacity duration-200 hover:opacity-90">
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words font-medium">
              {hashtagInfo
                ? renderMessageWithHashtags(message.content, hashtagInfo)
                : message.content
              }
            </div>

            {/* Display context items if present in metadata */}
            {message.metadata?.context_items && message.metadata.context_items.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/20">
                <div className="flex flex-wrap gap-1.5">
                  {message.metadata.context_items.map((item: { id: string; type: string }, idx: number) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="text-xs bg-white/15 text-white/90 border-white/20"
                    >
                      {item.type === 'folder' ? <Folder className="h-3 w-3 mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                      @{item.id}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/15">
              <button
                onClick={() => onSaveMessage(message)}
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center space-x-1 text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded"
                title="Save to Memory"
              >
                <Bookmark className="h-3 w-3" />
                <span>Save</span>
              </button>
              <p className="text-xs opacity-70">
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};