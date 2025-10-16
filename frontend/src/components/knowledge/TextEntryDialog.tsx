import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X, Plus, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/apiClient';
import { TextEntry, KnowledgeItem } from '@/types/knowledge';
import { useToast } from '@/hooks/use-toast';

interface TextEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  onSuccess?: (item: KnowledgeItem) => void;
}

export function TextEntryDialog({
  open,
  onOpenChange,
  folderId,
  onSuccess
}: TextEntryDialogProps) {
  const { auth } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setDescription('');
    setTags([]);
    setTagInput('');
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onOpenChange(false);
    }
  };

  const addTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleTagInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const validateForm = (): string | null => {
    if (!title.trim()) {
      return 'Title is required';
    }
    if (title.length > 500) {
      return 'Title must be less than 500 characters';
    }
    if (!content.trim()) {
      return 'Content is required';
    }
    if (content.length > 10_000_000) {
      return 'Content is too large (max 10MB)';
    }
    if (!folderId) {
      return 'Please select a folder';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    if (!auth?.userId || !auth?.accessToken) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to create text entries",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const textEntryData: TextEntry = {
        title: title.trim(),
        content: content.trim(),
        folder_id: folderId,
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
      };

      const response = await apiClient.createTextEntry(textEntryData, {
        userId: auth.userId,
        accessToken: auth.accessToken,
      }) as { success: boolean; message: string; item: KnowledgeItem };

      if (response.success) {
        toast({
          title: "Success",
          description: response.message,
        });

        resetForm();
        onOpenChange(false);

        if (onSuccess && response.item) {
          onSuccess(response.item);
        }
      } else {
        throw new Error(response.message || 'Failed to create text entry');
      }
    } catch (error) {
      console.error('Failed to create text entry:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to create text entry',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const wordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
  const charCount = content.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Add Text Entry
          </DialogTitle>
          <DialogDescription>
            Create a new text entry in your knowledge base. This will be indexed for search.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title for your text entry"
              maxLength={500}
              disabled={isSubmitting}
              required
            />
            <div className="text-xs text-muted-foreground text-right">
              {title.length}/500 characters
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this text entry"
              maxLength={1000}
              disabled={isSubmitting}
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your text content here..."
              className="min-h-[200px] resize-y"
              maxLength={10_000_000}
              disabled={isSubmitting}
              required
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{wordCount} words, {charCount.toLocaleString()} characters</span>
              <span>Max 10MB</span>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags (optional)</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleTagInputKeyPress}
                placeholder="Add a tag and press Enter"
                disabled={isSubmitting}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={addTag}
                disabled={!tagInput.trim() || isSubmitting}
                size="sm"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:text-destructive"
                      disabled={isSubmitting}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-w-[100px]"
            >
              {isSubmitting ? 'Creating...' : 'Create Entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}