import { apiClient } from '@/services/apiClient';
import { useToast } from '@/hooks/use-toast';
import { buildConversationTranscript } from '@/components/chat/utils/chatUtils';
import type { Message, Conversation } from '@/components/chat/types/chat';
import type { User } from '@/types/auth';

interface FileOperationsProps {
  user?: User;
  accessToken?: string;
  toast?: (options: any) => void;
}

/**
 * Handles conversation export functionality
 */
export async function exportConversation(
  conversationId: string,
  title: string,
  messages: Message[],
  toast?: (options: any) => void
) {
  try {
    const transcript = buildConversationTranscript(messages);
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_${conversationId.substring(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    toast?.({
      title: "Conversation exported",
      description: "The conversation has been exported successfully.",
    });
  } catch (error) {
    console.error('Error exporting conversation:', error);
    toast?.({
      title: "Failed to export conversation",
      description: "Unable to export the conversation. Please try again.",
      variant: "destructive",
    });
  }
}

/**
 * Downloads generated files from AI artifacts
 */
export async function downloadGeneratedFile(
  file: any,
  user?: User,
  accessToken?: string,
  toast?: (options: any) => void
) {
  try {
    if (!user || !accessToken) {
      toast?.({
        title: "Authentication Required",
        description: "Please log in to download files.",
        variant: "destructive",
      });
      return;
    }

    console.log('🔽 [DOWNLOAD] Starting download for file:', {
      filename: file.filename,
      url: file.url,
      type: file.type
    });

    // Create a proper download URL if needed
    let downloadUrl = file.url;

    // If it's a relative URL, make it absolute
    if (downloadUrl && !downloadUrl.startsWith('http')) {
      downloadUrl = `${window.location.origin}${downloadUrl}`;
    }

    // If we have a direct URL, download it directly
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.filename || 'download';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast?.({
        title: "Download Started",
        description: file.filename,
        duration: 3000,
      });
    } else {
      // Fallback: try to get file content via API
      const response = await apiClient.getGeneratedFile({
        userId: user.id,
        fileId: file.id,
        accessToken: accessToken
      });

      const blob = new Blob([response], { type: file.type || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename || 'generated_file';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast?.({
        title: "Download Complete",
        description: file.filename,
        duration: 3000,
      });
    }
  } catch (error) {
    console.error('Error downloading file:', error);
    toast?.({
      title: "Download Failed",
      description: `Failed to download ${file.filename}. Please try again.`,
      variant: "destructive",
    });
  }
}

/**
 * Downloads source files with detailed logging and error handling
 */
export async function downloadSourceFile(
  file: any,
  user?: User,
  accessToken?: string,
  toast?: (options: any) => void
) {
  try {
    if (!user || !accessToken) {
      toast?.({
        title: "Authentication Required",
        description: "Please log in to download files.",
        variant: "destructive",
      });
      return;
    }

    console.log('🔽 [DOWNLOAD SOURCE] Starting download for source file:', {
      filename: file.filename,
      url: file.url,
      type: file.content_type,
      metadata: file.file_metadata
    });

    let downloadUrl = file.url;

    // If it's a relative URL, make it absolute
    if (downloadUrl && !downloadUrl.startsWith('http')) {
      downloadUrl = `${window.location.origin}${downloadUrl}`;
    }

    // If we have a direct URL, use it
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = file.filename || file.file_metadata?.original_filename || 'source_file';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log('✅ [DOWNLOAD SOURCE] Direct URL download successful');

      toast?.({
        title: "Source File Downloaded",
        description: file.filename || 'Source file',
        duration: 3000,
      });
    } else {
      // Fallback: try to get file via API
      const response = await apiClient.downloadSourceFile({
        userId: user.id,
        fileId: file.id,
        accessToken: accessToken
      });

      // Determine content type from file metadata or response
      const contentType = file.content_type || file.file_metadata?.content_type || 'application/octet-stream';
      const filename = file.filename || file.file_metadata?.original_filename || 'source_file';

      const blob = new Blob([response], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('✅ [DOWNLOAD SOURCE] API download successful:', {
        filename,
        contentType,
        size: response.length
      });

      toast?.({
        title: "Source File Downloaded",
        description: filename,
        duration: 3000,
      });
    }
  } catch (error) {
    console.error('❌ [DOWNLOAD SOURCE] Error downloading source file:', {
      error,
      file,
      userId: user?.id
    });

    toast?.({
      title: "Download Failed",
      description: `Failed to download ${file.filename || 'source file'}. Please try again.`,
      variant: "destructive",
    });
  }
}

/**
 * Complete file operations utility object
 */
export const useFileOperations = ({ user, accessToken, toast }: FileOperationsProps = {}) => ({
  exportConversation: (conversationId: string, title: string, messages: Message[]) =>
    exportConversation(conversationId, title, messages, toast),

  downloadGeneratedFile: (file: any) =>
    downloadGeneratedFile(file, user, accessToken, toast),

  downloadSourceFile: (file: any) =>
    downloadSourceFile(file, user, accessToken, toast)
});