import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Copy, Bookmark, Download, Share2, Trash2, MoreVertical, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Message } from '../../types/chat';

interface MobileMessageActionsProps {
  message: Message;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCopyMessage: (content: string) => void;
  onSaveMessage: (message: Message) => void;
  onDownloadMessage?: (message: Message) => void;
  onShareMessage?: (message: Message) => void;
  onDeleteMessage?: (messageId: string) => void;
  onSpeakMessage?: (content: string) => void;
  trigger?: React.ReactNode;
}

/**
 * Mobile-optimized message actions with slide-out bottom sheet
 * Features: touch-friendly actions, haptic feedback support, share functionality
 */
export function MobileMessageActions({
  message,
  isOpen,
  onOpenChange,
  onCopyMessage,
  onSaveMessage,
  onDownloadMessage,
  onShareMessage,
  onDeleteMessage,
  onSpeakMessage,
  trigger
}: MobileMessageActionsProps) {
  const { toast } = useToast();
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      onCopyMessage(message.content);
      onOpenChange(false);

      // Haptic feedback if available
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

      toast({
        title: 'Copied',
        description: 'Message copied to clipboard',
      });
    } catch (error) {
      console.error('Failed to copy message:', error);
      toast({
        title: 'Copy failed',
        description: 'Could not copy message to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleSave = () => {
    onSaveMessage(message);
    onOpenChange(false);

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 50, 50]);
    }

    toast({
      title: 'Saved',
      description: 'Message saved to knowledge base',
    });
  };

  const handleShare = async () => {
    if (onShareMessage) {
      onShareMessage(message);
      onOpenChange(false);
      return;
    }

    // Native share API
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Chat Message',
          text: message.content,
        });
        onOpenChange(false);
      } catch (error) {
        console.error('Failed to share message:', error);
      }
    } else {
      // Fallback: copy to clipboard
      handleCopy();
    }
  };

  const handleSpeak = () => {
    if (onSpeakMessage) {
      onSpeakMessage(message.content);
      setIsSpeaking(!isSpeaking);
      onOpenChange(false);
      return;
    }

    // Native speech synthesis
    if ('speechSynthesis' in window && !isSpeaking) {
      const utterance = new SpeechSynthesisUtterance(message.content);
      utterance.rate = 0.9;
      utterance.pitch = 1;

      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      speechSynthesis.speak(utterance);
      setIsSpeaking(true);
      onOpenChange(false);
    } else if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const handleDownload = () => {
    if (onDownloadMessage) {
      onDownloadMessage(message);
      onOpenChange(false);
      return;
    }

    // Default download as text file
    const blob = new Blob([message.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `message-${message.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onOpenChange(false);
    toast({
      title: 'Downloaded',
      description: 'Message downloaded as text file',
    });
  };

  const handleDelete = () => {
    if (onDeleteMessage && window.confirm('Delete this message?')) {
      onDeleteMessage(message.id);
      onOpenChange(false);

      // Strong haptic feedback for destructive action
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }

      toast({
        title: 'Deleted',
        description: 'Message deleted',
      });
    }
  };

  const actionButtons = [
    {
      icon: <Copy className="h-5 w-5" />,
      label: 'Copy',
      action: handleCopy,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      available: true
    },
    {
      icon: <Bookmark className="h-5 w-5" />,
      label: 'Save',
      action: handleSave,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      available: message.role === 'assistant' // Only save assistant messages
    },
    {
      icon: <Share2 className="h-5 w-5" />,
      label: 'Share',
      action: handleShare,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      available: true
    },
    {
      icon: <Volume2 className="h-5 w-5" />,
      label: isSpeaking ? 'Stop' : 'Speak',
      action: handleSpeak,
      color: isSpeaking ? 'text-red-400' : 'text-orange-400',
      bgColor: isSpeaking ? 'bg-red-500/10' : 'bg-orange-500/10',
      available: 'speechSynthesis' in window || !!onSpeakMessage
    },
    {
      icon: <Download className="h-5 w-5" />,
      label: 'Download',
      action: handleDownload,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      available: message.role === 'assistant' // Only download assistant messages
    },
    {
      icon: <Trash2 className="h-5 w-5" />,
      label: 'Delete',
      action: handleDelete,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      available: !!onDeleteMessage
    }
  ].filter(button => button.available);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      {trigger && (
        <SheetTrigger asChild>
          {trigger}
        </SheetTrigger>
      )}

      <SheetContent
        side="bottom"
        className="h-[40vh] bg-slate-900/95 backdrop-blur-xl border-white/10 rounded-t-2xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Handle */}
        <div className="flex justify-center py-2">
          <div className="w-12 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10">
          <h3 className="text-white font-medium">
            {message.role === 'user' ? 'User Message' : 'AI Response'}
          </h3>
          <p className="text-white/50 text-sm mt-1">
            {new Date(message.timestamp).toLocaleTimeString()}
          </p>
        </div>

        {/* Actions Grid */}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-3">
            {actionButtons.map((button, index) => (
              <Button
                key={index}
                variant="ghost"
                onClick={button.action}
                className={cn(
                  'h-16 p-4 flex flex-col items-center justify-center space-y-2 rounded-lg',
                  'transition-all duration-200 active:scale-95',
                  button.bgColor,
                  button.color,
                  'hover:opacity-80'
                )}
              >
                {button.icon}
                <span className="text-sm font-medium">{button.label}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Message Preview */}
        <div className="px-4 pb-4">
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-white/70 text-sm line-clamp-3">
              {message.content}
            </p>
            {message.content.length > 100 && (
              <p className="text-white/40 text-xs mt-1">
                {message.content.length} characters
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}