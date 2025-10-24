import { useState, useRef, useEffect } from 'react';
import { Camera, X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/services/apiClient';
import { useAuth } from '@/hooks/useAuth';
import { getAvatarUrl } from '@/utils/avatarHelpers';

interface ProfileImageUploadProps {
  avatarUrl?: string;
  userName: string;
  size?: 'sm' | 'md' | 'lg';
  editable?: boolean;
  onUploadComplete?: (url: string) => void;
}

export function ProfileImageUpload({
  avatarUrl,
  userName,
  size = 'md',
  editable = false,
  onUploadComplete,
}: ProfileImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(avatarUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, accessToken, refreshProfile } = useAuth();
  const { toast } = useToast();

  // Update preview URL when user profile changes (cache busting)
  useEffect(() => {
    const cacheBustedUrl = getAvatarUrl(avatarUrl, user?.profile_updated_at);
    setPreviewUrl(cacheBustedUrl);
  }, [avatarUrl, user?.profile_updated_at]);

  // Size classes
  const sizeClasses = {
    sm: 'w-10 h-10 text-xs',
    md: 'w-20 h-20 text-lg',
    lg: 'w-32 h-32 text-2xl',
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !accessToken) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Image must be smaller than 5MB',
        variant: 'destructive',
      });
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    setUploading(true);
    try {
      const result = await apiClient.uploadAvatar(file, {
        userId: user.id,
        accessToken,
      });

      await refreshProfile();

      toast({
        title: 'Success',
        description: 'Profile picture updated',
      });

      onUploadComplete?.(result.avatar_url);
    } catch (error) {
      console.error('Upload failed:', error);
      setPreviewUrl(avatarUrl);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !accessToken) return;

    setUploading(true);
    try {
      await apiClient.deleteAvatar({ userId: user.id, accessToken });
      setPreviewUrl(undefined);
      await refreshProfile();

      toast({
        title: 'Success',
        description: 'Profile picture removed',
      });

      onUploadComplete?.('');
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="relative inline-block">
      <Avatar className={sizeClasses[size]}>
        <AvatarImage src={previewUrl} alt={userName} />
        <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
          {getInitials(userName)}
        </AvatarFallback>
      </Avatar>

      {editable && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Upload button */}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-4 w-4" />
          </Button>

          {/* Delete button - only show if there's an image */}
          {previewUrl && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-0 right-0 h-6 w-6 rounded-full shadow-lg"
              onClick={handleDelete}
              disabled={uploading}
            >
              <X className="h-3 w-3" />
            </Button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      )}

      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
        </div>
      )}
    </div>
  );
}